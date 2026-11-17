// Positions the phone could not send (no network, a dropped connection) wait here and go out in one
// batch to POST /v1/me/progress when the connection is back. The server keeps a position only if it
// is newer than what it has (by the session's start, then the sequence), so an old batch can never
// move a viewer backwards, and sending the same item twice changes nothing.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ApiError, unwrap } from "./api";

export interface QueuedPosition {
  sessionId: string;
  sequence: number;
  /** Seconds. */
  position: number;
}

const KEY = "onenexium_progress_queue";
const BATCH = 50; // the API's limit per request
const MAX_SESSIONS = 200; // a phone offline for days still stays small

let flushing: Promise<void> | null = null;

async function read(): Promise<QueuedPosition[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // unreadable: nothing worth keeping
  }
}

async function write(items: QueuedPosition[]) {
  if (items.length === 0) await AsyncStorage.removeItem(KEY);
  else await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

/** Keeps the latest position of a session (older ones of the same session add nothing). */
export async function enqueuePosition(item: QueuedPosition): Promise<void> {
  const items = (await read()).filter((q) => q.sessionId !== item.sessionId);
  items.push({
    sessionId: item.sessionId,
    sequence: item.sequence,
    position: Math.min(36000, Math.max(0, item.position)),
  });
  await write(items.slice(-MAX_SESSIONS));
}

export async function queuedPositions(): Promise<QueuedPosition[]> {
  return read();
}

/**
 * Sends what is waiting, oldest first. Resolves when done or when the connection fails (the rest
 * stays queued). A batch the server refuses as invalid is dropped: sending it again cannot help.
 */
export function flushProgress(): Promise<void> {
  flushing ??= (async () => {
    for (;;) {
      const items = await read();
      if (items.length === 0) return;
      const batch = items.slice(0, BATCH);
      try {
        unwrap(await api.POST("/v1/me/progress", { body: { items: batch } }));
      } catch (error) {
        const refused =
          error instanceof ApiError && error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status);
        if (!refused) return; // offline, busy, signed out: try again later
      }
      // Remove exactly what was sent; anything queued meanwhile stays.
      const sent = new Set(batch.map((b) => `${b.sessionId}:${b.sequence}`));
      await write((await read()).filter((q) => !sent.has(`${q.sessionId}:${q.sequence}`)));
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
