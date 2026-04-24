import { isWatched } from "./history.js";

const API = "/api/videos";

/**
 * Получить список рекомендаций
 */
export async function fetchRecommendations(limit = 50) {
  try {
    const res = await fetch(`${API}?offset=0&limit=${limit}`);
    let videos = await res.json();

    if (!Array.isArray(videos)) return [];

    return videos
      .filter((v) => v.status === "ready")
      .filter((v) => !isWatched(v.id));
  } catch (e) {
    console.error("recommendations error:", e);
    return [];
  }
}

/**
 * Простая shuffle (если нужно рандомизировать выдачу)
 */
export function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
