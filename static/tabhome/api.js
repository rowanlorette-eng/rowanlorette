export async function fetchVideos(offset, limit) {
  const res = await fetch(`/api/videos?offset=${offset}&limit=${limit}`);

  let data = await res.json();

  return Array.isArray(data) ? data : [];
}
