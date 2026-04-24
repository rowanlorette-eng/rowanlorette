// core/events.js

const listeners = {};

/**
 * Подписка на событие
 */
export function on(event, callback) {
  if (!listeners[event]) {
    listeners[event] = [];
  }
  listeners[event].push(callback);
}

/**
 * Отписка (важно для очистки)
 */
export function off(event, callback) {
  if (!listeners[event]) return;

  listeners[event] = listeners[event].filter((cb) => cb !== callback);
}

/**
 * Одноразовая подписка
 */
export function once(event, callback) {
  function wrapper(data) {
    callback(data);
    off(event, wrapper);
  }
  on(event, wrapper);
}

/**
 * Генерация события
 */
export function emit(event, payload = null) {
  if (!listeners[event]) return;

  for (const cb of listeners[event]) {
    try {
      cb(payload);
    } catch (e) {
      console.error(`Event error [${event}]`, e);
    }
  }
}
