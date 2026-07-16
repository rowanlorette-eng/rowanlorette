import { updateDescription } from "./modules/watch/description.js";
import {
  initSettings,
  setHlsInstance,
  populateQualityMenu,
  toggleAutoplay,
  toggleRepeat,
  getSettings,
} from "./modules/watch/settings.js";

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

// --- Элементы для настроек (уже не нужны, но оставляем для инициализации) ---
const qualityBtn = document.getElementById("qualityBtn");
const qualityMenu = document.getElementById("qualityMenu");
const settingsBtn = document.getElementById("settingsBtn");
const settingsMenu = document.getElementById("settingsMenu");
const audioSettingsBtn = document.getElementById("audioSettingsBtn");

const audioWrapper = document.getElementById("audioWrapper");
const audioPlayer = document.getElementById("audioPlayer");
const audioTitle = document.getElementById("audioTitle");

// --- Инициализация настроек ---
const settingsState = initSettings(
  player,
  qualityMenu,
  qualityBtn,
  settingsMenu,
  settingsBtn,
  audioSettingsBtn,
);

// --- Настройки автоплея и повтора ---
const autoplayBtn = document.getElementById("autoplayBtn");
const autoplayIcon = document.getElementById("autoplayIcon");
const repeatBtn = document.getElementById("repeatBtn");
const repeatIcon = document.getElementById("repeatIcon");

// Обновление иконок
function updateAutoplayIcon() {
  const settings = getSettings();
  autoplayIcon.src = settings.autoplayEnabled
    ? "/icons/toggleon.png"
    : "/icons/toggleoff.png";
}

function updateRepeatIcon() {
  const settings = getSettings();
  repeatIcon.src = settings.repeatEnabled
    ? "/icons/repeaton.png"
    : "/icons/repeatoff.png";
}

// Инициализация иконок
updateAutoplayIcon();
updateRepeatIcon();

// --- Обработчики для кнопок ---
autoplayBtn.onclick = (e) => {
  e.stopPropagation();
  const result = toggleAutoplay();
  updateAutoplayIcon();
  updateRepeatIcon();
};

repeatBtn.onclick = (e) => {
  e.stopPropagation();
  const result = toggleRepeat();
  updateAutoplayIcon();
  updateRepeatIcon();
};

const topSpacer = document.getElementById("top-spacer");
let removedHeight = 0;
let mobileFullscreen = false;

let hlsInstance = null;
let savedVolume = localStorage.getItem("playerVolume");
let lastVolume = savedVolume !== null ? Number(savedVolume) : 1;
const AUTO_HIDE_MS = 3000;
let hideTimer = null;

const nextVideoBtn = document.getElementById("nextVideoBtn");

// Определяем, широкое видео или вертикальное
function isLandscapeVideo() {
  return player.videoWidth > player.videoHeight;
}

async function openVideo(newId, autoplay = true) {
  id = newId;
  history.pushState(null, "", `?v=${id}`);
  sessionStorage.setItem("autoplay", autoplay ? "1" : "0");
  await load();
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!player) return;

  if (shouldAutoplayNow()) {
    try {
      await player.play();
      console.log("Autoplay сработал");
      sessionStorage.removeItem("autoplay");
    } catch (e) {
      console.log("Autoplay заблокирован браузером", e);
    }
  }
});

async function playNextVideo() {
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

    if (videos.length === 0) {
      console.log("Нет новых видео для воспроизведения");
      return;
    }

    const nextVideo = videos[0];
    watched.push(id);
    sessionStorage.setItem("autoplayWatched", JSON.stringify(watched));
    openVideo(nextVideo.id, true);
  } catch (e) {
    console.error("Ошибка перехода к следующему видео:", e);
  }
}

nextVideoBtn.onclick = (e) => {
  e.stopPropagation();
  playNextVideo();
};

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

async function load() {
  if (!id) {
    const resp = await fetch("/api/random");
    if (!resp.ok) {
      document.body.innerHTML = "<h2>Нет видео для просмотра</h2>";
      return;
    }
    id = await resp.text();
    history.replaceState(null, "", `?v=${id}`);
    sessionStorage.setItem("autoplay", "1");
  }

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
  updateDescription(videoData.description);

  if (videoData.status === "processing") {
    statusEl.innerText = "Видео обрабатывается...";
    setTimeout(load, 1500);
    return;
  }

  if (videoData.status === "error") {
    statusEl.innerText = "Ошибка транскодинга";
    return;
  }

  let streamURL = videoData.stream_url;
  if (!streamURL.endsWith(".m3u8")) {
    streamURL = streamURL.replace(/\/+$/, "") + "/index.m3u8";
  }

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

    // Передаем hlsInstance в модуль настроек
    setHlsInstance(hlsInstance);

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, async () => {
      hideLoader();

      // Используем функцию из модуля настроек
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

  audioPlayer.src = streamURL;
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
  if (listEl.scrollHeight > listEl.clientHeight) return;
  const nearBottom =
    window.innerHeight + window.scrollY >= document.body.offsetHeight - 300;
  if (nearBottom) loadVideoList();
});

