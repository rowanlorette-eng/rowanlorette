import { fetchRecommendations, shuffle } from "./recommendations.js";
import { addWatched } from "./history.js";
import { emit } from "../core/events.js";

let autoplayEnabled = false;
let repeatEnabled = false;

/**
 * Инициализация autoplay системы
 */
export function initAutoplay(config = {}) {
  autoplayEnabled = config.autoplay ?? false;
  repeatEnabled = config.repeat ?? false;
}

/**
 * Переключение autoplay
 */
export function setAutoplay(enabled) {
  autoplayEnabled = enabled;
}

/**
 * Переключение repeat
 */
export function setRepeat(enabled) {
  repeatEnabled = enabled;
}

/**
 * Обработка окончания видео
 */
export async function onVideoEnd(currentVideoId, openVideoFn) {
  if (repeatEnabled) {
    emit("video:repeat");
    return;
  }

  if (!autoplayEnabled) return;

  try {
    const videos = await fetchRecommendations(50);
    shuffle(videos);

    const next = videos.find((v) => v.id !== currentVideoId);

    if (!next) return;

    addWatched(currentVideoId);

    emit("autoplay:next", next.id);

    openVideoFn(next.id, true);
  } catch (e) {
    console.error("autoplay error:", e);
  }
}

/**
 * API состояния (для UI)
 */
export function isAutoplayEnabled() {
  return autoplayEnabled;
}

export function isRepeatEnabled() {
  return repeatEnabled;
}
