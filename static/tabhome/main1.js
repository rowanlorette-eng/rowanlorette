import { fetchVideos } from "./api.js";
import { createVideoCard } from "./card.js";

const container = document.getElementById("video-container");
const loader = document.getElementById("loader");

let listOffset = 0;
const LIST_LIMIT = 24;
const LOAD_MORE = 6;

let listLoading = false;
let listEnded = false;

// --- shuffle (оставили тут, это бизнес-логика)
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// --- загрузка ---
async function loadVideos(initial = false) {
  if (listLoading || listEnded) return;
  listLoading = true;

  const limit = initial ? LIST_LIMIT : LOAD_MORE;

  try {
    let data = await fetchVideos(listOffset, limit);

    shuffle(data);

    const readyVideos = data.filter((v) => v.status === "ready");

    if (readyVideos.length === 0) {
      listEnded = true;
      if (loader) loader.style.display = "none";
      return;
    }

    readyVideos.forEach((v) => container.appendChild(createVideoCard(v)));

    listOffset += limit;

    if (loader) loader.style.display = "block";
    console.log("Показываем видео:", readyVideos.length);
  } catch (e) {
    console.error("Ошибка загрузки видео:", e);
    if (loader) loader.textContent = "Ошибка загрузки видео";
  } finally {
    listLoading = false;
  }
}

// --- infinite scroll ---
window.addEventListener("scroll", () => {
  if (listLoading || listEnded) return;

  const scrollBottom =
    window.innerHeight + window.scrollY >= document.body.offsetHeight - 300;

  if (scrollBottom) loadVideos();
});

// --- init ---
loadVideos(true);
