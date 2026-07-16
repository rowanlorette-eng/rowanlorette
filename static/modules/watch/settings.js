// modules/settings.js

/**
 * Модуль управления настройками видеоплеера
 */

// --- Конфигурация ---
const SETTINGS = {
  qualityPosition: "qualityPosition",
  autoplayEnabled: "autoplayEnabled",
  repeatEnabled: "repeatEnabled",
  playerVolume: "playerVolume",
};

// --- Состояние ---
let state = {
  hlsInstance: null,
  savedQualityPosition:
    Number(localStorage.getItem(SETTINGS.qualityPosition)) || 0,
  autoplayEnabled: localStorage.getItem(SETTINGS.autoplayEnabled) === "1",
  repeatEnabled: localStorage.getItem(SETTINGS.repeatEnabled) === "1",
  player: null,
  qualityMenu: null,
  qualityBtn: null,
  settingsMenu: null,
  settingsBtn: null,
  audioSettingsBtn: null,
};

/**
 * Инициализация модуля настроек
 */
export function initSettings(
  playerElement,
  qualityMenuElement,
  qualityBtnElement,
  settingsMenuElement,
  settingsBtnElement,
  audioSettingsBtnElement,
) {
  state.player = playerElement;
  state.qualityMenu = qualityMenuElement;
  state.qualityBtn = qualityBtnElement;
  state.settingsMenu = settingsMenuElement;
  state.settingsBtn = settingsBtnElement;
  state.audioSettingsBtn = audioSettingsBtnElement;

  // Навешиваем обработчики
  setupEventListeners();

  // Возвращаем начальное состояние для автоплея и повтора
  return {
    autoplayEnabled: state.autoplayEnabled,
    repeatEnabled: state.repeatEnabled,
  };
}

/**
 * Установка HLS инстанса для управления качеством
 */
export function setHlsInstance(hlsInstance) {
  state.hlsInstance = hlsInstance;
}

/**
 * Заполнение меню качества
 */
export function populateQualityMenu(levels) {
  if (!state.qualityMenu) {
    console.error("qualityMenu не инициализирован");
    return;
  }

  if (!state.hlsInstance || !levels || levels.length === 0) {
    console.error("HLS инстанс или уровни качества не доступны");
    return;
  }

  const qualityMenu = state.qualityMenu;
  qualityMenu.innerHTML = "";

  // Строим меню качества
  levels.forEach((level, idx) => {
    const item = document.createElement("div");
    item.className = "settings-quality";
    item.dataset.quality = idx;
    item.textContent = level.height + "p";
    qualityMenu.appendChild(item);
  });

  // Подсветка дефолтного качества
  const pos = Math.min(state.savedQualityPosition, levels.length - 1);

  if (state.hlsInstance.currentLevel !== undefined) {
    state.hlsInstance.currentLevel = pos;
  }

  setTimeout(() => {
    const items = qualityMenu.querySelectorAll(".settings-quality");
    items.forEach((i) => i.classList.remove("active"));
    if (items[pos]) items[pos].classList.add("active");
  }, 0);
}

/**
 * Обработка выбора качества
 */
function handleQualitySelect(levelIndex) {
  if (!state.hlsInstance) return;

  if (levelIndex === "audio") {
    // Audio-only режим
    state.player.style.display = "none";
    const audioWrapper = document.getElementById("audioWrapper");
    if (audioWrapper) {
      audioWrapper.style.display = "block";
      const audioPlayer = document.getElementById("audioPlayer");
      if (audioPlayer) audioPlayer.play();
    }
  } else {
    const level = parseInt(levelIndex);
    state.hlsInstance.currentLevel = level;
    state.savedQualityPosition = level;
    localStorage.setItem(SETTINGS.qualityPosition, level);

    state.player.style.display = "block";
    const audioWrapper = document.getElementById("audioWrapper");
    if (audioWrapper) {
      audioWrapper.style.display = "none";
    }
    state.player.play();
  }

  // Закрываем меню
  closeAllMenus();
}

/**
 * Переключение автоплея
 */
export function toggleAutoplay() {
  state.autoplayEnabled = !state.autoplayEnabled;
  localStorage.setItem(
    SETTINGS.autoplayEnabled,
    state.autoplayEnabled ? "1" : "0",
  );

  // Если включаем автоплей - выключаем повтор
  if (state.autoplayEnabled) {
    state.repeatEnabled = false;
    localStorage.setItem(SETTINGS.repeatEnabled, "0");
  }

  return {
    autoplayEnabled: state.autoplayEnabled,
    repeatEnabled: state.repeatEnabled,
  };
}

/**
 * Переключение повтора
 */
export function toggleRepeat() {
  state.repeatEnabled = !state.repeatEnabled;
  localStorage.setItem(SETTINGS.repeatEnabled, state.repeatEnabled ? "1" : "0");

  // Если включаем повтор - выключаем автоплей
  if (state.repeatEnabled) {
    state.autoplayEnabled = false;
    localStorage.setItem(SETTINGS.autoplayEnabled, "0");
  }

  return {
    autoplayEnabled: state.autoplayEnabled,
    repeatEnabled: state.repeatEnabled,
  };
}

