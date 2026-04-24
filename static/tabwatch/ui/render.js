import { dom } from "./dom.js";

/**
 * Обновление времени видео
 */
export function renderTime(current, duration, formatFn) {
  dom.time.innerText = `${formatFn(current)} / ${formatFn(duration)}`;
}

/**
 * Обновление прогресса seek bar
 */
export function renderSeek(current, duration) {
  dom.seek.value = duration ? (current / duration) * 100 : 0;
}

/**
 * Буфер
 */
export function renderBuffer(percent) {
  dom.buffer.style.width = percent + "%";
}

/**
 * Overlay play/pause UI
 */
export function renderPlayState(isPlaying) {
  dom.overlay.style.display = isPlaying ? "none" : "flex";
  dom.playPauseIcon.src = isPlaying ? "/icons/pause.png" : "/icons/play.png";
}

/**
 * Заголовок видео
 */
export function renderTitle(title) {
  dom.title.innerText = title || "";
  document.title = `${title || ""} - Umbrella Play`;
}

/**
 * Volume icon
 */
export function renderVolumeIcon(isMuted) {
  dom.volumeIcon.src = isMuted ? "/icons/mute.png" : "/icons/volume.png";
}
