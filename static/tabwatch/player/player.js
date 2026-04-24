import { state } from "../core/state.js";
import { emit } from "../core/events.js";
import { initHls } from "./hls.js";
import { initControls } from "./controls.js";
import { initBuffer } from "./buffer.js";
import { initFullscreen } from "./fullscreen.js";
import { dom } from "../ui/dom.js";

/**
 * Инициализация плеера (entry point)
 */
export function initPlayer() {
  const { player, audioPlayer, videoWrapper } = dom;

  if (!player) {
    console.error("Player element not found");
    return;
  }

  state.player.video = player;
  state.player.audio = audioPlayer;

  initHls(player, audioPlayer);
  initControls(dom);
  initBuffer(player);
  initFullscreen(videoWrapper, player);

  bindEvents(player);

  emit("player:ready");
}

/**
 * Связь событий HTMLVideoElement → event bus
 */
function bindEvents(video) {
  video.addEventListener("play", () => emit("player:play"));
  video.addEventListener("pause", () => emit("player:pause"));
  video.addEventListener("timeupdate", () =>
    emit("player:time", video.currentTime),
  );
  video.addEventListener("ended", () => emit("player:end"));
}
