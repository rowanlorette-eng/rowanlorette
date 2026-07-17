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
    parseInt(localStorage.getItem(SETTINGS.qualityPosition)) || 1080, // Сохраняем значение в пикселях
  savedQualityIndex: 0, // Индекс в текущем массиве уровней
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

  // Создаем оверлей для мобилки
  createOverlay();

  // Добавляем заголовок в меню для мобилки
  addMobileHeader();

  // Навешиваем обработчики
  setupEventListeners();

  // Обработка изменения размера окна
  window.addEventListener("resize", handleResize);

  setupSwipeToClose();

  // Возвращаем начальное состояние для автоплея и повтора
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
/**
 * Открытие меню настроек
 */
function openSettingsMenu() {
  if (!state.settingsMenu) return;

  const menu = state.settingsMenu;
  const isMobile = isMobileDevice();

  if (isMobile) {
    // Мобильный режим - как на YouTube
    menu.classList.add("mobile-bottom");

    // Показываем оверлей
    if (state.overlay) {
      state.overlay.classList.add("active");
    }

    // Закрываем меню качества
    if (state.qualityMenu) {
      state.qualityMenu.style.display = "none";
      state.qualityMenu.classList.remove("active");
      state.qualityMenu.style.maxHeight = "";
      state.qualityMenu.style.overflowY = "";
    }

    // Открываем меню
    menu.classList.add("open");

    // Убираем старые inline стили
    menu.style.display = "";
    menu.style.opacity = "";
    menu.style.pointerEvents = "";
    menu.style.transform = "";
    menu.style.maxHeight = "";
    menu.style.overflowY = "";

    // Поднимаем videoWrapper выше описания
    const videoWrapper = document.getElementById("videoWrapper");
    if (videoWrapper) {
      videoWrapper.classList.add("menu-open");
    }

    // Блокируем скролл страницы
    document.body.style.overflow = "hidden";
  } else {
    // Десктопный режим
    menu.classList.remove("mobile-bottom");

    // Закрываем меню качества
    if (state.qualityMenu) {
      state.qualityMenu.style.display = "none";
      state.qualityMenu.classList.remove("active");
      state.qualityMenu.style.maxHeight = "";
      state.qualityMenu.style.overflowY = "";
    }

    menu.classList.add("open");
    menu.style.display = "";
    menu.style.opacity = "";
    menu.style.pointerEvents = "";
    menu.style.transform = "";
    menu.style.maxHeight = "";
    menu.style.overflowY = "";
  }
}

/**
 * Закрытие всех меню
 */
/**
 * Закрытие всех меню
 */
function closeAllMenus() {
  // Убираем класс menu-open с videoWrapper
  const videoWrapper = document.getElementById("videoWrapper");
  if (videoWrapper) {
    videoWrapper.classList.remove("menu-open");
  }

  // Закрываем меню качества
  if (state.qualityMenu) {
    state.qualityMenu.style.maxHeight = "";
    state.qualityMenu.style.overflowY = "";
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

  // Скрываем оверлей
  if (state.overlay) {
    state.overlay.classList.remove("active");
  }

  // Разблокируем скролл страницы
  document.body.style.overflow = "";
}

/**
 * Обработка свайпа вниз для закрытия меню (мобильная версия)
 */
/**
 * Обработка свайпа вниз для закрытия меню (как на YouTube)
 */
function setupSwipeToClose() {
  if (!state.settingsMenu) return;

  let startY = 0;
  let currentY = 0;
  let isDragging = false;
  let menuHeight = 0;
  let startTransform = 0;

  const menu = state.settingsMenu;

  // Начало касания
  menu.addEventListener(
    "touchstart",
    (e) => {
      if (!menu.classList.contains("open")) return;
      if (e.touches.length !== 1) return;

      // Проверяем, что скролл вверху
      if (menu.scrollTop > 0) return;

      startY = e.touches[0].clientY;
      currentY = startY;
      isDragging = true;
      menuHeight = menu.getBoundingClientRect().height;
      startTransform = 0;

      // Убираем transition для плавного следования за пальцем
      menu.style.transition = "none";
    },
    { passive: true },
  );

  // Перемещение пальца
  menu.addEventListener(
    "touchmove",
    (e) => {
      if (!isDragging) return;
      if (e.touches.length !== 1) return;

      currentY = e.touches[0].clientY;
      const diff = currentY - startY;

      // Только если тянем вниз
      if (diff <= 0) {
        // Если тянем вверх - возвращаем на место
        menu.style.transform = "";
        menu.style.opacity = "";
        return;
      }

      // Вычисляем прогресс свайпа
      const maxOffset = menuHeight * 0.5;
      const offset = Math.min(diff, maxOffset);
      const progress = offset / maxOffset;

      // Плавно смещаем меню вниз и уменьшаем прозрачность
      menu.style.transform = `translateY(${offset}px)`;
      menu.style.opacity = 1 - progress * 0.6;

      // Изменяем цвет полоски при свайпе
      if (progress > 0.2) {
        menu.classList.add("swiping");
      } else {
        menu.classList.remove("swiping");
      }
    },
    { passive: true },
  );

  // Отпускание пальца
  menu.addEventListener(
    "touchend",
    (e) => {
      if (!isDragging) return;
      isDragging = false;

      const diff = currentY - startY;
      const threshold = menuHeight * 0.15; // 15% высоты меню

      // Возвращаем анимацию
      menu.style.transition =
        "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
      menu.classList.remove("swiping");

      if (diff > threshold && diff > 0) {
        // Закрываем меню с анимацией вниз
        const remaining = menuHeight - menuHeight * 0.5;
        menu.style.transform = `translateY(${menuHeight}px)`;
        menu.style.opacity = "0";

        // Закрываем после завершения анимации
        setTimeout(() => {
          closeAllMenus();
          // Сбрасываем стили
          menu.style.transform = "";
          menu.style.opacity = "";
          menu.style.transition = "";
        }, 350);
      } else {
        // Возвращаем на место с анимацией
        menu.style.transform = "";
        menu.style.opacity = "";

        // Сбрасываем transition через небольшую задержку
        setTimeout(() => {
          menu.style.transition = "";
        }, 400);
      }

      startY = 0;
      currentY = 0;
    },
    { passive: true },
  );

  // Если палец ушел за пределы меню
  menu.addEventListener(
    "touchcancel",
    () => {
      if (isDragging) {
        isDragging = false;
        menu.style.transition =
          "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
        menu.style.transform = "";
        menu.style.opacity = "";
        menu.classList.remove("swiping");

        setTimeout(() => {
          menu.style.transition = "";
        }, 400);

        startY = 0;
        currentY = 0;
      }
    },
    { passive: true },
  );
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

  // --- Закрытие по клику на оверлей (только для мобилки) ---
  if (state.overlay) {
    state.overlay.addEventListener("click", (e) => {
      if (e.target === state.overlay) {
        closeAllMenus();
      }
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
  window.addEventListener("popstate", () => {
    if (state.settingsMenu && state.settingsMenu.classList.contains("open")) {
      closeAllMenus();
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
