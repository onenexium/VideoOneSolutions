import { api, unwrap, USE_MOCK_API } from "./api";
import { MOCK_DRAMAS, mockEpisodes, mockFeed } from "./mockCatalog";
import type { components } from "@/types/api";
import {
  DramaCardPage,
  DramaChannelData,
  DramaChannelMeta,
  DramaEpisode,
  DramaListRequestParams,
  DramaMeta,
  FeedItem,
} from "@/types/drama";

type SeriesCard = components["schemas"]["SeriesCardResponse"];
type FeedSeries = components["schemas"]["FeedItemResponse"];
type SeriesPage = components["schemas"]["SeriesResponse"];
type ApiEpisode = components["schemas"]["EpisodeResponse"];
export type MySeries = components["schemas"]["MySeriesResponse"];

const MAX_EPISODE_PAGES = 10;

function toDramaMeta(card: SeriesCard | FeedSeries): DramaMeta {
  return {
    drama_id: card.shortId,
    drama_title: card.title,
    drama_play_times: 0,
    drama_cover_url: card.poster?.url ?? card.cover?.url ?? "",
    new_release: card.badge === "new",
    drama_length: card.episodes,
    drama_video_orientation: 0,
  };
}

export function toChannelMeta(card: SeriesCard): DramaChannelMeta {
  return {
    dramaId: card.shortId,
    dramaTitle: card.title,
    dramaPlayTimes: 0,
    dramaCoverUrl: card.poster?.url ?? card.cover?.url ?? "",
    newRelease: card.badge === "new",
    dramaLength: card.episodes,
    dramaVideoOrientation: 0,
  };
}

function toEpisode(
  shortId: string,
  language: string,
  title: string,
  fallbackCover: string,
  ep: ApiEpisode,
): DramaEpisode {
  return {
    vid: `${shortId}:${ep.number}`,
    drama_id: shortId,
    caption: title,
    duration: ep.durationSeconds ?? 0,
    cover_url: ep.thumbnail?.url ?? fallbackCover,
    // The playable URL comes from a playback session, opened when the episode becomes active.
    sources: [],
    playback: { series: shortId, number: ep.number, language },
    play_times: 0,
    subtitle: "",
    create_time: ep.publishedAt ?? "",
    name: `Episode ${ep.number}`,
    uid: 0,
    like: ep.likes ?? 0,
    comment: 0,
    height: 1920,
    width: 1080,
    order: ep.number,
    display_type: 0,
    // Paid episodes stay locked until the paywall / unlock flow exists.
    vip: ep.price ? !ep.price.free : false,
    coins: ep.price?.coins,
  };
}

/** What this viewer has done with a series (unlocks, follow, progress). Null if it cannot be read. */
export async function fetchMySeries(shortId: string): Promise<MySeries | null> {
  try {
    const result = await api.GET("/v1/me/series/{shortId}", { params: { path: { shortId } } });
    return result.data ?? null;
  } catch {
    return null; // the page still works without the viewer's side
  }
}

/** Marks the episodes this viewer liked. */
export function withLikes(episodes: DramaEpisode[], liked: number[]): DramaEpisode[] {
  if (liked.length === 0) return episodes;
  const set = new Set(liked);
  return episodes.map((e) => (set.has(e.order) ? { ...e, liked: true } : e));
}

/**
 * Episodes this viewer has unlocked are no longer locked. With `autoUnlock` (for playing, not for
 * showing locks) the rest may be opened too: the API charges the unlock when playback starts, and
 * says not-entitled if it cannot (then the screen locks the episode again).
 */
export function withUnlocks(episodes: DramaEpisode[], unlocked: number[], autoUnlock = false): DramaEpisode[] {
  if (unlocked.length === 0 && !autoUnlock) return episodes;
  const set = new Set(unlocked);
  return episodes.map((e) => (e.vip && (autoUnlock || set.has(e.order)) ? { ...e, vip: false } : e));
}

// Catalogue access. Uses the mock catalogue until EXPO_PUBLIC_API_BASE_URL is set.
export class DramaService {
  /**
   * Home rails. The API places the rails per viewer; the screen has four fixed sections, so
   * the hero rail becomes the carousel and the next rails fill trending / new / recommended.
   */
  static async getDramaChannel(): Promise<DramaChannelData> {
    if (USE_MOCK_API) {
      const all = MOCK_DRAMAS.map((d) => ({
        dramaId: d.drama_id,
        dramaTitle: d.drama_title,
        dramaPlayTimes: d.drama_play_times,
        dramaCoverUrl: d.drama_cover_url,
        newRelease: d.new_release,
        dramaLength: d.drama_length,
        dramaVideoOrientation: d.drama_video_orientation,
      }));
      return {
        loop: all.slice(0, 4),
        trending: all,
        new: all.filter((d) => d.newRelease),
        recommend: [...all].reverse(),
      };
    }

    const { rails } = unwrap(await api.GET("/v1/home", {}));
    const hero = rails.find((rail) => rail.style === "hero");
    const rest = rails.filter((rail) => rail !== hero);
    const cards = (rail?: { items: SeriesCard[] }) =>
      (rail?.items ?? []).map(toChannelMeta);

    return {
      loop: cards(hero).slice(0, 8),
      trending: cards(rest[0]),
      new: cards(rest[1]),
      recommend: rest.slice(2).flatMap((rail) => cards(rail)),
      railKeys: { trending: rest[0]?.key, new: rest[1]?.key },
    };
  }

