export function createVideoCard(video) {
  const card = document.createElement("div");
  card.className = "video-card";

  card.onclick = (e) => {
    e.preventDefault();
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
