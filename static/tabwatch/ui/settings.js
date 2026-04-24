import { dom } from "./dom.js";

/**
 * Settings menu toggle
 */
export function initSettings() {
  dom.settingsBtn.onclick = (e) => {
    e.stopPropagation();
    toggleMenu(dom.settingsMenu);
  };

  dom.qualityBtn.onclick = (e) => {
    e.stopPropagation();
    dom.qualityMenu.style.display = "flex";
  };

  document.addEventListener("click", () => {
    closeMenus();
  });

  dom.settingsMenu.addEventListener("click", (e) => e.stopPropagation());
}

/**
 * Quality selection binding helper
 */
export function bindQuality(onSelect) {
  dom.qualityMenu.onclick = (e) => {
    const item = e.target.closest(".settings-quality");
    if (!item) return;

    onSelect(item.dataset.quality);
  };
}

/**
 * Autoplay toggle UI
 */
export function setAutoplayUI(enabled) {
  dom.autoplayIcon.src = enabled
    ? "/icons/toggleon.png"
    : "/icons/toggleoff.png";
}

/**
 * Repeat toggle UI
 */
export function setRepeatUI(enabled) {
  dom.repeatIcon.src = enabled ? "/icons/repeaton.png" : "/icons/repeatoff.png";
}

/* ---------------- helpers ---------------- */

function toggleMenu(menu) {
  menu.style.display = menu.style.display === "flex" ? "none" : "flex";
}

function closeMenus() {
  dom.settingsMenu.style.display = "none";
  dom.qualityMenu.style.display = "none";
}
