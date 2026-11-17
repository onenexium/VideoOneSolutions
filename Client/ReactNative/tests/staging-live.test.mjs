// Opt-in: runs the app's real services against a real ott-api, e.g. staging.
//
//   OTT_API_URL=https://ott-api-staging.onenexium.com node --test tests/staging-live.test.mjs
//
// Skipped when OTT_API_URL is not set, so `node --test tests/` stays offline and deterministic.
// It creates one guest session and one playback session on that server (and ends the latter).
import assert from "node:assert/strict";
import test from "node:test";
import { boot } from "./support/boot.mjs";
import { validate } from "./support/fake-api.mjs";

const baseUrl = process.env.OTT_API_URL;
const skip = baseUrl ? false : "set OTT_API_URL to run against a real server";

// Known differences between the published OpenAPI document and the live server. Anything
// else that does not match the contract fails the test.
//  - badge: staging sends null for series without a badge, the schema only lists the enum.
const KNOWN_DRIFT = [/\/badge must be/, /\/badge must match/];
const unexpectedDrift = (errors) =>
  errors ? errors.split(", ").filter((e) => !KNOWN_DRIFT.some((known) => known.test(e))) : [];

const ctx = skip ? null : await boot({ baseUrl });

// An older staging build may not have the playback routes yet. A route that exists answers 401
// without a token; one that does not exist answers 404 "Cannot POST ...". Say so explicitly
// instead of failing on a deployment gap or, worse, passing for the wrong reason.
async function playbackDeployed() {
  const response = await fetch(`${baseUrl}/v1/playback/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  return response.status !== 404;
}
const NO_PLAYBACK = "this server has no /v1/playback routes deployed yet";

const headers = { "x-platform": "android" };
const raw = async (path) => {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  return { status: response.status, body: await response.json() };
};

test("the server is up and its public responses match the published contract", { skip }, async () => {
  const ready = await fetch(`${baseUrl}/health/ready`);
  assert.equal(ready.status, 200);

  const config = await raw("/v1/app-config");
  assert.equal(config.status, 200);
  const driftConfig = validate("AppConfigResponse", config.body);
  assert.deepEqual(unexpectedDrift(driftConfig), [], `unexpected contract drift: ${driftConfig}`);
  assert.equal(config.body.guestMode, true, "the app needs guest mode to start a session");

  const home = await raw("/v1/home");
  assert.equal(home.status, 200);
  const driftHome = validate("HomeResponse", home.body);
  assert.deepEqual(unexpectedDrift(driftHome), [], `unexpected contract drift: ${driftHome}`);
});

test("home, feed and episodes load through the typed client and adapters", { skip }, async () => {
  const { DramaService } = ctx.catalog;

  const channel = await DramaService.getDramaChannel();
  const sections = [channel.loop, channel.trending, channel.new, channel.recommend];
  assert.ok(sections.some((s) => s.length > 0), "staging returned no rails at all");
  const first = sections.flat()[0];
  assert.ok(first.dramaId && first.dramaTitle, "cards carry an id and a title");
  assert.match(first.dramaCoverUrl, /^https?:\/\//);

  const feed = await DramaService.getDramaFeed(5);
  assert.ok(feed.length > 0, "the feed (which needs a session) returned items");
  assert.ok(feed[0].video_meta.playback, "feed items carry a playback reference");
  assert.equal(ctx.session.getViewer()?.kind, "guest", "a guest session was started");

  const episodes = await DramaService.getDramaList({ drama_id: first.dramaId });
  assert.ok(episodes.length > 0);
  assert.deepEqual(episodes.map((e) => e.order), [...episodes.map((e) => e.order)].sort((a, b) => a - b));
  assert.equal(episodes[0].playback.series, first.dramaId);
  globalThis.__liveEpisode = episodes.find((e) => !e.vip) ?? null;
});

test("a free episode plays: session, start, heartbeat, end", { skip }, async (t) => {
  if (!(await playbackDeployed())) {
    return t.skip(NO_PLAYBACK);
  }
  const episode = globalThis.__liveEpisode;
  assert.ok(episode, "no free episode found to play on staging");
  const { PlaybackService } = ctx.playback;

  const session = await PlaybackService.open(episode.playback);
  assert.match(session.playlistUrl, /^https?:\/\//);
  assert.ok(session.heartbeatSeconds > 0);

  try {
    const playlist = await fetch(session.playlistUrl);
    assert.equal(playlist.status, 200, "the signed playlist is fetchable");
    assert.match(await playlist.text(), /^#EXTM3U/, "the playlist is HLS");

    assert.equal(await PlaybackService.heartbeat(session.id, 1, 1, "playing"), true);
  } finally {
    await PlaybackService.end(session.id, 2, 2);
  }
});

test("an episode that does not exist is the API's episode-not-found, not a crash", { skip }, async (t) => {
  if (!(await playbackDeployed())) {
    return t.skip(NO_PLAYBACK);
  }
  await assert.rejects(
    () => ctx.playback.PlaybackService.open({ series: "doesnotexist", number: 1, language: "hi" }),
    (error) =>
      error.name === "ApiError" &&
      error.status === 404 &&
      error.type === "urn:ott:error:episode-not-found",
  );
});
