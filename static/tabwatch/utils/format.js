export function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * формат числа (например 1200 -> 1.2K)
 */
export function formatNumber(num) {
  if (num === null || num === undefined) return "0";

  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";

  return String(num);
}

/**
 * обрезка текста
 */
export function truncate(text, max = 100) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "..." : text;
}
