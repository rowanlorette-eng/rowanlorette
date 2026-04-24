// core/state.js

export const state = {
  // --- ROUTING ---
  videoId: new URLSearchParams(location.search).get("v"),

  // --- PLAYER ---
  player: {
    hls: null,
    isPlaying: false,
    volume: Number(localStorage.getItem("playerVolume") ?? 1),
    muted: false,
    quality: Number(localStorage.getItem("qualityPosition") ?? 0),
    duration: 0,
    currentTime: 0,
  },

  // --- UI ---
  ui: {
    controlsVisible: true,
    settingsOpen: false,
    qualityMenuOpen: false,
    descriptionExpanded: false,
    loading: false,
  },

  // --- AUTOPLAY ---
  autoplay: {
    enabled: localStorage.getItem("autoplayEnabled") === "1",
    repeat: localStorage.getItem("repeatEnabled") === "1",
    watched: JSON.parse(sessionStorage.getItem("autoplayWatched") || "[]"),
  },

  // --- VIDEO LIST ---
  list: {
    offset: 0,
    limit: 10,
    loading: false,
    ended: false,
  },

  // --- MOBILE ---
  mobile: {
    fullscreen: false,
    pinchScale: 1,
  },
};
