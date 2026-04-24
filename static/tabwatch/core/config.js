// core/config.js

export const config = {
  API: {
    BASE: "/api",
    VIDEOS: "/videos",
    VIDEO: "/video",
    RANDOM: "/random",
  },

  PLAYER: {
    AUTO_HIDE_MS: 3000,
    SEEK_STEP: 10, // секунд
    MAX_SCALE: 3,
    MIN_SCALE: 1,
  },

  LIST: {
    INITIAL_LIMIT: 10,
    LOAD_MORE: 10,
    MAX_DOM_ITEMS: 50,
  },

  STORAGE_KEYS: {
    VOLUME: "playerVolume",
    QUALITY: "qualityPosition",
    AUTOPLAY: "autoplayEnabled",
    REPEAT: "repeatEnabled",
    WATCHED: "autoplayWatched",
  },

  EVENTS: {
    VIDEO_LOAD: "video:load",
    VIDEO_LOADED: "video:loaded",
    VIDEO_CHANGE: "video:change",
    VIDEO_ENDED: "video:ended",

    PLAYER_PLAY: "player:play",
    PLAYER_PAUSE: "player:pause",
    PLAYER_SEEK: "player:seek",
    PLAYER_VOLUME: "player:volume",

    UI_TOGGLE_CONTROLS: "ui:toggle_controls",
    UI_SETTINGS_OPEN: "ui:settings_open",
  },
};
