import { dom } from "../ui/dom.js";
import { formatTime } from "../utils/format.js";

export function initAudioPlayer() {
  const audio = dom.audioPlayer;

  const playBtn = document.querySelector(".audio-player .play-pause");
  const rewindBtn = document.querySelector(".audio-player .rewind");
  const forwardBtn = document.querySelector(".audio-player .forward");
  const progress = document.querySelector(".audio-player .progress");
  const currentTimeEl = document.querySelector(".audio-player .current-time");
  const durationEl = document.querySelector(".audio-player .duration");

  if (!audio) return;

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
}