  /** "See all" of one home rail, by cursor. A cursor the server refuses means: start again. */
  static async getRailPage(
    key: string,
    cursor?: string,
    pageSize: number = 24,
  ): Promise<DramaCardPage> {
    const page = unwrap(
      await api.GET("/v1/rails/{key}", {
        params: { path: { key }, query: { cursor, limit: pageSize } },
      }),
    );
    return { items: page.items.map(toChannelMeta), nextCursor: page.nextCursor };
  }

  /** Every series the viewer may see, newest first, by cursor (Browse). */
  static async getBrowsePage(
    cursor?: string,
    pageSize: number = 24,
  ): Promise<DramaCardPage> {
    if (USE_MOCK_API) {
      return { items: (await DramaService.getDramaChannel()).trending, nextCursor: null };
    }
    const page = unwrap(
      await api.GET("/v1/browse", { params: { query: { cursor, limit: pageSize } } }),
    );
    return { items: page.items.map(toChannelMeta), nextCursor: page.nextCursor };
  }

  /** Vertical "For You" feed, first page: one series per swipe, starting at its first episode. */
  static async getDramaFeed(pageSize: number = 20): Promise<FeedItem[]> {
    return (await DramaService.getDramaFeedPage(pageSize)).items;
  }

  /**
   * One page of the feed. `nextCursor` is null at the end ("You're all caught up"); pass it back
   * for the next page. A cursor the server no longer accepts (`cursor-invalid`) means the ranking
   * changed: the caller starts again from the first page.
   */
  static async getDramaFeedPage(
    pageSize: number = 20,
    cursor?: string,
  ): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
    if (USE_MOCK_API) {
      return { items: mockFeed(), nextCursor: null };
    }

    const page = unwrap(
      await api.GET("/v1/feed", {
        params: { query: { limit: pageSize, cursor } },
      }),
    );
    const items = page.items.map((series) => {
      const meta = toDramaMeta(series);
      const episode = toEpisode(
        series.shortId,
        series.language,
        series.title,
        meta.drama_cover_url,
        {
          number: 1,
          durationSeconds: null,
          publishedAt: null,
          price: null,
          thumbnail: null,
          languages: [series.language],
          likes: null,
        },
      );
      return { drama_meta: meta, video_meta: episode };
    });
    return { items, nextCursor: page.nextCursor };
  }

  /** All episodes of one series, in the series' own language version. */
  static async getDramaList(
    params: DramaListRequestParams,
  ): Promise<DramaEpisode[]> {
    if (USE_MOCK_API) {
      return mockEpisodes(params.drama_id);
    }

    const shortId = params.drama_id;
    const series: SeriesPage = unwrap(
      await api.GET("/v1/series/{shortId}", {
        params: { path: { shortId } },
      }),
    );
    const cover = series.artwork.poster?.url ?? series.artwork.cover?.url ?? "";

    const [episodes, mine] = await Promise.all([
      DramaService.fetchEpisodes(series, cover),
      fetchMySeries(shortId),
    ]);
    return withLikes(
      withUnlocks(episodes, mine?.unlockedEpisodes ?? [], mine?.autoUnlock ?? false),
      mine?.likedEpisodes ?? [],
    );
  }

  /** Every episode of a series in its own language version (up to MAX_EPISODE_PAGES pages). */
  static async fetchEpisodes(
    series: Pick<SeriesPage, "shortId" | "language" | "title">,
    cover: string,
  ): Promise<DramaEpisode[]> {
    const shortId = series.shortId;
    const episodes: DramaEpisode[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_EPISODE_PAGES; page++) {
      const result = unwrap(
        await api.GET("/v1/series/{shortId}/episodes", {
          params: {
            path: { shortId },
            query: { language: series.language, limit: 100, cursor },
          },
        }),
      );
      episodes.push(
        ...result.items.map((ep) =>
          toEpisode(shortId, series.language, series.title, cover, ep),
        ),
      );
      if (!result.nextCursor) {
        break;
      }
      cursor = result.nextCursor;
    }
    return episodes;
  }
}

export default DramaService;
