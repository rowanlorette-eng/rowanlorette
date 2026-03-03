const params = new URLSearchParams(location.search);
let id = params.get("v");

let listOffset = 0;
const LIST_LIMIT = 10;
const LOAD_MORE = 10;
const MAX_DOM_ITEMS = 50;

let listLoading = false;
let listEnded = false;

const shouldAutoplay = sessionStorage.getItem("autoplay") === "1";
sessionStorage.removeItem("autoplay");

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

let descriptionExpanded = false;

const topSpacer = document.getElementById("top-spacer");
let removedHeight = 0;
let mobileFullscreen = false;

let hlsInstance = null;
let lastVolume = 1;
const AUTO_HIDE_MS = 3000;
let hideTimer = null;

const nextVideoBtn = document.getElementById("nextVideoBtn");
// Определяем, широкое видео или вертикальное
function isLandscapeVideo() {
  return player.videoWidth > player.videoHeight;
}

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
    sessionStorage.setItem("autoplay", "1");
    location.href = `/watch?v=${nextVideo.id}`;
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
    const resp = await fetch("/api/random");
    if (!resp.ok) {
      document.body.innerHTML = "<h2>Нет видео для просмотра</h2>";
      return;
    }
    id = await resp.text();
    location.search = "?v=" + id;
    return;
  }

  const video = await fetch(`/api/video/${id}`).then((r) => r.json());

  descriptionExpanded = false;
  videoDescription.classList.remove("expanded");
  descToggle.textContent = "…ещё";
  videoDescription.addEventListener("click", toggleDescription);

  if (video.description) {
    renderDescription(video.description.trim());
    videoDescription.style.display = "block";
  } else {
    videoDescription.style.display = "none";
  }

  // функция рендеринга Markdown и ссылок
  function renderDescription(markdown) {
    const html = marked.parse(markdown);
    descContent.innerHTML = html;

    // делаем ссылки кликабельными и синими
    descContent.querySelectorAll("a").forEach((a) => {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.color = "#4da3ff";
      a.style.textDecoration = "underline";
    });
  }

  if (video.status === "processing") {
    statusEl.innerText = "Видео обрабатывается...";
    setTimeout(load, 1000);
    return;
  }

  if (video.status === "error") {
    statusEl.innerText = "Ошибка транскодинга";
    return;
  }

  const url = video.stream_url + "/index.m3u8";

  // destroy old HLS if exists
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  if (Hls.isSupported()) {
    hlsInstance = new Hls();
    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(player);

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      if (shouldAutoplay) {
        player.play().catch((e) => {
          console.log("autoplay blocked", e);
        });
      }
    });

    hlsInstance.on(Hls.Events.LEVEL_LOADED, updateBuffer);
    hlsInstance.on(Hls.Events.FRAG_BUFFERED, updateBuffer);
  } else {
    player.src = url;

    if (shouldAutoplay) {
      player.play().catch((e) => {
        console.log("autoplay blocked", e);
      });
    }
  }

  // audio-only source
  audioPlayer.src = url;

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

    shuffle(videos); // ← случайный порядок

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
        sessionStorage.setItem("autoplay", "1");
        location.href = `watch?v=${v.id}`;
      };
      list.appendChild(item);
    });

    // --- VIRTUAL LIST: удаляем старые элементы сверху ---
    while (list.children.length > MAX_DOM_ITEMS + 1) {
      const first = list.children[1]; // [0] — spacer
      removedHeight += first.offsetHeight;
      list.removeChild(first);
      topSpacer.style.height = removedHeight + "px";
    }

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
function enterFullscreenMobile() {
  if (!mobileFullscreen) {
    mobileFullscreen = true;

    if (videoWrapper.requestFullscreen) videoWrapper.requestFullscreen();
    else if (videoWrapper.webkitRequestFullscreen)
      videoWrapper.webkitRequestFullscreen();

    updateMobileFullscreenLayout();
  }
}

// Выход из fullscreen
function exitFullscreenMobile() {
  if (mobileFullscreen) {
    mobileFullscreen = false;

    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();

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
  const item = e.target.closest(".settings-item");
  if (!item) return;
  const mode = item.dataset.quality;

  document
    .querySelectorAll("#qualityMenu .settings-item")
    .forEach((i) => i.classList.remove("active"));
  item.classList.add("active");

  if (!hlsInstance) return;

  if (mode === "audio") {
    player.style.display = "none";
    audioWrapper.style.display = "block";
    audioPlayer.play();
  } else {
    player.style.display = "block";
    audioWrapper.style.display = "none";
    player.play();
  }

  settingsMenu.style.display = "none";
  qualityMenu.style.display = "none";
};

// ----------------- CONTROLS -----------------
function showControls() {
  controls.style.opacity = "1";
  controls.style.transform = "translateY(0)";
  seek.style.opacity = "1";
  seek.style.transform = "translateY(0)";
  buffer.style.opacity = "1";
  buffer.style.transform = "translateY(0)";
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
}

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
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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

  updateMuteIcon();
};

muteBtn.onclick = () => {
  if (player.muted || player.volume === 0) {
    player.muted = false;
    player.volume = 1;
    volume.value = 1;
  } else {
    player.muted = true;
    player.volume = 0;
    volume.value = 0;
  }

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

// === Double tap seek (mobile like YouTube) ===
let lastTapTime = 0;

videoWrapper.addEventListener("touchend", (e) => {
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

showControls();
load();

function toggleDescription() {
  descriptionExpanded = !descriptionExpanded;

  if (descriptionExpanded) {
    videoDescription.classList.add("expanded");
    descToggle.textContent = "свернуть";

    // 🔴 Убираем большую кнопку
    videoDescription.removeEventListener("click", toggleDescription);
  } else {
    videoDescription.classList.remove("expanded");
    descToggle.textContent = "…ещё";

    // 🟢 Возвращаем большую кнопку
    videoDescription.addEventListener("click", toggleDescription);
  }
}

descToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleDescription();
});

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

    sessionStorage.setItem("autoplay", "1");
    location.href = `/watch?v=${nextVideo.id}`;
  } catch (e) {
    console.error("Ошибка автоперехода:", e);
  }
};
