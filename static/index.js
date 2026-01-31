const container = document.getElementById("video-container");
const loader = document.getElementById("loader");

let listOffset = 0;
const LIST_LIMIT = 24; // количество видео при первой загрузке
const LOAD_MORE = 6; // при скролле
let listLoading = false;
let listEnded = false;

// --- Функция перемешивания массива (Fisher–Yates) ---
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// --- Создание карточки видео ---
function createVideoCard(video) {
  const card = document.createElement("div");
  card.className = "video-card";

  card.onclick = () => {
    sessionStorage.setItem("autoplay", "1");
    window.location.href = `/watch?v=${video.id}`;
  };

  const thumb = document.createElement("div");
  thumb.className = "thumbnail";

  const img = document.createElement("img");
  img.src = video.thumbnail || "";
  img.alt = video.title;
  img.loading = "lazy";

  thumb.appendChild(img);

  const title = document.createElement("div");
  title.className = "video-title";
  title.textContent = video.title || "Без названия";

  card.appendChild(thumb);
  card.appendChild(title);

  return card;
}

// --- Загрузка видео с сервера ---
async function loadVideos(initial = false) {
  if (listLoading || listEnded) return;
  listLoading = true;

  const limit = initial ? LIST_LIMIT : LOAD_MORE;

  try {
    const res = await fetch(`/api/videos?offset=${listOffset}&limit=${limit}`);
    let data = await res.json();
    data = Array.isArray(data) ? data : [];

    shuffle(data); // перемешиваем порядок видео

    // фильтруем только готовые видео
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

// --- Infinite scroll ---
window.addEventListener("scroll", () => {
  if (listLoading || listEnded) return;
  const scrollBottom =
    window.innerHeight + window.scrollY >= document.body.offsetHeight - 300;
  if (scrollBottom) loadVideos();
});

// --- Первая загрузка ---
loadVideos(true);
