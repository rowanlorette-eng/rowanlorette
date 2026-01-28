const btn = document.getElementById("btn")
const status = document.getElementById("status")
const bar = document.getElementById("bar")
const watchBtn = document.getElementById("watchBtn")

const meta = document.getElementById("meta")
const titleInput = document.getElementById("title")
const durationText = document.getElementById("durationText")
const thumbSlider = document.getElementById("thumbSlider")
const thumbTimeText = document.getElementById("thumbTime")
const thumbImg = document.getElementById("thumbImg")
const saveBtn = document.getElementById("saveBtn")

let currentId = null
let fileDuration = 0
let selectedThumbTime = 0
let currentFile = null

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0")
  const s = Math.floor(sec % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

function setThumbTime(sec) {
  selectedThumbTime = sec
  thumbTimeText.innerText = formatTime(sec)
}

thumbSlider.oninput = () => {
  const pct = thumbSlider.value / 100
  const t = fileDuration * pct
  setThumbTime(t)
  generateThumbPreview(t)
}

async function generateThumbPreview(time) {
  const file = currentFile
  if (!file) return

  const url = URL.createObjectURL(file)
  const video = document.createElement("video")
  video.src = url

  await new Promise(r => {
    video.onloadedmetadata = () => {
      r()
    }
  })

  video.currentTime = time

  await new Promise(r => {
    video.onseeked = () => {
      r()
    }
  })

  const canvas = document.createElement("canvas")
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext("2d")
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  thumbImg.src = canvas.toDataURL("image/jpeg")
  URL.revokeObjectURL(url)
}

btn.onclick = async () => {
  const f = document.getElementById("f").files[0]
  if (!f) {
    alert("Выберите видео")
    return
  }

  currentFile = f

  const d = new FormData()
  d.append("video", f)

  // кнопка исчезает
  btn.classList.add("hide")

  status.innerText = "Загрузка видео..."
  bar.style.width = "0%"

  const xhr = new XMLHttpRequest()
  xhr.open("POST", "/api/upload")

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100)
      status.innerText = `Загрузка: ${pct}%`
      bar.style.width = pct + "%"
    }
  }

  xhr.onload = async () => {
    const id = xhr.responseText
    currentId = id

    status.innerText = "Видео загружено. Выберите настройки превью и название."
    bar.style.width = "100%"

    // показать форму meta
    meta.style.display = "block"

    // установить название файла
    titleInput.value = f.name

    // получить длительность видео
    const url = URL.createObjectURL(f)
    const video = document.createElement("video")
    video.src = url

    await new Promise(r => {
      video.onloadedmetadata = () => r()
    })

    fileDuration = video.duration
    durationText.innerText = formatTime(fileDuration)

    // ползунок по умолчанию в начале
    thumbSlider.value = 0
    setThumbTime(0)
    generateThumbPreview(0)

    URL.revokeObjectURL(url)
  }

  xhr.send(d)
}

saveBtn.onclick = async () => {
  if (!currentId) return

  saveBtn.disabled = true
  status.innerText = "Сохранение и публикация..."
  bar.style.width = "0%"

  const d = new FormData()
  d.append("id", currentId)
  d.append("title", titleInput.value)
  d.append("thumb_time", selectedThumbTime.toString())

  const res = await fetch("/api/publish", { method: "POST", body: d })
  const txt = await res.text()

  if (txt !== "ok") {
    status.innerText = "Ошибка публикации"
    saveBtn.disabled = false
    return
  }

  status.innerText = "Видео отправлено на обработку..."
  bar.style.width = "30%"

  // скрываем save кнопку
  saveBtn.style.display = "none"

  // проверяем статус каждые 1 сек
  while (true) {
    const r = await fetch(`/api/video/${currentId}`)
    const data = await r.json()

    if (data.status === "ready") {
      status.innerText = "Видео обработано успешно!"
      bar.style.width = "100%"

      watchBtn.style.display = "block"
      watchBtn.onclick = () => {
        location.href = `watch?v=${currentId}`
      }
      return
    }

    if (data.status === "error") {
      status.innerText = "Ошибка транскодинга. Попробуйте другое видео."
      bar.style.width = "0%"
      return
    }

    // processing
    if (data.progress && data.progress > 0) {
      status.innerText = `Обработка: ${data.progress}%`
      bar.style.width = data.progress + "%"
    } else {
      status.innerText = "В процессе обработки..."
      bar.style.width = "60%"
    }

    await new Promise(r => setTimeout(r, 1000))
  }
}
