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
  savedQualityValue:
    parseInt(localStorage.getItem(SETTINGS.qualityPosition)) || 1080,
  savedQualityIndex: 0,
  autoplayEnabled: localStorage.getItem(SETTINGS.autoplayEnabled) === "1",
  repeatEnabled: localStorage.getItem(SETTINGS.repeatEnabled) === "1",
  player: null,
  qualityMenu: null,
  qualityBtn: null,
  settingsMenu: null,
  settingsBtn: null,
  audioSettingsBtn: null,
  isMobile: window.innerWidth <= 900,
  overlay: null,

  // Bottom Sheet состояние
  sheet: {
    isDragging: false,
    startY: 0,
    currentY: 0,
    offset: 0, // текущее смещение в пикселях
    velocity: 0,
    lastMoveY: 0,
    lastMoveTime: 0,
    isClosing: false,
    maxOffset: 0, // максимальное смещение (высота меню)
    isAtTop: true, // скролл вверху
  },
};

/**
 * Проверка на мобильное устройство
 */
function isMobileDevice() {
  return window.innerWidth <= 900;
}

/**
 * Создание оверлея для мобильного меню
 */
function createOverlay() {
  if (state.overlay) return state.overlay;

  const overlay = document.createElement("div");
  overlay.className = "settings-overlay";
  overlay.id = "settingsOverlay";
  document.body.appendChild(overlay);

  state.overlay = overlay;
  return overlay;
}

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

  createOverlay();
  addMobileHeader();
  setupEventListeners();
  window.addEventListener("resize", handleResize);

  // Заменяем setupSwipeToClose на setupBottomSheet
  setupBottomSheet();

  return {
    autoplayEnabled: state.autoplayEnabled,
    repeatEnabled: state.repeatEnabled,
  };
}

/**
 * Добавление заголовка в мобильное меню
 */
function addMobileHeader() {
  if (!state.settingsMenu) return;

  // Проверяем, есть ли уже заголовок
  if (state.settingsMenu.querySelector(".settings-header")) return;

  const header = document.createElement("div");
  header.className = "settings-header";
  header.innerHTML = `
    <span>Настройки</span>
    <button class="settings-close" id="settingsCloseBtn">✕</button>
  `;

  // Вставляем в начало меню
  state.settingsMenu.prepend(header);

  // Обработчик закрытия
  const closeBtn = header.querySelector(".settings-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllMenus();
    });
  }
}

/**
 * Обработка изменения размера окна
 */
function handleResize() {
  const isMobile = isMobileDevice();
  state.isMobile = isMobile;

  if (isMobile) {
    state.settingsMenu.classList.add("mobile-bottom");
  } else {
    state.settingsMenu.classList.remove("mobile-bottom");
    // Закрываем меню при переходе на десктоп
    closeAllMenus();
  }
}

/**
 * Находит лучший индекс качества на основе сохраненного значения
 */
function findBestQualityIndex(levels) {
  if (!levels || levels.length === 0) return 0;

  const savedValue = state.savedQualityValue || 1080;
  let bestIndex = 0;
  let bestDiff = Infinity;

  // Ищем качество, максимально близкое к сохраненному, но не выше
  for (let i = 0; i < levels.length; i++) {
    const height = levels[i].height;
    if (height <= savedValue) {
      const diff = savedValue - height;
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      }
    }
  }

  // Если не нашли подходящее (все качества выше сохраненного),
  // берем минимальное доступное
  if (bestDiff === Infinity) {
    bestIndex = 0;
  }

  return bestIndex;
}

/**
 * Установка HLS инстанса для управления качеством
 */
/**
 * Установка HLS инстанса для управления качеством
 */
export function setHlsInstance(hlsInstance) {
  state.hlsInstance = hlsInstance;

  // --- ДОБАВЛЕНО: Слушаем событие переключения качества ---
  if (hlsInstance) {
    hlsInstance.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
      const level = data.level;
      if (level !== undefined && level >= 0) {
        state.savedQualityIndex = level;
        updateCurrentQualityDisplay(level);

        // Обновляем активный элемент в меню качества
        if (state.qualityMenu) {
          const items = state.qualityMenu.querySelectorAll(".settings-quality");
          items.forEach((i) => i.classList.remove("active"));
          if (items[level]) items[level].classList.add("active");
        }
      }
    });
  }
  // --- КОНЕЦ ДОБАВЛЕННОГО БЛОКА ---

  // Обновляем отображение качества после установки hlsInstance
  if (hlsInstance && hlsInstance.levels) {
    const targetIndex = findBestQualityIndex(hlsInstance.levels);
    state.savedQualityIndex = targetIndex;
    setTimeout(() => {
      updateCurrentQualityDisplay(targetIndex);
    }, 50);
  }
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

  // Находим подходящий индекс качества
  const targetIndex = findBestQualityIndex(levels);
  state.savedQualityIndex = targetIndex;

  // Устанавливаем качество
  if (state.hlsInstance.currentLevel !== undefined) {
    state.hlsInstance.currentLevel = targetIndex;
  }

  setTimeout(() => {
    const items = qualityMenu.querySelectorAll(".settings-quality");
    items.forEach((i) => i.classList.remove("active"));
    if (items[targetIndex]) items[targetIndex].classList.add("active");

    // Обновляем отображение текущего качества
    updateCurrentQualityDisplay(targetIndex);
  }, 0);
}

