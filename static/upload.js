const btn = document.getElementById("btn");
const status = document.getElementById("status");
const bar = document.getElementById("bar");
const watchBtn = document.getElementById("watchBtn");

const meta = document.getElementById("meta");
const titleInput = document.getElementById("title");
const durationText = document.getElementById("durationText");
const thumbSlider = document.getElementById("thumbSlider");
const thumbTimeText = document.getElementById("thumbTime");
const thumbImg = document.getElementById("thumbImg");
const saveBtn = document.getElementById("saveBtn");

const encodeStatus = document.getElementById("encodeStatus");
const encodeText = document.getElementById("encodeText");

const encodeWrapper = document.getElementById("encodeStatus");

const stagesContainer = document.getElementById("stages");

const allQualitiesCheckbox = document.getElementById("allQualities");

let stageMap = {}; // id → DOM элемент
let stagesOrder = []; // порядок стадий
let stagesInitialized = false;

// безопасный рендер стадий
function renderStages(stages) {
  if (!Array.isArray(stages)) return;

  stagesContainer.innerHTML = "";
  stageMap = {};
  stagesOrder = [];

  stages.forEach((stage) => {
    if (!stage || !stage.id) return;

    const div = document.createElement("div");
    div.className = "stageBox";
    div.textContent = stage.label || stage.id;

    stagesContainer.appendChild(div);

    stageMap[stage.id] = div;
    stagesOrder.push(stage.id);
  });

  stagesInitialized = true;
}

// универсальное применение стадии
function applyStage(currentStage) {
  if (!stagesInitialized) return;

  let reachedCurrent = false;

  for (let i = 0; i < stagesOrder.length; i++) {
    const id = stagesOrder[i];
    const el = stageMap[id];
    if (!el) continue;

    if (id === currentStage) {
      el.classList.add("active");
      el.classList.remove("done");
      reachedCurrent = true;
    } else if (!reachedCurrent) {
      el.classList.remove("active");
      el.classList.add("done");
    } else {
      el.classList.remove("active");
      el.classList.remove("done");
    }
  }
}

// завершение всех стадий
function finalizeStages() {
  Object.values(stageMap).forEach((el) => {
    el.classList.remove("active");
    el.classList.add("done");
  });

  const title = document.querySelector(".encodeTitle");
  if (title) {
    title.style.opacity = "0";
    title.style.height = "0";
    title.style.margin = "0";
    title.style.overflow = "hidden";
  }
}

let currentId = null;
let fileDuration = 0;
let selectedThumbTime = 0;
let currentFile = null;

