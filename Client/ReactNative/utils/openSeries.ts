import { router } from "expo-router";
import { USE_MOCK_API } from "@/services/api";
import type { DramaChannelMeta } from "@/types/drama";

/** A tapped card opens the series page; the mock catalogue has none, so it plays straight away. */
export function openSeries(drama: DramaChannelMeta) {
  if (USE_MOCK_API) {
    router.push({
      pathname: "/drama_player",
      params: {
        dramaId: drama.dramaId,
        dramaTitle: drama.dramaTitle,
        dramaCoverUrl: drama.dramaCoverUrl,
        dramaVideoOrientation: drama.dramaVideoOrientation.toString(),
      },
    } as any);
    return;
  }
  router.push({ pathname: "/series", params: { shortId: drama.dramaId } } as any);
}