export function refreshQualityDisplay() {
  if (
    !state.hlsInstance ||
    !state.hlsInstance.levels ||
    state.hlsInstance.levels.length === 0
  ) {
    // Если HLS еще не загружен, пробуем позже
    setTimeout(() => {
      refreshQualityDisplay();
    }, 500);
    return;
  }

  const levels = state.hlsInstance.levels;
  const targetIndex = findBestQualityIndex(levels);
  state.savedQualityIndex = targetIndex;

  if (state.hlsInstance.currentLevel !== undefined) {
    state.hlsInstance.currentLevel = targetIndex;
  }

  updateCurrentQualityDisplay(targetIndex);

  // --- ДОБАВЛЕНО: Обновляем активный элемент в меню качества ---
  if (state.qualityMenu) {
    const items = state.qualityMenu.querySelectorAll(".settings-quality");
    items.forEach((i) => i.classList.remove("active"));
    if (items[targetIndex]) items[targetIndex].classList.add("active");
  }
  // --- КОНЕЦ ДОБАВЛЕННОГО БЛОКА ---
}
/**
 * Обновление отображения текущего качества
 */
function updateCurrentQualityDisplay(levelIndex) {
  const qualityBtn = state.qualityBtn;
  if (!qualityBtn) {
    console.warn("qualityBtn не найден");
    return;
  }

  // Ищем или создаем элемент для отображения качества
  let qualityLabel = qualityBtn.querySelector(".quality-label");

  if (!qualityLabel) {
    // Создаем элемент, если его нет
    qualityLabel = document.createElement("span");
    qualityLabel.className = "quality-label";

    // Вставляем перед стрелкой
    const arrow = qualityBtn.querySelector(".arrow");
    if (arrow) {
      qualityBtn.insertBefore(qualityLabel, arrow);
    } else {
      qualityBtn.appendChild(qualityLabel);
    }
  }

  // Обновляем текст
  if (
    state.hlsInstance &&
    state.hlsInstance.levels &&
    state.hlsInstance.levels.length > 0
  ) {
    const levels = state.hlsInstance.levels;
    // Убеждаемся, что индекс валидный
    const idx = Math.min(Math.max(0, levelIndex), levels.length - 1);
    if (levels[idx] && levels[idx].height) {
      qualityLabel.textContent = levels[idx].height + "p";
      qualityLabel.style.display = ""; // Показываем если был скрыт
    } else {
      qualityLabel.textContent = "";
      qualityLabel.style.display = "none";
    }
  } else {
    qualityLabel.textContent = "";
    qualityLabel.style.display = "none";
  }
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
    state.savedQualityIndex = level;

    // Сохраняем реальное значение качества (высоту в пикселях)
    if (state.hlsInstance.levels && state.hlsInstance.levels[level]) {
      const qualityValue = state.hlsInstance.levels[level].height;
      state.savedQualityValue = qualityValue;
      localStorage.setItem(SETTINGS.qualityPosition, qualityValue);
    }

    state.player.style.display = "block";
    const audioWrapper = document.getElementById("audioWrapper");
    if (audioWrapper) {
      audioWrapper.style.display = "none";
    }
    state.player.play();

    // Обновляем отображение текущего качества
    updateCurrentQualityDisplay(level);
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
    qualityPosition: state.savedQualityIndex,
  };
}

/**
 * Открытие меню настроек
 */
function openSettingsMenu() {
  if (!state.settingsMenu) return;

  const menu = state.settingsMenu;
  const isMobile = isMobileDevice();

  // Сбрасываем состояние Bottom Sheet
  const sheet = state.sheet;
  sheet.isDragging = false;
  sheet.isClosing = false;
  sheet.startY = 0;
  sheet.currentY = 0;
  sheet.offset = 0;
  sheet.velocity = 0;

  if (isMobile) {
    menu.classList.add("mobile-bottom");

    if (state.qualityMenu) {
      state.qualityMenu.style.display = "none";
      state.qualityMenu.classList.remove("active");
    }

    menu.classList.add("open");
    menu.style.transform = "";
    menu.style.transition = "";
    menu.style.display = "";
    menu.style.opacity = "";
    menu.style.pointerEvents = "";

    const videoWrapper = document.getElementById("videoWrapper");
    if (videoWrapper) {
      videoWrapper.classList.add("menu-open");
    }

    document.body.style.overflow = "hidden";

    history.pushState({ settingsOpen: true }, "", location.href);
  } else {
    menu.classList.remove("mobile-bottom");

    if (state.qualityMenu) {
      state.qualityMenu.style.display = "none";
      state.qualityMenu.classList.remove("active");
    }

    menu.classList.add("open");
    menu.style.transform = "";
    menu.style.transition = "";
    menu.style.display = "";
    menu.style.opacity = "";
    menu.style.pointerEvents = "";
  }
}

