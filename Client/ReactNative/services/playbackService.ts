// Playback sessions (POST /v1/playback/sessions): the API checks that this viewer may watch
// the episode, then hands back a signed HLS playlist. The player reports its position with
// heartbeats so the API can free the stream slot and stop playback started elsewhere.

import { api, ApiError, unwrap } from "./api";
import { autoUnlocked, locked, opened } from "./playbackEvents";
import { getDataSaver, loadPlaybackSettings } from "./playbackSettings";
import { getPinToken } from "./pinService";
import { getViewer, subscribeViewer } from "./session";
import { enqueuePosition, flushProgress } from "./progressQueue";
import type { components } from "@/types/api";
import type { PlaybackRef } from "@/types/drama";

type SessionResponse = components["schemas"]["PlaybackSessionResponse"];

export type HeartbeatState = "playing" | "paused" | "buffering";

export interface PlaybackSession {
  id: string;
  /** Signed HLS playlist for the player. */
  playlistUrl: string;
  /** Seconds to resume from. */
  resume: number;
  heartbeatSeconds: number;
  drm: SessionResponse["drm"];
  /** Present only for paid episodes; null for free ones. */
  licenceToken: string | null;
  next: SessionResponse["next"];
  /** The effective rating, for the rating card. */
  rating: SessionResponse["rating"];
  /** Set when starting this episode charged an auto-unlock: show "Episode N unlocked. Undo". */
  autoUnlocked: components["schemas"]["PlaybackStartResponse"]["autoUnlocked"];
}

type CreatedSession = components["schemas"]["PlaybackSessionResponse"];

// A session is created when the app PREPARES to play (the API grants no stream slot and charges
// nothing then) and started when the first frame is needed. So the next episode's session can be
// created ahead of the swipe, and the swipe then only has to start it. Used once, only while its
// playlist is still good for a while, and never across a change of who is signed in.
const PREFETCH_MARGIN_MS = 120_000;
const PREFETCH_KEEP = 2;
const prefetched = new Map<string, Promise<CreatedSession>>();
const prefetchKey = (ref: PlaybackRef) => `${ref.series}:${ref.number}:${ref.language}`;
// A refreshed token is still the same person; a logout or a different account is not.
let owner: string | null | undefined;
subscribeViewer(() => {
  const id = getViewer()?.id ?? null;
  if (owner !== undefined && id !== owner) prefetched.clear();
  owner = id;
});

async function createSession(ref: PlaybackRef): Promise<CreatedSession> {
  await loadPlaybackSettings(); // the saved data-saver choice is known before the first session
  return api
    .POST("/v1/playback/sessions", {
      body: {
        series: ref.series,
        episode: ref.number,
        language: ref.language,
        capabilities: { dataSaver: getDataSaver() },
        pinToken: getPinToken(),
      },
    })
    .then(unwrap);
}

/** A prefetched session still worth using, or null (none, failed, or about to expire). */
async function takePrefetched(ref: PlaybackRef): Promise<CreatedSession | null> {
  const key = prefetchKey(ref);
  const entry = prefetched.get(key);
  prefetched.delete(key);
  if (!entry) return null;
  try {
    const created = await entry;
    return Date.parse(created.expiresAt) - Date.now() > PREFETCH_MARGIN_MS ? created : null;
  } catch {
    return null;
  }
}

export const PlaybackService = {
  /**
   * Prepares an episode the viewer is likely to watch next, so starting it later is one request
   * instead of two. Best effort: a refusal (locked, PIN, offline) is ignored here and shows up,
   * as it should, only if the viewer really opens the episode.
   */
  prefetch(ref: PlaybackRef): void {
    const key = prefetchKey(ref);
    if (prefetched.has(key)) return;
    const entry = createSession(ref);
    prefetched.set(key, entry);
    entry.catch(() => {
      if (prefetched.get(key) === entry) prefetched.delete(key);
    });
    while (prefetched.size > PREFETCH_KEEP) {
      prefetched.delete(prefetched.keys().next().value as string);
    }
  },

  /**
   * Open and start a session. Throws ApiError (402 not-entitled, 403 pin-required, ...). Tells the
   * screen when starting charged an auto-unlock, and when the episode turned out to be locked.
   */
  async open(ref: PlaybackRef): Promise<PlaybackSession> {
    try {
      const session = await PlaybackService.createAndStart(ref);
      opened.emit({ series: ref.series, episode: ref.number, rating: session.rating });
      if (session.autoUnlocked) autoUnlocked.emit({ series: ref.series, ...session.autoUnlocked });
      return session;
    } catch (error) {
      if (error instanceof ApiError && error.type.endsWith("not-entitled")) {
        locked.emit({ series: ref.series, episode: ref.number });
      }
      throw error;
    }
  },

  async createAndStart(ref: PlaybackRef): Promise<PlaybackSession> {
    const ahead = await takePrefetched(ref);
    let created = ahead ?? (await createSession(ref));
    let started;
    try {
      started = unwrap(
        await api.POST("/v1/playback/sessions/{id}/start", {
          params: { path: { id: created.sessionId } },
          body: {},
        }),
      );
    } catch (error) {
      // A session prepared earlier may have lapsed on the server: make a fresh one, once.
      const gone = error instanceof ApiError && /playback-session-(not-found|ended)$/.test(error.type);
      if (!ahead || !gone) throw error;
      created = await createSession(ref);
      started = unwrap(
        await api.POST("/v1/playback/sessions/{id}/start", {
          params: { path: { id: created.sessionId } },
          body: {},
        }),
      );
    }
    void flushProgress(); // the connection works: send what waited
    return {
      id: created.sessionId,
      playlistUrl: created.playlistUrl,
      resume: created.resume,
      heartbeatSeconds: created.heartbeatSeconds,
      drm: created.drm,
      licenceToken: started.licenceToken,
      next: created.next,
      rating: created.rating,
      autoUnlocked: started.autoUnlocked,
    };
  },

  /** Returns false when the API revoked the session (stopped on another device, expired). */
  async heartbeat(
    id: string,
    position: number,
    sequence: number,
    state: HeartbeatState,
  ): Promise<boolean> {
    let response;
    try {
      response = unwrap(
        await api.POST("/v1/playback/sessions/{id}/heartbeat", {
          params: { path: { id } },
          body: { position, sequence, state },
        }),
      );
    } catch (error) {
      await keepIfOffline(error, id, sequence, position);
      throw error;
    }
    void flushProgress(); // the connection works: send what waited
    return response.status === "ok";
  },

  /** Free the stream slot. Ending twice is harmless. */
  async end(id: string, position: number, sequence: number): Promise<void> {
    try {
      unwrap(
        await api.POST("/v1/playback/sessions/{id}/end", {
          params: { path: { id } },
          body: { position, sequence },
        }),
      );
    } catch (error) {
      await keepIfOffline(error, id, sequence, position);
      throw error;
    }
  },
};

/** A position that never reached the server (no response at all) is kept to send later. */
async function keepIfOffline(error: unknown, sessionId: string, sequence: number, position: number) {
  if (error instanceof ApiError) return; // the server answered: it is not a connection problem
  await enqueuePosition({ sessionId, sequence, position }).catch(() => {});
}
