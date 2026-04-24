import { dom } from "./dom.js";

let expanded = false;

/**
 * Рендер описания
 */
export function renderDescription(markdown) {
  const html = window.marked.parse(markdown);
  dom.descContent.innerHTML = html;

  dom.descContent.querySelectorAll("a").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.color = "#4da3ff";
  });

  dom.videoDescription.style.display = "block";
}

/**
 * Toggle описание
 */
export function toggleDescription() {
  expanded = !expanded;

  if (expanded) {
    dom.videoDescription.classList.add("expanded");
    dom.descToggle.textContent = "свернуть";
    dom.videoDescription.style.zIndex = "10";
  } else {
    dom.videoDescription.classList.remove("expanded");
    dom.descToggle.textContent = "…ещё";
    dom.videoDescription.style.zIndex = "1";
  }
}

/**
 * Reset состояния
 */
export function resetDescription() {
  expanded = false;
  dom.videoDescription.classList.remove("expanded");
  dom.descToggle.textContent = "…ещё";
}
