const params = new URLSearchParams(location.search);
let id = params.get("v");

let listOffset = 0;
const LIST_LIMIT = 10;
const LOAD_MORE = 10;
const MAX_DOM_ITEMS = 50;

let listLoading = false;
let listEnded = false;

function shouldAutoplayNow() {
  return sessionStorage.getItem("autoplay") === "1";
}

const titleEl = document.getElementById("title");
const player = document.getElementById("player");
const playPause = document.getElementById("playPause");
const seek = document.getElementById("seek");
const volume = document.getElementById("volume");
const volumeIcon = document.getElementById("volumeIcon");
const time = document.getElementById("time");
const statusEl = document.getElementById("status");
const overlay = document.getElementById("overlay");
const bigPlay = document.getElementById("bigPlay");
const fullscreen = document.getElementById("fullscreen");
const muteBtn = document.getElementById("muteBtn");
const buffer = document.getElementById("buffer");
const controls = document.getElementById("controls");
const videoWrapper = document.getElementById("videoWrapper");
const loader = document.getElementById("loader");
const settingsBtn = document.getElementById("settingsBtn");
const settingsMenu = document.getElementById("settingsMenu");
const qualityBtn = document.getElementById("qualityBtn");
const qualityMenu = document.getElementById("qualityMenu");

const audioWrapper = document.getElementById("audioWrapper");
const audioPlayer = document.getElementById("audioPlayer");
const audioTitle = document.getElementById("audioTitle");
const audioSettingsBtn = document.getElementById("audioSettingsBtn");

const videoDescription = document.getElementById("videoDescription");
const descContent = document.getElementById("descContent");
const descToggle = document.getElementById("descToggle");

// 0 — минимальное, 1 — максимальное, по дефолту 0
let savedQualityPosition = Number(localStorage.getItem("qualityPosition")) || 0;
let descriptionExpanded = false;

const topSpacer = document.getElementById("top-spacer");
let removedHeight = 0;
let mobileFullscreen = false;

let hlsInstance = null;
let savedVolume = localStorage.getItem("playerVolume");
let lastVolume = savedVolume !== null ? Number(savedVolume) : 1;
const AUTO_HIDE_MS = 3000;
let hideTimer = null;

const nextVideoBtn = document.getElementById("nextVideoBtn");

// ===== НАСТРОЙКА MARKED (ДЛЯ V18) =====
// ===== НАСТРОЙКА MARKED (РАБОЧИЙ ВАРИАНТ ДЛЯ V18) =====
// 1. Создаем кастомный renderer для стилей

// 3. Устанавливаем глобальные настройки
marked.setOptions({
  gfm: true,
  breaks: true,
  pedantic: false,
  smartLists: true,
  smartypants: false,
  xhtml: false,
});

// 4. Функция для обработки Discord/Obsidian специфичных фич
function processDiscordMarkdown(text) {
  let processed = text;

  // Поддержка спойлеров (||текст||)
  processed = processed.replace(/\|\|(.+?)\|\|/g, (match, text) => {
    return `<span class="spoiler" style="background:#2d2d2d;border-radius:4px;padding:0 4px;cursor:pointer;" onclick="this.style.background='transparent'">${text}</span>`;
  });

  // Поддержка упоминаний (@username) - только в начале строки или после пробела
  processed = processed.replace(/(^|\s)@(\w+)/g, (match, space, username) => {
    return `${space}<span style="color:#5865F2;font-weight:500;">@${username}</span>`;
  });

  return processed;
}

// 5. Функция renderDescription - ИСПОЛЬЗУЕМ LEXER + PARSER (СИНХРОННО)
function renderDescription(markdown) {
  try {
    const processedMarkdown = processDiscordMarkdown(markdown);

    descContent.innerHTML = marked.parse(processedMarkdown);

    // делаем ссылки красивыми
    descContent.querySelectorAll("a").forEach((a) => {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    });

    // подсветка кода
    if (typeof Prism !== "undefined") {
      descContent.querySelectorAll("pre code").forEach((block) => {
        Prism.highlightElement(block);
      });
    }
  } catch (e) {
    console.error("Error rendering markdown:", e);
    descContent.textContent = markdown;
  }
}
// ===== КОНЕЦ НАСТРОЙКИ MARKED =====