/**
 * Закрытие всех меню
 */
function closeAllMenus() {
  const sheet = state.sheet;
  sheet.isDragging = false;
  sheet.isClosing = false;
  sheet.startY = 0;
  sheet.currentY = 0;
  sheet.offset = 0;
  sheet.velocity = 0;

  const videoWrapper = document.getElementById("videoWrapper");
  if (videoWrapper) {
    videoWrapper.classList.remove("menu-open");
  }

  if (state.qualityMenu) {
    state.qualityMenu.style.display = "none";
    state.qualityMenu.classList.remove("active");
  }

  if (state.settingsMenu) {
    state.settingsMenu.classList.remove("open");
    state.settingsMenu.classList.remove("dragging");
    state.settingsMenu.style.transform = "";
    state.settingsMenu.style.transition = "";
    state.settingsMenu.style.display = "";
    state.settingsMenu.style.opacity = "";
    state.settingsMenu.style.pointerEvents = "";
  }

  document.body.style.overflow = "";
}

/**
 * Установка обработчиков Bottom Sheet
 */
function setupBottomSheet() {
  if (!state.settingsMenu) return;

  const menu = state.settingsMenu;

  menu.addEventListener("touchstart", onSheetTouchStart, { passive: true });
  menu.addEventListener("touchmove", onSheetTouchMove, { passive: false });
  menu.addEventListener("touchend", onSheetTouchEnd, { passive: true });
  menu.addEventListener("touchcancel", onSheetTouchCancel, { passive: true });
}

/**
 * Начало касания
 */
function onSheetTouchStart(e) {
  if (!state.settingsMenu.classList.contains("open")) return;
  if (e.touches.length !== 1) return;

  const menu = state.settingsMenu;
  const sheet = state.sheet;

  // Проверяем скролл
  sheet.isAtTop = menu.scrollTop <= 0;

  // Если скролл не вверху - не перехватываем жест
  if (!sheet.isAtTop) return;

  sheet.startY = e.touches[0].clientY;
  sheet.currentY = sheet.startY;
  sheet.isDragging = true;
  sheet.isClosing = false;
  sheet.velocity = 0;
  sheet.lastMoveY = sheet.startY;
  sheet.lastMoveTime = Date.now();

  // Отключаем transition
  menu.style.transition = "none";
  menu.classList.add("dragging");

  // Сохраняем максимальное смещение
  sheet.maxOffset = menu.getBoundingClientRect().height;
}

/**
 * Движение пальца
 */
function onSheetTouchMove(e) {
  if (!state.sheet.isDragging) return;
  if (e.touches.length !== 1) return;

  const menu = state.settingsMenu;
  const sheet = state.sheet;

  sheet.currentY = e.touches[0].clientY;
  const deltaY = sheet.currentY - sheet.startY;

  // Вычисляем скорость
  const now = Date.now();
  const timeDelta = now - sheet.lastMoveTime;
  if (timeDelta > 0) {
    const moveDelta = sheet.currentY - sheet.lastMoveY;
    sheet.velocity = moveDelta / timeDelta;
  }
  sheet.lastMoveY = sheet.currentY;
  sheet.lastMoveTime = now;

  // Только движение вниз
  if (deltaY <= 0) {
    // Если тянем вверх - возвращаем в исходное положение
    menu.style.transform = "";
    return;
  }

  // Расчет смещения с резиновым эффектом
  const maxOffset = sheet.maxOffset;
  let offset = deltaY;

  // Резиновый эффект (сопротивление при сильном натяжении)
  if (offset > maxOffset * 0.3) {
    const resistance =
      1 - ((offset - maxOffset * 0.3) / (maxOffset * 0.7)) * 0.5;
    offset =
      maxOffset * 0.3 + (offset - maxOffset * 0.3) * Math.max(0.3, resistance);
  }

  sheet.offset = offset;

  // Применяем трансформацию
  menu.style.transform = `translateY(${offset}px)`;
}

/**
 * Окончание касания
 */
