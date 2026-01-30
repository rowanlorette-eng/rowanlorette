const container = document.getElementById("video-container");
const loader = document.getElementById("loader");

let allVideos = [];
let visibleCount = 0;

const INITIAL_LOAD = 25;
const LOAD_MORE = 20;
let loading = false;

// перемешивание массива (Fisher–Yates)
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

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

  thumb.appendChild(img);

  const title = document.createElement("div");
  title.className = "video-title";
  title.textContent = video.title || "Без названия";

  card.appendChild(thumb);
  card.appendChild(title);

  return card;
}

function renderMore() {
  if (loading) return;
  loading = true;

  const next = allVideos.slice(
    visibleCount,
    visibleCount + (visibleCount === 0 ? INITIAL_LOAD : LOAD_MORE),
  );

  next.forEach((video) => {
    container.appendChild(createVideoCard(video));
  });

  visibleCount += next.length;

  loader.style.display = visibleCount >= allVideos.length ? "none" : "block";

  loading = false;
}

async function loadVideos() {
  try {
    const res = await fetch("/api/videos");
    const data = await res.json();

    // показываем только готовые видео
    allVideos = data.filter((v) => v.status === "ready");

    shuffle(allVideos);
    renderMore();
  } catch (e) {
    loader.textContent = "Ошибка загрузки видео";
    console.error(e);
  }
}

// infinite scroll
window.addEventListener("scroll", () => {
  const scrollBottom =
    window.innerHeight + window.scrollY >= document.body.offsetHeight - 300;

  if (scrollBottom && visibleCount < allVideos.length) {
    renderMore();
  }
});

loadVideos();