// Определяем, широкое видео или вертикальное
function isLandscapeVideo() {
  return player.videoWidth > player.videoHeight;
}

async function openVideo(newId, autoplay = true) {
  id = newId;

  // меняем URL БЕЗ перезагрузки
  history.pushState(null, "", `?v=${id}`);

  // ставим autoplay
  sessionStorage.setItem("autoplay", autoplay ? "1" : "0");

  // грузим видео заново
  await load();
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!player) return;

  if (shouldAutoplayNow()) {
    try {
      await player.play();
      console.log("Autoplay сработал");

      // ✅ удаляем флаг только после попытки воспроизведения
      sessionStorage.removeItem("autoplay");
    } catch (e) {
      console.log("Autoplay заблокирован браузером", e);
      //const btn = document.createElement("button");
      // btn.textContent = "▶ Воспроизвести";
      // btn.style.position = "absolute";
      // btn.style.top = "50%";
      // btn.style.left = "50%";
      // btn.style.transform = "translate(-50%, -50%)";
      // btn.style.padding = "1rem 2rem";
      // btn.style.fontSize = "1.2rem";
      // btn.onclick = () => {
      //   player.play();
      //   sessionStorage.removeItem("autoplay"); // ❌ удаляем после ручного клика
      // };
      // document.body.appendChild(btn);
    }
  }
});

async function playNextVideo() {
  try {
    // получаем список видео
    const res = await fetch(`/api/videos?offset=0&limit=50`);
    let videos = await res.json();
    videos = Array.isArray(videos) ? videos : [];

    // список просмотренных видео через автоплей и кнопку "следующее"
    const watched = JSON.parse(
      sessionStorage.getItem("autoplayWatched") || "[]",
    );

    // исключаем текущее видео и уже просмотренные
    videos = videos.filter(
      (v) => v.id !== id && v.status === "ready" && !watched.includes(v.id),
    );

    if (videos.length === 0) {
      console.log("Нет новых видео для воспроизведения");
      return;
    }

    const nextVideo = videos[0];

    // добавляем текущее видео в watched
    watched.push(id);
    sessionStorage.setItem("autoplayWatched", JSON.stringify(watched));

    // ставим autoplay на следующем видео
    openVideo(nextVideo.id, true);
  } catch (e) {
    console.error("Ошибка перехода к следующему видео:", e);
  }
}

// клик по кнопке
nextVideoBtn.onclick = (e) => {
  e.stopPropagation();
  playNextVideo();
};

// === Автовоспроизведение ===
const autoplayBtn = document.getElementById("autoplayBtn");
const autoplayIcon = document.getElementById("autoplayIcon");

// читаем из localStorage (default = false)
let autoplayEnabled = localStorage.getItem("autoplayEnabled") === "1";
// обновляем иконку при загрузке страницы
function updateAutoplayIcon() {
  autoplayIcon.src = autoplayEnabled
    ? "/icons/toggleon.png"
    : "/icons/toggleoff.png";
}
updateAutoplayIcon();
// Повтор
const repeatBtn = document.getElementById("repeatBtn");
const repeatIcon = document.getElementById("repeatIcon");

let repeatEnabled = localStorage.getItem("repeatEnabled") === "1";
function updateRepeatIcon() {
  repeatIcon.src = repeatEnabled
    ? "/icons/repeaton.png"
    : "/icons/repeatoff.png";
}
updateRepeatIcon();

repeatBtn.onclick = (e) => {
  e.stopPropagation();

  repeatEnabled = !repeatEnabled;
  localStorage.setItem("repeatEnabled", repeatEnabled ? "1" : "0");
  updateRepeatIcon();

  // если включаем повтор — выключаем автовоспроизведение
  if (repeatEnabled) {
    autoplayEnabled = false;
    localStorage.setItem("autoplayEnabled", "0");
    updateAutoplayIcon();
  }
};

// переключение состояния по клику
autoplayBtn.onclick = (e) => {
  e.stopPropagation();
  autoplayEnabled = !autoplayEnabled;
  localStorage.setItem("autoplayEnabled", autoplayEnabled ? "1" : "0");
  updateAutoplayIcon();

  // если включаем автовоспроизведение — выключаем повтор
  if (autoplayEnabled) {
    repeatEnabled = false;
    localStorage.setItem("repeatEnabled", "0");
    updateRepeatIcon();
  }
};

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

