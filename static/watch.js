const params = new URLSearchParams(location.search);
let id = params.get("v");

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

let hlsInstance = null;
let lastVolume = 1;
const AUTO_HIDE_MS = 3000;
let hideTimer = null;

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

    hlsInstance.on(Hls.Events.LEVEL_LOADED, updateBuffer);
    hlsInstance.on(Hls.Events.FRAG_BUFFERED, updateBuffer);
  } else {
    player.src = url;
  }

  // audio-only source
  audioPlayer.src = url;

  loadVideoList();
}

async function loadVideoList() {
  const videos = await fetch("/api/videos").then((r) => r.json());
  const list = document.getElementById("list");
  list.innerHTML = "";

  videos.forEach((v) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <img class="thumb" src="${v.thumbnail}" />
      <div>
        <div class="itemTitle">${v.title}</div>
        <div class="itemStatus">${v.status === "processing" ? "Processing..." : "Ready"}</div>
      </div>
    `;
    item.onclick = () => (location.href = `watch?v=${v.id}`);
    list.appendChild(item);
  });
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
  if (!document.fullscreenElement) videoWrapper.requestFullscreen();
  else document.exitFullscreen();
};

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
