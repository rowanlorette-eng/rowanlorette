import { dom } from "./ui/dom.js";

/* core */
import { on } from "./core/events.js";

/* player */
import { initPlayer } from "./player/player.js";
import { initHls } from "./player/hls.js";

/* features */
import { initAutoplay, onVideoEnd } from "./features/autoplay.js";
import { loadVideo } from "./features/videoService.js";

/* audio */
import { initAudioPlayer } from "./audio/audioPlayer.js";

/* mobile */
import { initGestures } from "./mobile/gestures.js";

/* ui */
import { renderTitle } from "./ui/render.js";

/* state */
import { state } from "./core/state.js";

const params = new URLSearchParams(location.search);
let id = params.get("v");

/**
 * INIT APP
 */
async function bootstrap() {
  initPlayer();

  // 🔥 ВАЖНО: HLS INIT

  initAudioPlayer();
  initGestures(dom.player);

  initAutoplay({
    autoplay: true,
    repeat: false,
  });

  await openVideo(id);

  bindEvents();
}

/**
 * VIDEO FLOW
 */
export async function openVideo(newId, autoplay = true) {
  if (!newId) return;

  id = newId;

  const data = await loadVideo(id);

  if (!data) return;

  state.video = data;

  renderTitle(data.title || "");

  // 🔥 теперь loadStream гарантированно есть
  state.player.loadStream(data.stream_url);

  history.pushState(null, "", `?v=${id}`);

  sessionStorage.setItem("autoplay", autoplay ? "1" : "0");
}

/**
 * EVENTS
 */
function bindEvents() {
  on("player:end", async () => {
    await onVideoEnd(id, openVideo);
  });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      const video = dom.player;

      video.paused ? video.play() : video.pause();
    }
  });
}

/**
 * START
 */
bootstrap();