async function load() {
  if (!id) {
    // Получаем случайное видео, если нет id
    const resp = await fetch("/api/random");
    if (!resp.ok) {
      document.body.innerHTML = "<h2>Нет видео для просмотра</h2>";
      return;
    }
    id = await resp.text();
    history.replaceState(null, "", `?v=${id}`);
    sessionStorage.setItem("autoplay", "1"); // автоплей по умолчанию
  }

  // Получаем данные видео
  let videoData;
  try {
    const res = await fetch(`/api/video/${id}`);
    videoData = await res.json();
  } catch (err) {
    console.error("Ошибка получения данных видео:", err);
    statusEl.innerText = "Ошибка загрузки видео";
    return;
  }

  titleEl.innerText = videoData.title || "";
  document.title = (videoData.title || "") + " - Umbrella Play";

  // Сбрасываем описание
  descriptionExpanded = false;
  videoDescription.classList.remove("expanded");
  descToggle.textContent = "…ещё";

  // Обработка описания
  if (videoData.description) {
    renderDescription(videoData.description.trim());
    videoDescription.style.display = "block";
  } else {
    videoDescription.style.display = "none";
  }

  // Статус видео
  if (videoData.status === "processing") {
    statusEl.innerText = "Видео обрабатывается...";
    setTimeout(load, 1500);
    return;
  }

  if (videoData.status === "error") {
    statusEl.innerText = "Ошибка транскодинга";
    return;
  }

  // --- поток HLS ---
  let streamURL = videoData.stream_url;
  if (!streamURL.endsWith(".m3u8")) {
    streamURL = streamURL.replace(/\/+$/, "") + "/index.m3u8";
  }

  // Уничтожаем старый плеер
  if (hlsInstance) {
    try {
      hlsInstance.destroy();
    } catch (e) {}
    hlsInstance = null;
  }
  player.src = "";
  audioPlayer.src = "";
  showLoader();

  if (Hls.isSupported()) {
    hlsInstance = new Hls();
    hlsInstance.loadSource(streamURL);
    hlsInstance.attachMedia(player);

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, async () => {
      hideLoader();
      populateQualityMenu(hlsInstance.levels);

      if (shouldAutoplayNow()) {
        try {
          await player.play();
          sessionStorage.removeItem("autoplay");
        } catch (e) {
          console.log("Autoplay заблокирован браузером", e);
        }
      }
    });

    hlsInstance.on(Hls.Events.LEVEL_LOADED, updateBuffer);
    hlsInstance.on(Hls.Events.FRAG_BUFFERED, updateBuffer);
  } else if (player.canPlayType("application/vnd.apple.mpegurl")) {
    player.src = streamURL;
    player.addEventListener("loadedmetadata", () => {
      player.play().catch(() => {});
    });
  }

  // --- audio-only ---
  audioPlayer.src = streamURL;

  // --- меню качества ---
  function populateQualityMenu(levels) {
    qualityMenu.innerHTML = "";

    // строим только видео качества
    levels.forEach((level, idx) => {
      const item = document.createElement("div");
      item.className = "settings-quality";
      item.dataset.quality = idx;
      item.textContent = level.height + "p";
      qualityMenu.appendChild(item);
    });

    // Подсветка дефолтного качества
    const pos = Math.min(savedQualityPosition, levels.length - 1);
    hlsInstance.currentLevel = pos;

    setTimeout(() => {
      const items = qualityMenu.querySelectorAll(".settings-quality");
      items.forEach((i) => i.classList.remove("active"));
      if (items[pos]) items[pos].classList.add("active");
    }, 0);
  }

  // обработка клика по качеству

  // Показ списка видео
  loadVideoList(true);
}

