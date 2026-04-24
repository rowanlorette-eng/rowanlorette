import { formatTime } from "./format.js";

/**
 * текущее unix time
 */
export function now() {
  return Date.now();
}

/**
 * разница времени (ms → readable)
 */
export function diff(from, to = now()) {
  return to - from;
}

/**
 * конвертация ms → formatted
 */
export function msToTime(ms) {
  return formatTime(ms / 1000);
}

/**
 * проверка: прошло ли время
 */
export function hasExpired(timestamp, ttlMs) {
  return now() - timestamp > ttlMs;
}
