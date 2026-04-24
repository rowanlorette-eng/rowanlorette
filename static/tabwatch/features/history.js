const STORAGE_KEY = "autoplayWatched";

/**
 * Получить историю просмотренных видео
 */
export function getWatched() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

/**
 * Добавить видео в историю
 */
export function addWatched(videoId) {
  const watched = getWatched();

  if (!watched.includes(videoId)) {
    watched.push(videoId);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(watched));
  }
}

/**
 * Проверка
 */
export function isWatched(videoId) {
  return getWatched().includes(videoId);
}

/**
 * Очистка истории
 */
export function clearWatched() {
  sessionStorage.removeItem(STORAGE_KEY);
}
