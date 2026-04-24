// api/videoApi.js

import { config } from "../core/config.js";

/**
 * Получить список видео (пагинация)
 */
export async function fetchVideos(offset = 0, limit = 10) {
  try {
    const res = await fetch(
      `${config.API.BASE}${config.API.VIDEOS}?offset=${offset}&limit=${limit}`,
    );

    if (!res.ok) {
      throw new Error("Failed to fetch videos");
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("fetchVideos error:", err);
    return [];
  }
}

/**
 * Получить одно видео по ID
 */
export async function fetchVideoById(id) {
  if (!id) return null;

  try {
    const res = await fetch(`${config.API.BASE}${config.API.VIDEO}/${id}`);

    if (!res.ok) {
      throw new Error("Failed to fetch video");
    }

    return await res.json();
  } catch (err) {
    console.error("fetchVideoById error:", err);
    return null;
  }
}

/**
 * Получить случайное видео
 */
export async function fetchRandomVideo() {
  try {
    const res = await fetch(`${config.API.BASE}${config.API.RANDOM}`);

    if (!res.ok) {
      throw new Error("Failed to fetch random video");
    }

    return await res.text(); // у тебя random возвращает ID строкой
  } catch (err) {
    console.error("fetchRandomVideo error:", err);
    return null;
  }
}