function onSheetTouchEnd(e) {
  const sheet = state.sheet;
  if (!sheet.isDragging) return;
  sheet.isDragging = false;

  const menu = state.settingsMenu;
  const offset = sheet.offset;
  const velocity = sheet.velocity;
  const maxOffset = sheet.maxOffset;

  // Убираем класс dragging
  menu.classList.remove("dragging");

  // Возвращаем transition
  menu.style.transition = "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)";

  // Проверяем условия закрытия
  const shouldClose =
    offset > maxOffset * 0.15 || // Протащили больше 15%
    velocity > 0.5 || // Быстрый флик вниз
    (velocity > 0.3 && offset > maxOffset * 0.1); // Комбинация

  if (shouldClose && !sheet.isClosing) {
    sheet.isClosing = true;

    // Анимация закрытия
    menu.style.transform = `translateY(${maxOffset + 50}px)`;

    setTimeout(() => {
      closeAllMenus();
      menu.style.transform = "";
      menu.style.transition = "";
      sheet.isClosing = false;
    }, 350);
  } else {
    // Возврат на место
    menu.style.transform = "";

    setTimeout(() => {
      menu.style.transition = "";
    }, 400);
  }

  // Сброс состояния
  sheet.startY = 0;
  sheet.currentY = 0;
  sheet.offset = 0;
  sheet.velocity = 0;
}

/**
 * Отмена касания
 */
function onSheetTouchCancel(e) {
  const sheet = state.sheet;
  if (!sheet.isDragging) return;

  sheet.isDragging = false;
  const menu = state.settingsMenu;

  menu.classList.remove("dragging");
  menu.style.transition = "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
  menu.style.transform = "";

  sheet.startY = 0;
  sheet.currentY = 0;
  sheet.offset = 0;
  sheet.velocity = 0;
  sheet.isClosing = false;
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

      const isVisible = state.qualityMenu.style.display === "flex";

      if (isVisible) {
        // Закрываем меню качества
        state.qualityMenu.style.display = "none";
        state.qualityMenu.classList.remove("active");
        state.qualityMenu.style.maxHeight = "";
        state.qualityMenu.style.overflowY = "";
      } else {
        // Открываем меню качества
        state.qualityMenu.style.display = "flex";
        state.qualityMenu.classList.add("active");

        // На мобилке скроллим к меню качества
        if (isMobileDevice()) {
          setTimeout(() => {
            if (state.qualityMenu) {
              state.qualityMenu.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }
          }, 100);
        }
      }
    };
  }

  // --- Клик по пункту качества ---
  if (state.qualityMenu) {
    state.qualityMenu.addEventListener("click", (e) => {
      const item = e.target.closest(".settings-quality");
      if (!item) return;

      const mode = item.dataset.quality;

      if (mode !== undefined) {
        // Обновляем активный элемент
        state.qualityMenu
          .querySelectorAll(".settings-quality")
          .forEach((i) => i.classList.remove("active"));

        item.classList.add("active");

        handleQualitySelect(mode);
      }
    });
  }

  // --- Клик по пунктам меню настроек (autoplay, repeat) ---
  if (state.settingsMenu) {
    state.settingsMenu.addEventListener("click", (e) => {
      // Находим элемент с data-action
      const item = e.target.closest("[data-action]");
      if (!item) return;

      const action = item.dataset.action;

      if (action === "autoplay") {
        const result = toggleAutoplay();
        // Обновляем иконки через события
        document.dispatchEvent(
          new CustomEvent("settingsUpdated", { detail: result }),
        );
      } else if (action === "repeat") {
        const result = toggleRepeat();
        document.dispatchEvent(
          new CustomEvent("settingsUpdated", { detail: result }),
        );
      }
      // Не закрываем меню!
    });
  }

  // --- Закрытие по клику вне (для всех устройств) ---
  document.addEventListener("click", (e) => {
    const settingsMenu = state.settingsMenu;
    const qualityMenu = state.qualityMenu;
    const settingsBtn = state.settingsBtn;
    const qualityBtn = state.qualityBtn;

    // Проверяем, был ли клик внутри меню или по кнопкам
    if (settingsMenu && settingsMenu.contains(e.target)) return;
    if (qualityMenu && qualityMenu.contains(e.target)) return;
    if (settingsBtn && settingsBtn.contains(e.target)) return;
    if (qualityBtn && qualityBtn.contains(e.target)) return;

    // Если клик был вне меню - закрываем
    closeAllMenus();
  });

  // --- Обработка кнопки "Назад" на телефоне ---
  window.addEventListener("popstate", (e) => {
    if (state.settingsMenu && state.settingsMenu.classList.contains("open")) {
      // Добавляем запись в историю, чтобы отменить переход назад
      history.pushState(null, "", location.href);
      closeAllMenus();
      e.preventDefault();
    }
  });

  // --- Обработка Escape ---
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllMenus();
    }
  });
}

/**
 * Инициализация обработчиков качества после загрузки HLS
 */
export function initQualityHandlers() {
  // Обработчики уже установлены в setupEventListeners
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
  refreshQualityDisplay,
};
