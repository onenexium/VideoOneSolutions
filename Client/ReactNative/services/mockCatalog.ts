// Mock catalogue used until ott-api ships the catalogue endpoints (Sprint 2).
// Shape matches the app's own types so switching to the real API is a one-line change
// in services/dramaService.ts. Replace with data generated from the OpenAPI document.

import Constants from "expo-constants";
import {
  DramaEpisode,
  DramaMeta,
  FeedItem,
  PlaybackSource,
} from "@/types/drama";

// Public HLS test stream, used when no local test videos are available.
const TEST_HLS = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

// Vertical test episodes in ./dev-media (ep1.mp4 .. ep4.mp4), served by the Metro dev server.
const DEV_MEDIA_EPISODES = 4;

/**
 * Where the dev server serves ./dev-media from, derived from the address the app loaded its
 * code from (a tunnel such as "abc-8081.exp.direct", or "192.168.1.5:8081" on a LAN).
 * Null when the app was not loaded from a dev server (a release build, or the unit tests).
 */
export function devMediaBase(hostUri: string | null | undefined): string | null {
  if (!hostUri) {
    return null;
  }
  const host = hostUri.split("/")[0];
  const scheme = host.endsWith(".exp.direct") ? "https" : "http";
  return `${scheme}://${host}/dev-media`;
}

function sourcesFor(episodeIndex: number): PlaybackSource[] {
  const base = devMediaBase(Constants.expoConfig?.hostUri);
  if (!base) {
    return [{ quality: "Auto", url: TEST_HLS }];
  }
  const clip = (episodeIndex % DEV_MEDIA_EPISODES) + 1;
  return [{ quality: "Auto", url: `${base}/ep${clip}.mp4` }];
}

const TITLES = [
  "Midnight Letters",
  "The Last Train to Jaipur",
  "Monsoon Promise",
  "Secrets of the Haveli",
  "Chai and Chaos",
  "Second Chance Wedding",
];

const cover = (seed: string) => `https://picsum.photos/seed/${seed}/540/960`;

export const MOCK_DRAMAS: DramaMeta[] = TITLES.map((title, i) => ({
  drama_id: `d${i + 1}`,
  drama_title: title,
  drama_play_times: 120000 - i * 17000,
  drama_cover_url: cover(`drama${i + 1}`),
  new_release: i % 3 === 0,
  drama_length: DEV_MEDIA_EPISODES,
  drama_video_orientation: 0,
}));

export function mockEpisodes(dramaId: string): DramaEpisode[] {
  const drama = MOCK_DRAMAS.find((d) => d.drama_id === dramaId);
  const count = drama?.drama_length ?? DEV_MEDIA_EPISODES;
  return Array.from({ length: count }, (_, i) => ({
    vid: `${dramaId}_e${i + 1}`,
    drama_id: dramaId,
    caption: `${drama?.drama_title ?? "Episode"} - Episode ${i + 1}`,
    duration: 0, // read from the video once it loads
    cover_url: cover(`${dramaId}e${i + 1}`),
    sources: sourcesFor(i),
    play_times: 5000 + i * 311,
    subtitle: "",
    create_time: "2026-11-01T00:00:00Z",
    name: `Episode ${i + 1}`,
    uid: 1,
    like: 100 + i * 7,
    comment: 0,
    height: 1920,
    width: 1080,
    order: i + 1,
    display_type: 0,
    // true = locked behind the paywall. Nothing unlocks episodes yet (the paywall
    // screen arrives with the coins/VIP work), so keep everything playable for now.
    vip: false,
  }));
}

export function mockFeed(): FeedItem[] {
  return MOCK_DRAMAS.map((drama) => ({
    drama_meta: drama,
    video_meta: mockEpisodes(drama.drama_id)[0],
  }));
}