async function loadVideoList(reset = false) {
  if (listLoading || listEnded) return;
  listLoading = true;

  const list = document.getElementById("list");

  if (reset) {
    list.innerHTML = "";
    listOffset = 0;
    listEnded = false;
  }

  const limit = reset ? LIST_LIMIT : LOAD_MORE;

  try {
    const res = await fetch(`/api/videos?offset=${listOffset}&limit=${limit}`);
    let videos = await res.json();
    videos = Array.isArray(videos) ? videos : [];

    if (videos.length === 0) {
      listEnded = true;
      return;
    }

    videos.forEach((v) => {
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <img class="thumb" src="${v.thumbnail}" loading="lazy" />
        <div>
          <div class="itemTitle">${v.title}</div>
          <div class="itemStatus">
            ${v.status === "processing" ? "Processing..." : "Ready"}
          </div>
        </div>
      `;
      item.onclick = () => {
        openVideo(v.id, true);
      };
      list.appendChild(item);
    });

    listOffset += videos.length;
  } catch (e) {
    console.error("Ошибка загрузки списка:", e);
  } finally {
    listLoading = false;
  }
}

const listEl = document.getElementById("list");

listEl.addEventListener("scroll", () => {
  const nearBottom =
    listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 50;

  if (nearBottom) {
    loadVideoList();
  }
});

window.addEventListener("scroll", () => {
  // если list сам скроллится — window не трогаем
  if (listEl.scrollHeight > listEl.clientHeight) return;

  const nearBottom =
    window.innerHeight + window.scrollY >= document.body.offsetHeight - 300;

  if (nearBottom) loadVideoList();
});

// Функция перехода в fullscreen и поворот mobile
// Вход в fullscreen
async function enterFullscreenMobile() {
  if (!mobileFullscreen) {
    mobileFullscreen = true;

    try {
      if (videoWrapper.requestFullscreen)
        await videoWrapper.requestFullscreen();
      else if (videoWrapper.webkitRequestFullscreen)
        await videoWrapper.webkitRequestFullscreen();

      // если видео горизонтальное — повернуть экран
      if (player.videoWidth > player.videoHeight) {
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock("landscape");
        }
      }
    } catch (err) {
      console.log("Fullscreen error:", err);
    }

    updateMobileFullscreenLayout();
  }
}

// Выход из fullscreen
function exitFullscreenMobile() {
  if (mobileFullscreen) {
    mobileFullscreen = false;

    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();

    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }

    videoWrapper.classList.remove(
      "fullscreen-landscape",
      "fullscreen-portrait",
    );
    videoWrapper.style.width = "";
    videoWrapper.style.height = "";
    videoWrapper.style.transform = "";
  }
}

// Обновление позиции и поворота видео в fullscreen
function updateMobileFullscreenLayout() {
  if (!mobileFullscreen) return;

  const isLandscape = isLandscapeVideo();
  const angle = window.orientation || screen.orientation?.angle || 0;
  const isDeviceLandscape = Math.abs(angle) === 90;

  // горизонтальное видео
  if (isLandscape) {
    videoWrapper.classList.add("fullscreen-landscape");
    videoWrapper.classList.remove("fullscreen-portrait");
  } else {
    // вертикальное видео
    videoWrapper.classList.add("fullscreen-portrait");
    videoWrapper.classList.remove("fullscreen-landscape");
  }
}

// ----------------- SETTINGS MENU -----------------
settingsBtn.onclick = (e) => {
  e.stopPropagation();
  settingsMenu.style.display =
    settingsMenu.style.display === "flex" ? "none" : "flex";
};

audioSettingsBtn.onclick = (e) => {
  e.stopPropagation();
  audioWrapper.querySelector(".audio-controls .settings-menu")?.remove();
  settingsMenu.style.display =
    settingsMenu.style.display === "flex" ? "none" : "flex";
};

document.addEventListener("click", () => {
  settingsMenu.style.display = "none";
  qualityMenu.style.display = "none";
});

qualityBtn.onclick = (e) => {
  e.stopPropagation();
  qualityMenu.style.display = "flex";
};

qualityMenu.onclick = (e) => {
  const item = e.target.closest(".settings-quality");
  if (!item || !hlsInstance) return;

  const mode = item.dataset.quality;

  qualityMenu
    .querySelectorAll(".settings-quality")
    .forEach((i) => i.classList.remove("active"));
  item.classList.add("active");

  if (mode === "audio") {
    player.style.display = "none";
    audioWrapper.style.display = "block";
    audioPlayer.play();
  } else {
    const level = parseInt(mode);
    hlsInstance.currentLevel = level;

    savedQualityPosition = level;
    localStorage.setItem("qualityPosition", level);

    player.style.display = "block";
    audioWrapper.style.display = "none";
    player.play();
  }

  settingsMenu.style.display = "none";
  qualityMenu.style.display = "none";
};

// ----------------- CONTROLS -----------------

// --- show/hide controls как у тебя ---
function showControls() {
  controls.style.opacity = "1";
  controls.style.transform = "translateY(0)";
  seek.style.opacity = "1";
  seek.style.transform = "translateY(0)";
  buffer.style.opacity = "1";
  buffer.style.transform = "translateY(0)";

  // если меню уже открыто, поддерживаем его видимым
  if (settingsMenu.classList.contains("open")) {
    settingsMenu.style.opacity = "1";
    settingsMenu.style.transform = "translateY(0)";
    settingsMenu.style.pointerEvents = "auto";
  }

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(hideControls, AUTO_HIDE_MS);
}

function hideControls() {
  controls.style.opacity = "0";
  controls.style.transform = "translateY(20px)";
  seek.style.opacity = "0";
  seek.style.transform = "translateY(20px)";
  buffer.style.opacity = "0";
  buffer.style.transform = "translateY(20px)";

  // меню тоже скрываем, но класс open оставляем для клика
  if (settingsMenu.classList.contains("open")) {
    settingsMenu.style.opacity = "0";
    settingsMenu.style.transform = "translateY(20px)";
    settingsMenu.style.pointerEvents = "none";
  }
}

// --- кнопка настроек ---
settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation(); // чтобы клик не уходил в видео
  if (settingsMenu.classList.contains("open")) {
    // закрываем
    settingsMenu.classList.remove("open");
    settingsMenu.style.opacity = "0";
    settingsMenu.style.transform = "translateY(20px)";
    settingsMenu.style.pointerEvents = "none";
  } else {
    // открываем
    settingsMenu.classList.add("open");
    settingsMenu.style.opacity = "1";
    settingsMenu.style.transform = "translateY(0)";
    settingsMenu.style.pointerEvents = "auto";

    // показываем контролы на всякий случай
    showControls();
  }
});

// --- клик по странице скрывает меню ---
document.addEventListener("click", () => {
  if (settingsMenu.classList.contains("open")) {
    settingsMenu.classList.remove("open");
    settingsMenu.style.opacity = "0";
    settingsMenu.style.transform = "translateY(20px)";
    settingsMenu.style.pointerEvents = "none";
  }
});

// --- не закрывать меню при клике по нему ---
settingsMenu.addEventListener("click", (e) => e.stopPropagation());

// play/pause
const playPauseIcon = document.getElementById("playPauseIcon");

// клик по кнопке
playPause.onclick = () => {
  if (player.paused) player.play();
  else player.pause();
};

// клик по видео
player.onclick = () => {
  if (player.paused) player.play();
  else player.pause();
};

// ===== SMART LOADER CONTROL =====

let isBuffering = false;
let hasFirstFrame = false;
let loaderTimer = null;

function showLoaderSmart() {
  clearTimeout(loaderTimer);

  loaderTimer = setTimeout(() => {
    if (!hasFirstFrame || isBuffering) {
      loader.style.display = "block";
    }
  }, 150);
}

function hideLoaderSmart() {
  clearTimeout(loaderTimer);
  loader.style.display = "none";
}

player.addEventListener("loadstart", () => {
  hasFirstFrame = false;
  isBuffering = true;
  showLoaderSmart();
});

player.addEventListener("loadeddata", () => {
  hasFirstFrame = true;
  hideLoaderSmart();
});

player.addEventListener("waiting", () => {
  isBuffering = true;
  showLoaderSmart();
});

player.addEventListener("playing", () => {
  isBuffering = false;
  hideLoaderSmart();
});

// события плеера
player.onpause = () => {
  overlay.style.display = "flex";
  playPauseIcon.src = "/icons/play.png";
  showControls();
};

player.onplay = () => {
  overlay.style.display = "none";
  playPauseIcon.src = "/icons/pause.png"; //
  showControls();
};

// большая кнопка play в центре
bigPlay.onclick = () => {
  player.play();
  overlay.style.display = "none";
  showControls();
};

player.ontimeupdate = () => {
  const current = player.currentTime;
  const duration = player.duration || 0;

  seek.value = duration ? (current / duration) * 100 : 0;

  const fmt = (t) => {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }

    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  time.innerText = `${fmt(current)} / ${fmt(duration)}`;
};

seek.oninput = () => {
  const duration = player.duration || 0;
  player.currentTime = (seek.value / 100) * duration;
};

// volume
volume.oninput = () => {
  const v = Number(volume.value);
  player.volume = v;

  player.muted = v === 0;
  if (v > 0) lastVolume = v;

  localStorage.setItem("playerVolume", v);

  updateMuteIcon();
};

muteBtn.onclick = () => {
  if (player.muted || player.volume === 0) {
    player.muted = false;
    player.volume = lastVolume || 1;
    volume.value = player.volume;
  } else {
    player.muted = true;
    player.volume = 0;
    volume.value = 0;
  }

  localStorage.setItem("playerVolume", player.volume);
  updateMuteIcon();
};

function updateMuteIcon() {
  if (player.muted || player.volume === 0) {
    volumeIcon.src = "/icons/mute.png";
  } else {
    volumeIcon.src = "/icons/volume.png";
  }
}

// fullscreen
fullscreen.onclick = () => {
  if (/Mobi|Android/i.test(navigator.userAgent)) {
    if (!mobileFullscreen) enterFullscreenMobile();
    else exitFullscreenMobile();
  } else {
    if (!document.fullscreenElement) videoWrapper.requestFullscreen();
    else document.exitFullscreen();
  }
};

// Обновление при изменении ориентации или ресайзе
window.addEventListener("orientationchange", updateMobileFullscreenLayout);
window.addEventListener("resize", updateMobileFullscreenLayout);

// Если пользователь выходит из fullscreen через системную кнопку
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) mobileFullscreen = false;
});

// buffer
function updateBuffer() {
  const buffered = player.buffered;
  const duration = player.duration || 0;
  if (!buffered.length || !duration) return;
  const end = buffered.end(buffered.length - 1);
  buffer.style.width = (end / duration) * 100 + "%";
}

function showLoader() {
  loader.style.display = "block";
}

function hideLoader() {
  loader.style.display = "none";
}

// ----------------- AUDIO PLAYER -----------------
document.querySelectorAll(".audio-player").forEach((player) => {
  const audio = player.querySelector(".audio");
  const playBtn = player.querySelector(".play-pause");
  const rewindBtn = player.querySelector(".rewind");
  const forwardBtn = player.querySelector(".forward");
  const progress = player.querySelector(".progress");
  const currentTimeEl = player.querySelector(".current-time");
  const durationEl = player.querySelector(".duration");

  function formatTime(time) {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }

  audio.addEventListener("loadedmetadata", () => {
    durationEl.textContent = formatTime(audio.duration);
  });

  audio.addEventListener("timeupdate", () => {
    currentTimeEl.textContent = formatTime(audio.currentTime);
    progress.value = (audio.currentTime / audio.duration) * 100 || 0;
  });

  progress.addEventListener("input", () => {
    audio.currentTime = (progress.value / 100) * audio.duration;
  });

  playBtn.addEventListener("click", () => {
    if (audio.paused) {
      audio.play();
      playBtn.textContent = "⏸️";
    } else {
      audio.pause();
      playBtn.textContent = "▶️";
    }
  });

  rewindBtn.addEventListener("click", () => {
    audio.currentTime -= 10;
  });

  forwardBtn.addEventListener("click", () => {
    audio.currentTime += 10;
  });
});

// ----------------- INIT -----------------
videoWrapper.addEventListener("mousemove", showControls);
videoWrapper.addEventListener("click", showControls);
videoWrapper.addEventListener("mouseleave", hideControls);
document.addEventListener("keydown", (e) => {
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA"))
    return;

  if (e.code === "ArrowLeft") {
    e.preventDefault();
    player.currentTime = Math.max(0, player.currentTime - 10);
    showControls();
  }

  if (e.code === "ArrowRight") {
    e.preventDefault();
    player.currentTime = Math.min(
      player.duration || 0,
      player.currentTime + 10,
    );
    showControls();
  }

  if (e.code === "Space") {
    e.preventDefault();
    player.paused ? player.play() : player.pause();
  }
});

// ----------------- MOBILE GESTURES: DOUBLE-TAP + PINCH -----------------
let lastTapTime = 0;
let pinchStartDist = null;
let pinchStartScale = 1;
let currentScale = 1;

videoWrapper.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    // Начало pinch
    e.preventDefault();
    const dx = e.touches[0].pageX - e.touches[1].pageX;
    const dy = e.touches[0].pageY - e.touches[1].pageY;
    pinchStartDist = Math.hypot(dx, dy);
    pinchStartScale = currentScale;
  }
});

videoWrapper.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2 && pinchStartDist) {
    // Pinch in progress
    e.preventDefault();
    const dx = e.touches[0].pageX - e.touches[1].pageX;
    const dy = e.touches[0].pageY - e.touches[1].pageY;
    const newDist = Math.hypot(dx, dy);
    let scale = pinchStartScale * (newDist / pinchStartDist);

    // Ограничение масштаба
    scale = Math.max(1, Math.min(3, scale));
    currentScale = scale;

    // Выбираем элемент для масштабирования
    let targetWrapper = videoWrapper; // обычный режим
    if (mobileFullscreen) {
      targetWrapper = player; // fullscreen: масштабируем сам <video>
    }
    targetWrapper.style.transform = `scale(${scale})`;
  }
});

videoWrapper.addEventListener("touchend", (e) => {
  // Сброс pinch
  if (e.touches.length < 2) {
    pinchStartDist = null;
  }

  // Double-tap только если один палец
  if (e.touches.length === 0) {
    const now = Date.now();
    const touch = e.changedTouches[0];
    const rect = videoWrapper.getBoundingClientRect();
    const x = touch.clientX - rect.left;

    if (now - lastTapTime < 300) {
      // Двойной тап срабатывает
      if (x < rect.width / 2) {
        player.currentTime = Math.max(0, player.currentTime - 10);
      } else {
        player.currentTime = Math.min(
          player.duration || 0,
          player.currentTime + 10,
        );
      }
      showControls();
      lastTapTime = 0;
      return;
    }

    lastTapTime = now;
  }
});

showControls();
load();

// применяем сохраненную громкость
player.volume = lastVolume;
volume.value = lastVolume;
player.muted = lastVolume === 0;
updateMuteIcon();

// Клик по блоку раскрывает описание только в свернутом виде
videoDescription.addEventListener("click", () => {
  if (!descriptionExpanded) toggleDescription();
});

// Клик по кнопке "свернуть" закрывает описание
descToggle.addEventListener("click", (e) => {
  e.stopPropagation(); // чтобы не срабатывал клик по блоку
  toggleDescription();
});

function toggleDescription() {
  descriptionExpanded = !descriptionExpanded;

  if (descriptionExpanded) {
    // Раскрываем описание
    videoDescription.classList.add("expanded");
    descToggle.textContent = "свернуть";
    videoDescription.style.zIndex = "10";
  } else {
    // Свертываем описание
    videoDescription.classList.remove("expanded");
    descToggle.textContent = "…ещё";
    videoDescription.style.zIndex = "1";
  }
}

// ----------------- AUTOPLAY NEXT VIDEO -----------------
player.onended = async () => {
  overlay.style.display = "flex";
  playPauseIcon.src = "/icons/play.png";

  // если повтор включен — просто начать видео заново
  if (repeatEnabled) {
    player.currentTime = 0;
    player.play();
    return;
  }

  // если автовоспроизведение выключено — ничего не делаем
  if (!autoplayEnabled) return;

  try {
    const res = await fetch(`/api/videos?offset=0&limit=50`);
    let videos = await res.json();
    videos = Array.isArray(videos) ? videos : [];

    const watched = JSON.parse(
      sessionStorage.getItem("autoplayWatched") || "[]",
    );
    videos = videos.filter(
      (v) => v.id !== id && v.status === "ready" && !watched.includes(v.id),
    );

    if (videos.length === 0) return;

    const nextVideo = videos[0];
    watched.push(id);
    sessionStorage.setItem("autoplayWatched", JSON.stringify(watched));

    openVideo(nextVideo.id, true);
  } catch (e) {
    console.error("Ошибка автоперехода:", e);
  }
};