function formatTime(sec) {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function setThumbTime(sec) {
  selectedThumbTime = sec;
  thumbTimeText.innerText = formatTime(sec);
}

thumbSlider.oninput = () => {
  const pct = thumbSlider.value / 100;
  const t = fileDuration * pct;
  setThumbTime(t);
  generateThumbPreview(t);
};

async function generateThumbPreview(time) {
  const file = currentFile;
  if (!file) return;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;

  await new Promise((r) => {
    video.onloadedmetadata = () => {
      r();
    };
  });

  video.currentTime = time;

  await new Promise((r) => {
    video.onseeked = () => {
      r();
    };
  });

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  thumbImg.src = canvas.toDataURL("image/jpeg");

  video.src = "";
  video.load();
  URL.revokeObjectURL(url);
}

btn.onclick = async () => {
  const f = document.getElementById("f").files[0];
  if (!f) {
    alert("Выберите видео или аудио");
    return;
  }

  if (f.size > 5 * 1024 * 1024 * 1024) {
    alert("Файл слишком большой");
    return;
  }

  btn.classList.add("hide");
  status.innerText = "Подготовка загрузки...";
  bar.style.width = "0%";

  meta.style.display = "block";
  titleInput.value = f.name;

  currentFile = f;

  const ext = f.name.split(".").pop().toLowerCase();
  const isAudio = ["mp3", "wav", "flac"].includes(ext);

  thumbSlider.disabled = isAudio;

  // --- блокируем saveBtn для аудио до готовности превью ---
  if (isAudio) {
    saveBtn.disabled = true;
    saveBtn.style.opacity = 0.5; // визуально показать, что недоступна
  } else {
    saveBtn.disabled = false;
    saveBtn.style.opacity = 1;
  }

  // --- создаём upload session ---
  const start = await fetch("/api/upload/start", { method: "POST" });
  const data = await start.json();
  const id = data.id;
  currentId = id;

  const CHUNK = 8 * 1024 * 1024;
  const totalChunks = Math.ceil(f.size / CHUNK);
  let uploaded = 0;

  try {
    for (let i = 0; i < totalChunks; i++) {
      const startByte = i * CHUNK;
      const endByte = Math.min(startByte + CHUNK, f.size);

      const chunk = f.slice(startByte, endByte);

      const form = new FormData();
      form.append("id", id);
      form.append("index", i);
      form.append("chunk", chunk);

      const res = await fetch("/api/upload/chunk", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        throw new Error("chunk upload failed");
      }

      uploaded++;

      const pct = Math.round((uploaded / totalChunks) * 100);

      status.innerText = `Загрузка: ${pct}%`;
      bar.style.width = pct + "%";
    }
  } catch (err) {
    console.error("Upload error:", err);

    status.innerText =
      "Ошибка загрузки. Проверьте соединение или попробуйте снова.";
    bar.style.width = "0%";

    btn.classList.remove("hide");

    return;
  }

  // --- merge chunks ---
  await fetch("/api/upload/finish", {
    method: "POST",
    body: JSON.stringify({ id, filename: f.name, total_chunks: totalChunks }),
    headers: { "Content-Type": "application/json" },
  });

  bar.style.width = "100%";

  if (isAudio) {
    status.innerText = "Обработка аудио и создание превью...";

    thumbImg.alt = "Loading preview...";
    let tries = 0;
    const maxTries = 20; // 20 попыток
    const wait = 500; // мс

    while (tries < maxTries) {
      const res = await fetch(`/api/stream/${id}/thumb.jpg`, {
        method: "HEAD",
      });
      if (res.ok) {
        thumbImg.src = `/api/stream/${id}/thumb.jpg`;
        thumbImg.alt = "Preview";
        status.innerText = "Превью готово!";
        saveBtn.disabled = false; // --- разблокируем saveBtn ---
        saveBtn.style.opacity = 1;
        break;
      }
      await new Promise((r) => setTimeout(r, wait));
      tries++;
    }

    if (!thumbImg.src) {
      thumbImg.alt = "Preview not available";
      status.innerText = "Не удалось создать превью.";
      saveBtn.disabled = true; // оставляем кнопку заблокированной
      saveBtn.style.opacity = 0.5;
    }
  } else {
    // --- video: генерация превью на лету ---
    const url = URL.createObjectURL(f);
    const video = document.createElement("video");
    video.src = url;
    await new Promise((r) => (video.onloadedmetadata = r));
    fileDuration = video.duration;
    durationText.innerText = formatTime(fileDuration);
    thumbSlider.value = 0;
    setThumbTime(0);
    await generateThumbPreview(0);
    URL.revokeObjectURL(url);
    saveBtn.disabled = false;
    saveBtn.style.opacity = 1;
    status.innerText = "Выберите кадр для превью и сохраните.";
  }
};

saveBtn.onclick = async () => {
  if (!currentId) return;

  saveBtn.disabled = true;
  status.innerText = "Сохранение и публикация...";
  bar.style.width = "0%";

  const d = new FormData();
  d.append("id", currentId);
  d.append("title", titleInput.value);
  d.append("thumb_time", selectedThumbTime.toString());
  d.append("all_qualities", allQualitiesCheckbox.checked ? "1" : "0");

  try {
    const res = await fetch("/api/upload/publish", { method: "POST", body: d });
    const txt = await res.text();

    if (txt !== "ok") {
      status.innerText = "Ошибка публикации";
      saveBtn.disabled = false;
      return;
    }
  } catch (e) {
    status.innerText = "Ошибка сети";
    saveBtn.disabled = false;
    return;
  }

  status.innerText = "Видео отправлено на обработку...";
  encodeStatus.style.display = "block";
  encodeWrapper.style.display = "block";
  bar.style.width = "30%";

  saveBtn.style.display = "none";

  let stopped = false;
  window.addEventListener("beforeunload", () => {
    stopped = true;
  });

  while (!stopped) {
    let data;

    try {
      const r = await fetch(`/api/video-status/${currentId}`);
      if (!r.ok) {
        status.innerText = "Ошибка связи с сервером";
        break;
      }
      data = await r.json();
    } catch (e) {
      status.innerText = "Ошибка сети";
      break;
    }

    // инициализация стадий один раз
    if (Array.isArray(data.stages) && data.stages.length > 0) {
      const newIds = data.stages.map((s) => s.id).join(",");
      const oldIds = stagesOrder.join(",");

      // если стадии изменились → перерендер
      if (!stagesInitialized || newIds !== oldIds) {
        renderStages(data.stages);
      }
    }

    // готово
    if (data.status === "ready") {
      status.innerText = "Видео обработано успешно!";
      bar.style.width = "100%";

      watchBtn.style.display = "block";
      watchBtn.onclick = () => {
        sessionStorage.setItem("autoplay", "1");
        location.href = `watch.html?v=${currentId}`;
      };

      finalizeStages();
      return;
    }

    // ошибка
    if (data.status === "error") {
      status.innerText = "Ошибка транскодинга. Попробуйте другое видео.";
      bar.style.width = "0%";
      return;
    }

    // прогресс
    if (data.progress >= 0) {
      status.innerText = `Обработка: ${data.progress}%`;
      bar.style.width = data.progress + "%";
    } else {
      status.innerText = "В процессе обработки...";
      bar.style.width = "60%";
    }

    // стадия
    if (data.current_stage) {
      applyStage(data.current_stage);
    }

    await new Promise((r) => setTimeout(r, 3000));
  }
};
