import { emit } from "../core/events.js";

/**
 * Fullscreen + mobile rotation
 */
export function initFullscreen(wrapper, video) {
  let mobile = false;

  wrapper.querySelector("#fullscreen").onclick = async () => {
    if (isMobile()) {
      if (!mobile) {
        await enter(wrapper, video);
        mobile = true;
      } else {
        exit();
        mobile = false;
      }
    } else {
      if (!document.fullscreenElement) {
        wrapper.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
  };
}

function isMobile() {
  return /Mobi|Android/i.test(navigator.userAgent);
}

async function enter(wrapper, video) {
  await wrapper.requestFullscreen();

  if (video.videoWidth > video.videoHeight) {
    try {
      await screen.orientation.lock("landscape");
    } catch {}
  }

  emit("fullscreen:enter");
}

function exit() {
  document.exitFullscreen?.();
  screen.orientation?.unlock?.();

  emit("fullscreen:exit");
}
