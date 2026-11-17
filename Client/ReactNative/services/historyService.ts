// History, Continue watching and pausing history (backend BE-66; deep dive 5, F2, F3).

import { api, unwrap } from "./api";
import { toChannelMeta } from "./dramaService";
import type { components } from "@/types/api";
import type { DramaChannelMeta } from "@/types/drama";

type HistoryItem = components["schemas"]["HistoryItemResponse"];

export interface HistoryEntry {
  shortId: string;
  title: string;
  posterUrl: string;
  /** "removed" is "No longer available"; "not-here" is "Not available where you are". */
  availability: HistoryItem["availability"];
  meta: DramaChannelMeta | null;
  /** The episode the viewer is on, and how far into it. */
  episode: number;
  position: number | null;
  duration: number | null;
  watched: boolean;
  lastWatchedAt: string;
}

export interface ContinueEntry {
  meta: DramaChannelMeta;
  /** The episode to play: the one in progress, or the next one out. */
  episode: number;
  /** Seconds into it (0 for the next episode). */
  position: number;
  duration: number | null;
  /** The viewer had caught up and this one came out since. */
  newEpisode: boolean;
}

/** History, last watched first, by cursor. */
export async function getHistory(cursor?: string): Promise<{ items: HistoryEntry[]; nextCursor: string | null }> {
  const page = unwrap(await api.GET("/v1/me/history", { params: { query: { cursor, limit: 24 } } }));
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((i) => ({
      shortId: i.shortId,
      title: i.title,
      posterUrl: i.poster?.url ?? i.card?.poster?.url ?? "",
      availability: i.availability,
      meta: i.card ? toChannelMeta(i.card) : null,
      episode: i.episode,
      position: i.position,
      duration: i.duration,
      watched: i.watched,
      lastWatchedAt: i.lastWatchedAt,
    })),
  };
}

/** Removes one series from History (its progress goes; follows, likes and unlocks stay). */
export async function removeFromHistory(shortId: string): Promise<void> {
  unwrap(await api.DELETE("/v1/me/history/{shortId}", { params: { path: { shortId } } }));
}

/** Clears all History. */
export async function clearHistory(): Promise<void> {
  unwrap(await api.DELETE("/v1/me/history", {}));
}

/** The series being watched, each with the episode to play next. */
export async function getContinueWatching(): Promise<ContinueEntry[]> {
  const result = unwrap(await api.GET("/v1/me/continue-watching", {}));
  return result.items.map((i) => ({
    meta: toChannelMeta(i.card),
    episode: i.episode,
    position: i.position,
    duration: i.duration,
    newEpisode: i.newEpisode,
  }));
}

/** Takes a series off Continue watching until it is played again. */
export async function hideFromContinue(shortId: string): Promise<void> {
  unwrap(await api.DELETE("/v1/me/continue-watching/{shortId}", { params: { path: { shortId } } }));
}

export async function getHistoryPaused(): Promise<boolean> {
  return unwrap(await api.GET("/v1/me/preferences", {})).historyPaused;
}

/** Pauses or resumes History; resolves with the value the server now holds. */
export async function setHistoryPaused(historyPaused: boolean): Promise<boolean> {
  return unwrap(await api.PATCH("/v1/me/preferences", { body: { historyPaused } })).historyPaused;
}