/**
 * Получение текущих настроек
 */
export function getSettings() {
  return {
    autoplayEnabled: state.autoplayEnabled,
    repeatEnabled: state.repeatEnabled,
    qualityPosition: state.savedQualityPosition,
  };
}

/**
 * Открытие меню настроек
 */
function openSettingsMenu() {
  if (!state.settingsMenu) return;

  const menu = state.settingsMenu;

  // Закрываем меню качества
  if (state.qualityMenu) {
    state.qualityMenu.style.display = "none";
    state.qualityMenu.classList.remove("active");
  }

  // Открываем меню настроек через класс
  menu.classList.add("open");
  // Убираем inline стили, чтобы не конфликтовать с CSS
  menu.style.display = "";
  menu.style.opacity = "";
  menu.style.pointerEvents = "";
  menu.style.transform = "";
}

/**
 * Закрытие всех меню
 */
function closeAllMenus() {
  // Закрываем меню качества
  if (state.qualityMenu) {
    state.qualityMenu.style.display = "none";
    state.qualityMenu.classList.remove("active");
  }

  // Закрываем меню настроек
  if (state.settingsMenu) {
    state.settingsMenu.classList.remove("open");
    // Убираем inline стили
    state.settingsMenu.style.display = "";
    state.settingsMenu.style.opacity = "";
    state.settingsMenu.style.pointerEvents = "";
    state.settingsMenu.style.transform = "";
  }
}

/**
 * Переключение видимости меню настроек
 */
function toggleSettingsMenu() {
  if (!state.settingsMenu) return;

  const menu = state.settingsMenu;

  if (menu.classList.contains("open")) {
    closeAllMenus();
  } else {
    openSettingsMenu();
  }
}

/**
 * Настройка обработчиков событий
 */
function setupEventListeners() {
  // --- Клик по кнопке настроек ---
  if (state.settingsBtn) {
    state.settingsBtn.onclick = (e) => {
      e.stopPropagation();
      toggleSettingsMenu();
    };
  }

  // --- Клик по кнопке аудио настроек ---
  if (state.audioSettingsBtn) {
    state.audioSettingsBtn.onclick = (e) => {
      e.stopPropagation();
      const audioControls = document.querySelector(".audio-controls");
      if (audioControls) {
        audioControls.querySelector(".settings-menu")?.remove();
      }
      toggleSettingsMenu();
    };
  }

  // --- Клик по кнопке качества ---
  if (state.qualityBtn) {
    state.qualityBtn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (!state.qualityMenu) return;

      // Если меню настроек закрыто - открываем его
      if (
        !state.settingsMenu ||
        !state.settingsMenu.classList.contains("open")
      ) {
        openSettingsMenu();
      }

      // Переключаем меню качества
      const isVisible = state.qualityMenu.style.display === "flex";
      state.qualityMenu.style.display = isVisible ? "none" : "flex";
      if (!isVisible) {
        state.qualityMenu.classList.add("active");
      } else {
        state.qualityMenu.classList.remove("active");
      }
    };
  }

  // --- Клик по пункту качества ---
  if (state.qualityMenu) {
    state.qualityMenu.onclick = (e) => {
      const item = e.target.closest(".settings-quality");
      if (!item) return;

      const mode = item.dataset.quality;
      if (mode !== undefined) {
        // Снимаем активный класс со всех
        state.qualityMenu
          .querySelectorAll(".settings-quality")
          .forEach((i) => i.classList.remove("active"));
        item.classList.add("active");

        handleQualitySelect(mode);
      }
    };
  }

  // --- Закрытие по клику вне ---
  document.addEventListener("click", (e) => {
    // Проверяем, был ли клик внутри меню настроек или качества
    const settingsMenu = state.settingsMenu;
    const qualityMenu = state.qualityMenu;
    const settingsBtn = state.settingsBtn;
    const qualityBtn = state.qualityBtn;

    // Если клик внутри меню или по кнопкам - не закрываем
    if (settingsMenu && settingsMenu.contains(e.target)) return;
    if (qualityMenu && qualityMenu.contains(e.target)) return;
    if (settingsBtn && settingsBtn.contains(e.target)) return;
    if (qualityBtn && qualityBtn.contains(e.target)) return;

    closeAllMenus();
  });

  // --- Не закрывать меню при клике по ним ---
  if (state.settingsMenu) {
    state.settingsMenu.addEventListener("click", (e) => e.stopPropagation());
  }
  if (state.qualityMenu) {
    state.qualityMenu.addEventListener("click", (e) => e.stopPropagation());
  }
}

/**
 * Инициализация обработчиков качества после загрузки HLS
 */
export function initQualityHandlers() {
  // Обработчики уже установлены в setupEventListeners
  // Эта функция для обратной совместимости
}

export default {
  initSettings,
  setHlsInstance,
  populateQualityMenu,
  toggleAutoplay,
  toggleRepeat,
  getSettings,
  initQualityHandlers,
  openSettingsMenu,
  closeAllMenus,
};
