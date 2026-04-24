import { state } from "../core/state.js";
import { on, emit } from "../core/events.js";
import { formatTime } from "../utils/format.js";

/**
 * Инициализация UI контролов плеера
 */
export function initControls(dom) {
  const {
    player,
    playPause,
    seek,
    volume,
    volumeIcon,
    muteBtn,
    fullscreen,
    buffer,
    time,
    bigPlay,
    overlay,
  } = dom;

  let lastVolume = state.player.volume ?? 1;

  /**
   * PLAY / PAUSE
   */
  function togglePlay() {
    if (player.paused) {
      player.play();
    } else {
      player.pause();
    }
  }

  playPause?.addEventListener("click", togglePlay);
  player?.addEventListener("click", togglePlay);

  bigPlay?.addEventListener("click", () => {
    player.play();
  });

  player.addEventListener("play", () => {
    overlay.style.display = "none";
    emit("player:play");
  });

  player.addEventListener("pause", () => {
    overlay.style.display = "flex";
    emit("player:pause");
  });

  /**
   * TIME / SEEK
   */
  player.addEventListener("timeupdate", () => {
    const current = player.currentTime;
    const duration = player.duration || 0;

    if (seek) {
      seek.value = duration ? (current / duration) * 100 : 0;
    }

    if (time) {
      time.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    }
  });

  seek?.addEventListener("input", () => {
    const duration = player.duration || 0;
    player.currentTime = (seek.value / 100) * duration;
  });

  /**
   * VOLUME
   */
  volume?.addEventListener("input", () => {
    const v = Number(volume.value);

    player.volume = v;
    player.muted = v === 0;

    state.player.volume = v;
    lastVolume = v;

    updateMuteIcon(v, volumeIcon);
  });

  muteBtn?.addEventListener("click", () => {
    if (player.muted || player.volume === 0) {
      player.muted = false;
      player.volume = lastVolume || 1;
    } else {
      player.muted = true;
      player.volume = 0;
    }

    updateMuteIcon(player.volume, volumeIcon);
  });

  /**
   * FULLSCREEN
   */
  fullscreen?.addEventListener("click", () => {
    const wrapper = dom.videoWrapper;

    if (!document.fullscreenElement) {
      wrapper.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  });

  /**
   * BUFFER
   */
  player.addEventListener("progress", () => {
    const buffered = player.buffered;
    const duration = player.duration || 0;

    if (!buffer || !buffered.length || !duration) return;

    const end = buffered.end(buffered.length - 1);
    buffer.style.width = (end / duration) * 100 + "%";
  });

  /**
   * EVENTS BUS SYNC
   */
  on("player:set-volume", (v) => {
    player.volume = v;
    volume.value = v;
    updateMuteIcon(v, volumeIcon);
  });

  on("player:seek", (time) => {
    player.currentTime = time;
  });

  /**
   * INIT STATE RESTORE
   */
  player.volume = state.player.volume ?? 1;
  volume.value = player.volume;
  updateMuteIcon(player.volume, volumeIcon);
}

/**
 * FORMAT TIME
 */

/**
 * MUTE ICON
 */
function updateMuteIcon(volume, icon) {
  if (!icon) return;

  icon.src = volume === 0 ? "/icons/mute.png" : "/icons/volume.png";
}
