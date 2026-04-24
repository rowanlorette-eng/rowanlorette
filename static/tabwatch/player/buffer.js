import { state } from "../core/state.js";
import { on } from "../core/events.js";

/**
 * Буферизация видео
 */
export function initBuffer(video) {
  const bufferEl = document.getElementById("buffer");

  video.addEventListener("progress", () => {
    updateBuffer(video, bufferEl);
  });

  on("player:time", () => {
    updateBuffer(video, bufferEl);
  });
}

function updateBuffer(video, bufferEl) {
  const buffered = video.buffered;
  const duration = video.duration || 0;

  if (!buffered.length) return;

  const end = buffered.end(buffered.length - 1);
  bufferEl.style.width = (end / duration) * 100 + "%";
}