// --- FULLSCREEN FUNCTIONS (unchanged) ---
async function enterFullscreenMobile() {
  if (!mobileFullscreen) {
    mobileFullscreen = true;
    try {
      if (videoWrapper.requestFullscreen)
        await videoWrapper.requestFullscreen();
      else if (videoWrapper.webkitRequestFullscreen)
        await videoWrapper.webkitRequestFullscreen();

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

function updateMobileFullscreenLayout() {
  if (!mobileFullscreen) return;
  const isLandscape = isLandscapeVideo();
  if (isLandscape) {
    videoWrapper.classList.add("fullscreen-landscape");
    videoWrapper.classList.remove("fullscreen-portrait");
  } else {
    videoWrapper.classList.add("fullscreen-portrait");
    videoWrapper.classList.remove("fullscreen-landscape");
  }
}

// --- CONTROLS (unchanged) ---
function showControls() {
  controls.style.opacity = "1";
  controls.style.transform = "translateY(0)";
  seek.style.opacity = "1";
  seek.style.transform = "translateY(0)";
  buffer.style.opacity = "1";
  buffer.style.transform = "translateY(0)";

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

  if (settingsMenu.classList.contains("open")) {
    settingsMenu.style.opacity = "0";
    settingsMenu.style.transform = "translateY(20px)";
    settingsMenu.style.pointerEvents = "none";
  }
}

// --- PLAY/PAUSE (unchanged) ---
const playPauseIcon = document.getElementById("playPauseIcon");

playPause.onclick = () => {
  if (player.paused) player.play();
  else player.pause();
};

player.onclick = () => {
  if (player.paused) player.play();
  else player.pause();
};

// --- LOADER (unchanged) ---
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

// --- PLAYER EVENTS (unchanged) ---
player.onpause = () => {
  overlay.style.display = "flex";
  playPauseIcon.src = "/icons/play.png";
  showControls();
};

player.onplay = () => {
  overlay.style.display = "none";
  playPauseIcon.src = "/icons/pause.png";
  showControls();
};

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

// --- VOLUME (unchanged) ---
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

// --- FULLSCREEN BUTTON (unchanged) ---
fullscreen.onclick = () => {
  if (/Mobi|Android/i.test(navigator.userAgent)) {
    if (!mobileFullscreen) enterFullscreenMobile();
    else exitFullscreenMobile();
  } else {
    if (!document.fullscreenElement) videoWrapper.requestFullscreen();
    else document.exitFullscreen();
  }
};

window.addEventListener("orientationchange", updateMobileFullscreenLayout);
window.addEventListener("resize", updateMobileFullscreenLayout);

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) mobileFullscreen = false;
});

// --- BUFFER (unchanged) ---
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

// --- AUDIO PLAYER (unchanged) ---
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

// --- INIT (unchanged) ---
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

// --- MOBILE GESTURES (unchanged) ---
let lastTapTime = 0;
let pinchStartDist = null;
let pinchStartScale = 1;
let currentScale = 1;

videoWrapper.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    const dx = e.touches[0].pageX - e.touches[1].pageX;
    const dy = e.touches[0].pageY - e.touches[1].pageY;
    pinchStartDist = Math.hypot(dx, dy);
    pinchStartScale = currentScale;
  }
});

videoWrapper.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2 && pinchStartDist) {
    e.preventDefault();
    const dx = e.touches[0].pageX - e.touches[1].pageX;
    const dy = e.touches[0].pageY - e.touches[1].pageY;
    const newDist = Math.hypot(dx, dy);
    let scale = pinchStartScale * (newDist / pinchStartDist);
    scale = Math.max(1, Math.min(3, scale));
    currentScale = scale;

    let targetWrapper = videoWrapper;
    if (mobileFullscreen) {
      targetWrapper = player;
    }
    targetWrapper.style.transform = `scale(${scale})`;
  }
});

videoWrapper.addEventListener("touchend", (e) => {
  if (e.touches.length < 2) {
    pinchStartDist = null;
  }

  if (e.touches.length === 0) {
    const now = Date.now();
    const touch = e.changedTouches[0];
    const rect = videoWrapper.getBoundingClientRect();
    const x = touch.clientX - rect.left;

    if (now - lastTapTime < 300) {
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

// --- START ---
showControls();
load();

player.volume = lastVolume;
volume.value = lastVolume;
player.muted = lastVolume === 0;
updateMuteIcon();

// --- AUTOPLAY NEXT VIDEO ---
player.onended = async () => {
  overlay.style.display = "flex";
  playPauseIcon.src = "/icons/play.png";

  const settings = getSettings();

  if (settings.repeatEnabled) {
    player.currentTime = 0;
    player.play();
    return;
  }

  if (!settings.autoplayEnabled) return;

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
