import "../../hls/hls.min.js";
import { state } from "../core/state.js";
import { emit } from "../core/events.js";

const Hls = window.Hls;

/**
 * локальная инстанция HLS
 */
let hlsInstance = null;

/**
 * Инициализация HLS потока
 */
export function initHls(videoEl, audioEl) {
  state.player.hls = null;

  state.player.loadStream = (url) => {
    if (!url) return;

    // уничтожаем старый инстанс
    if (hlsInstance) {
      try {
        hlsInstance.destroy();
      } catch (e) {}
      hlsInstance = null;
    }

    if (Hls && Hls.isSupported()) {
      hlsInstance = new Hls();

      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoEl);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        emit("hls:ready");
      });

      state.player.hls = hlsInstance;
    } else {
      videoEl.src = url;
    }

    audioEl.src = url;
  };
}
