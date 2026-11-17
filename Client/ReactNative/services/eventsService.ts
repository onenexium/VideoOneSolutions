// The one kind of event the API takes from the app today: a feed preview watched long enough to
// count (it feeds the ranking). Sent only with the viewer's consent to personalisation, once per
// series per run, in batches, and a failure to send is never shown to the viewer.

import { api, unwrap } from "./api";
import { getConsentChoices } from "./firstRun";
import type { components } from "@/types/api";

type Event = components["schemas"]["DiscoveryEventDto"];

const MIN_SECONDS = 10; // the API counts a preview from 10 s
const BATCH = 50;

let queue: Event[] = [];
const counted = new Set<string>();
let flushing: Promise<void> | null = null;

/** A preview was watched for `seconds`. Ignored without consent or under 10 s, and only once per series. */
export function trackPreviewWatched(input: { series: string; language: string; seconds: number }) {
  if (!getConsentChoices().recommendations) return;
  if (input.seconds < MIN_SECONDS || counted.has(input.series)) return;
  counted.add(input.series);
  queue.push({ kind: "preview_watched", series: input.series, language: input.language, seconds: Math.floor(input.seconds) });
}

export const pendingEvents = () => queue.length;

/** Sends what is waiting. A batch that cannot be sent (offline, busy) stays for the next try. */
export function flushEvents(): Promise<void> {
  flushing ??= (async () => {
    while (queue.length > 0) {
      const batch = queue.slice(0, BATCH);
      try {
        unwrap(await api.POST("/v1/events", { body: { events: batch } }));
      } catch {
        return; // kept: tried again later
      }
      queue = queue.slice(batch.length); // accepted or turned away one by one: neither is resent
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** For tests: forget everything held. */
export function resetEvents() {
  queue = [];
  counted.clear();
}
