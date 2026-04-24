import { fetchVideos } from "../api/videoApi.js";
import { state } from "../core/state.js";

export async function loadVideos(initial = false) {
  if (state.list.loading || state.list.ended) return;

  state.list.loading = true;

  const limit = initial ? 24 : 6;

  const videos = await fetchVideos(state.list.offset, limit);

  if (!videos.length) {
    state.list.ended = true;
    state.list.loading = false;
    return;
  }

  state.list.offset += limit;

  state.list.loading = false;

  return videos;
}
