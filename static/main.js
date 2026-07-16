import { renderDescription } from "./modules/description.js";

document.addEventListener("DOMContentLoaded", function () {
  console.log("Приложение загружено");

  const descContainer = document.getElementById("description");

  if (descContainer) {
    const markdownText =
      descContainer.dataset.markdown || "**Привет!** Это описание.";
    renderDescription(markdownText, descContainer);
  }
});

window.renderDescription = renderDescription;
