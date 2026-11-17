// The series page, search and My List.

import { api, unwrap } from "./api";
import { DramaService, fetchMySeries, toChannelMeta, withLikes, withUnlocks, type MySeries } from "./dramaService";
import type { components } from "@/types/api";
import type { DramaCardPage, DramaChannelMeta, DramaEpisode } from "@/types/drama";

type SeriesPageResponse = components["schemas"]["SeriesResponse"];
type MyListItem = components["schemas"]["MyListItemResponse"];
type Tag = components["schemas"]["TagResponse"];

export interface SeriesDetail {
  series: SeriesPageResponse;
  episodes: DramaEpisode[];
  /** The viewer's side: unlocks, the unlock offers, auto-unlock. Null when it could not be read. */
  mine: MySeries | null;
  /** In My List. A guest can follow too. */
  following: boolean;
  /** Episode numbers the viewer has finished. */
  watched: number[];
}

/** The series page: details, every episode with its price, and what this viewer has done with it. */
export async function getSeriesDetail(shortId: string): Promise<SeriesDetail> {
  const series = unwrap(await api.GET("/v1/series/{shortId}", { params: { path: { shortId } } }));
  const cover = series.artwork.poster?.url ?? series.artwork.cover?.url ?? "";
  const [episodes, mine] = await Promise.all([DramaService.fetchEpisodes(series, cover), fetchMySeries(shortId)]);
  return {
    series,
    episodes: withLikes(withUnlocks(episodes, mine?.unlockedEpisodes ?? []), mine?.likedEpisodes ?? []),
    mine,
    following: mine?.following ?? false,
    watched: (mine?.progress ?? []).filter((p) => p.watched).map((p) => p.episode),
  };
}

export async function getSimilar(shortId: string): Promise<DramaChannelMeta[]> {
  const cards = unwrap(await api.GET("/v1/series/{shortId}/similar", { params: { path: { shortId } } }));
  return cards.map(toChannelMeta);
}

/** Likes or unlikes an episode. Idempotent: liking twice is one like. */
export async function setLiked(shortId: string, number: number, liked: boolean): Promise<void> {
  const params = { params: { path: { shortId, number } } };
  unwrap(await (liked ? api.PUT("/v1/me/likes/{shortId}/{number}", params) : api.DELETE("/v1/me/likes/{shortId}/{number}", params)));
}

/** Follows (adds to My List). Idempotent. 409 list-full when the list is at its limit. */
export async function follow(shortId: string): Promise<void> {
  unwrap(await api.PUT("/v1/me/list/{shortId}", { params: { path: { shortId } } }));
}

/** Unfollows. Idempotent, also for a series that is no longer available. */
export async function unfollow(shortId: string): Promise<void> {
  unwrap(await api.DELETE("/v1/me/list/{shortId}", { params: { path: { shortId } } }));
}

export interface MyListEntry {
  shortId: string;
  title: string;
  posterUrl: string;
  /** "removed" is "No longer available"; "not-here" is "Not available where you are". */
  availability: MyListItem["availability"];
  newEpisodes: boolean;
  meta: DramaChannelMeta | null;
}

export interface MyListPage {
  items: MyListEntry[];
  nextCursor: string | null;
  count: number;
  limit: number;
}

export async function getMyList(
  sort: "added" | "updated" = "added",
  cursor?: string,
): Promise<MyListPage> {
  const page = unwrap(await api.GET("/v1/me/list", { params: { query: { sort, cursor, limit: 24 } } }));
  return {
    count: page.count,
    limit: page.limit,
    nextCursor: page.nextCursor,
    items: page.items.map((item) => ({
      shortId: item.shortId,
      title: item.title,
      posterUrl: item.poster?.url ?? item.card?.poster?.url ?? "",
      availability: item.availability,
      newEpisodes: item.newEpisodes,
      meta: item.card ? toChannelMeta(item.card) : null,
    })),
  };
}

/** Series matching what was typed (title in any language or spelling, alias, tag, cast). */
export async function searchSeries(q: string, cursor?: string): Promise<DramaCardPage> {
  const page = unwrap(await api.GET("/v1/search", { params: { query: { q, cursor, limit: 24 } } }));
  return { items: page.items.map(toChannelMeta), nextCursor: page.nextCursor };
}

export interface SearchSuggestions {
  series: DramaChannelMeta[];
  tropes: { slug: string; name: string }[];
}

/** What to show before anything is typed, or when nothing was found. */
export async function getSearchSuggestions(language = "en"): Promise<SearchSuggestions> {
  const result = unwrap(await api.GET("/v1/search/suggestions", {}));
  return {
    series: result.series.map(toChannelMeta),
    tropes: result.tropes.map((tag: Tag) => ({
      slug: tag.slug,
      name: tag.names[language] ?? tag.names.en ?? tag.slug,
    })),
  };
}
