import { fetchVideoById } from "../api/videoApi.js";

/**
 * бизнес-логика загрузки видео
 */
export async function loadVideo(id) {
  if (!id) return null;

  const data = await fetchVideoById(id);

  // сюда потом добавишь:
  // - кеш
  // - retry
  // - fallback random video
  // - analytics

  return data;
}
