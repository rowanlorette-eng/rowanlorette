import { dom } from "../ui/dom.js";

let lastTapTime = 0;
let pinchStartDist = null;
let pinchStartScale = 1;
let currentScale = 1;

export function initGestures(videoEl) {
  const wrapper = dom.videoWrapper;

  // ---------------- pinch ----------------
  wrapper.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].pageX - e.touches[1].pageX;
      const dy = e.touches[0].pageY - e.touches[1].pageY;

      pinchStartDist = Math.hypot(dx, dy);
      pinchStartScale = currentScale;
    }
  });

  wrapper.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && pinchStartDist) {
      const dx = e.touches[0].pageX - e.touches[1].pageX;
      const dy = e.touches[0].pageY - e.touches[1].pageY;

      const dist = Math.hypot(dx, dy);
      let scale = pinchStartScale * (dist / pinchStartDist);

      scale = Math.max(1, Math.min(3, scale));
      currentScale = scale;

      const target = videoEl;
      target.style.transform = `scale(${scale})`;
    }
  });

  wrapper.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) {
      pinchStartDist = null;
    }

    // ---------------- double tap ----------------
    if (e.touches.length === 0) {
      const now = Date.now();
      const rect = wrapper.getBoundingClientRect();
      const x = e.changedTouches[0].clientX - rect.left;

      if (now - lastTapTime < 300) {
        if (x < rect.width / 2) {
          videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
        } else {
          videoEl.currentTime = Math.min(
            videoEl.duration || 0,
            videoEl.currentTime + 10,
          );
        }

        lastTapTime = 0;
        return;
      }

      lastTapTime = now;
    }
  });
}
