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
