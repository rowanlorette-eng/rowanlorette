// api/playerApi.js

import { config } from "../core/config.js";

/**
 * Нормализует stream URL под HLS
 * (важно: единая точка логики)
 */
export function buildStreamUrl(videoData) {
  if (!videoData?.stream_url) return null;

  let url = videoData.stream_url;

  // гарантируем HLS формат
  if (!url.endsWith(".m3u8")) {
    url = url.replace(/\/+$/, "") + "/index.m3u8";
  }

  return url;
}

/**
 * Проверка поддержки HLS
 */
export function isHlsSupported() {
  return typeof Hls !== "undefined" && Hls.isSupported();
}

/**
 * Создание HLS инстанса
 */
export function createHls() {
  if (!isHlsSupported()) return null;
  return new Hls();
}

/**
 * Подключение HLS к video элементу
 */
export function attachHlsToVideo(hls, videoEl, url) {
  if (!hls || !videoEl || !url) return null;

  hls.loadSource(url);
  hls.attachMedia(videoEl);

  return hls;
}

/**
 * Полный pipeline подготовки плеера
 * (используется player.js)
 */
export function prepareStream(videoData) {
  const url = buildStreamUrl(videoData);

  return {
    url,
    isHls: url?.includes(".m3u8") ?? false,
  };
}
