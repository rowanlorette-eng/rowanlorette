const params = new URLSearchParams(location.search)
let id = params.get("v")

const player = document.getElementById("player")
const playPause = document.getElementById("playPause")
const seek = document.getElementById("seek")
const volume = document.getElementById("volume")
const time = document.getElementById("time")
const statusEl = document.getElementById("status")
const overlay = document.getElementById("overlay")
const bigPlay = document.getElementById("bigPlay")
const fullscreen = document.getElementById("fullscreen")
const muteBtn = document.getElementById("muteBtn")
const buffer = document.getElementById("buffer")
const controls = document.getElementById("controls")
const videoWrapper = document.getElementById("videoWrapper")

let lastVolume = 1
const AUTO_HIDE_MS = 3000
let hideTimer = null

async function load() {
  if (!id) {
    const resp = await fetch("/api/random")
    if (!resp.ok) {
      document.body.innerHTML = "<h2>Нет видео для просмотра</h2>"
      return
    }
    id = await resp.text()
    location.search = "?v=" + id
    return
  }

  const video = await fetch(`/api/video/${id}`).then(r => r.json())

  if (video.status === "processing") {
    statusEl.innerText = "Видео обрабатывается..."
    setTimeout(load, 1000)
    return
  }

  if (video.status === "error") {
    statusEl.innerText = "Ошибка транскодинга"
    return
  }

  //statusEl.innerText = "Готово"

  const url = video.stream_url + "/index.m3u8"

  if (Hls.isSupported()) {
    const hls = new Hls()
    hls.loadSource(url)
    hls.attachMedia(player)

    // буферинг
    hls.on(Hls.Events.LEVEL_LOADED, () => updateBuffer())
    hls.on(Hls.Events.FRAG_BUFFERED, () => updateBuffer())
  } else {
    player.src = url
  }

  const videos = await fetch("/api/videos").then(r => r.json())
  const list = document.getElementById("list")
  list.innerHTML = ""

  videos.forEach(v => {
    const item = document.createElement("div")
    item.className = "item"

    item.innerHTML = `
      <img class="thumb" src="${v.thumbnail}" />
      <div>
        <div class="itemTitle">${v.title}</div>
        <div class="itemStatus">${v.status === "processing" ? "Processing..." : "Ready"}</div>
      </div>
    `

    item.onclick = () => location.href = `watch?v=${v.id}`
    list.appendChild(item)
  })
}

// show controls
function showControls() {
  controls.style.opacity = "1"
  controls.style.transform = "translateY(0)"
  seek.style.opacity = "1"
  seek.style.transform = "translateY(0)"
  buffer.style.opacity = "1"
  buffer.style.transform = "translateY(0)"

  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(hideControls, AUTO_HIDE_MS)
}

function hideControls() {
  controls.style.opacity = "0"
  controls.style.transform = "translateY(20px)"
  seek.style.opacity = "0"
  seek.style.transform = "translateY(20px)"
  buffer.style.opacity = "0"
  buffer.style.transform = "translateY(20px)"
}

// play/pause
playPause.onclick = () => {
  if (player.paused) {
    player.play()
  } else {
    player.pause()
  }
}

player.onclick = () => {
  if (player.paused) player.play()
  else player.pause()
}

player.onpause = () => {
  overlay.style.display = "flex"
  playPause.innerText = "▶"
  showControls()
}

player.onplay = () => {
  overlay.style.display = "none"
  playPause.innerText = "⏸"
  showControls()
}

bigPlay.onclick = () => {
  player.play()
  overlay.style.display = "none"
  showControls()
}

player.ontimeupdate = () => {
  const current = player.currentTime
  const duration = player.duration || 0

  seek.value = duration ? (current / duration) * 100 : 0

  const fmt = t => {
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  time.innerText = `${fmt(current)} / ${fmt(duration)}`
}

seek.oninput = () => {
  const duration = player.duration || 0
  player.currentTime = (seek.value / 100) * duration
}

// volume + mute
volume.oninput = () => {
  player.volume = volume.value
  lastVolume = volume.value
  updateMuteIcon()
}

muteBtn.onclick = () => {
  if (player.muted) {
    player.muted = false
    volume.value = lastVolume
  } else {
    player.muted = true
    volume.value = 0
  }
  updateMuteIcon()
}

function updateMuteIcon() {
  if (player.muted || player.volume === 0) {
    muteBtn.innerText = "🔇"
  } else {
    muteBtn.innerText = "🔊"
  }
}

// fullscreen
fullscreen.onclick = () => {
  if (!document.fullscreenElement) {
    videoWrapper.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

// buffer progress
function updateBuffer() {
  const buffered = player.buffered
  const duration = player.duration || 0
  if (!buffered.length || !duration) return

  const end = buffered.end(buffered.length - 1)
  const percent = (end / duration) * 100
  buffer.style.width = percent + "%"
}

// controls show/hide
videoWrapper.addEventListener("mousemove", showControls)
videoWrapper.addEventListener("click", showControls)
videoWrapper.addEventListener("mouseleave", hideControls)

// keyboard space
document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    const active = document.activeElement
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return
    e.preventDefault()

    if (player.paused) player.play()
    else player.pause()
  }
})

// start controls visible
showControls()

load()
