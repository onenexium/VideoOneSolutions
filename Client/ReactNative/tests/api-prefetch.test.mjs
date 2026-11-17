import assert from "node:assert/strict";
import test, { after } from "node:test";
import { boot } from "./support/boot.mjs";
import { problem } from "./support/fake-api.mjs";

const ctx = await boot();
after(() => ctx.fake.close());
const { fake } = ctx;
const { PlaybackService } = ctx.playback;
const events = await import("../services/playbackEvents.ts");
const auth = await import("../services/authService.ts");
const next = { series: "abc1", number: 2, language: "hi" };
const creates = () => fake.calls("POST", "/v1/playback/sessions").length;
const starts = () => fake.calls("POST", "/v1/playback/sessions/sess-1/start").length;
const settle = () => new Promise((r) => setTimeout(r, 150)); // lets background requests land
const until = async (check) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(check(), "the background request did not arrive");
};

test("a session prepared ahead is only started when the viewer gets there", async () => {
  PlaybackService.prefetch(next);
  await until(() => creates() === 1);
  assert.equal(starts(), 0, "nothing is started, so no stream slot is held and nothing is charged");

  const session = await PlaybackService.open(next);
  assert.equal(creates(), 1, "no second create: the swipe costs one request");
  assert.equal(starts(), 1);
  assert.equal(session.playlistUrl, "https://cdn.test/sess-1/playlist.m3u8?sig=abc");
  assert.equal(session.resume, 12);
});

test("it is used once: the next open of the same episode makes a fresh session", async () => {
  const before = creates();
  await PlaybackService.open(next);
  assert.equal(creates(), before + 1);
});

test("opening while the preparation is still in flight waits for it instead of creating a second one", async () => {
  const before = creates();
  PlaybackService.prefetch(next);
  await PlaybackService.open(next);
  assert.equal(creates(), before + 1);
});

test("preparing the same episode twice makes one session", async () => {
  const before = creates();
  PlaybackService.prefetch(next);
  PlaybackService.prefetch(next);
  await settle();
  assert.equal(creates(), before + 1);
  await PlaybackService.open(next); // use it up
});

test("a session about to expire is not used; a fresh one is made", async () => {
  fake.state.sessionExpiresAt = new Date(Date.now() + 30_000).toISOString(); // under the margin
  PlaybackService.prefetch(next);
  await settle();
  fake.state.sessionExpiresAt = null;
  const before = creates();
  await PlaybackService.open(next);
  assert.equal(creates(), before + 1);
});

test("a refusal while preparing (locked, PIN) is ignored there and appears only when really opened", async () => {
  const seen = [];
  const off = events.locked.subscribe((e) => seen.push(e));
  fake.state.playbackProblem = problem(402, "not-entitled", "Payment Required", "Unlock first.");
  PlaybackService.prefetch({ ...next, number: 3 });
  await settle();
  assert.deepEqual(seen, [], "preparing does not raise the unlock sheet");
  fake.state.playbackProblem = null;

  const before = creates();
  await PlaybackService.open({ ...next, number: 3 }); // it is open now: a normal create
  assert.equal(creates(), before + 1, "the failed preparation was not kept");
  fake.state.playbackProblem = problem(402, "not-entitled", "Payment Required", "Unlock first.");
  await assert.rejects(() => PlaybackService.open({ ...next, number: 4 }));
  fake.state.playbackProblem = null;
  assert.equal(seen.length, 1, "opening it for real does");
  off();
});

test("a prepared session the server no longer knows is replaced once, invisibly", async () => {
  PlaybackService.prefetch(next);
  await settle();
  const before = creates();
  fake.state.startGoneOnce = true;
  const session = await PlaybackService.open(next);
  assert.equal(creates(), before + 1, "one fresh session");
  assert.ok(session.playlistUrl);
});

test("a start that fails for another reason is not retried or hidden", async () => {
  fake.state.playbackProblem = null;
  PlaybackService.prefetch(next);
  await settle();
  fake.state.startGoneOnce = true;
  // a fresh (non-prefetched) open does not retry: the error is real
  await PlaybackService.open(next).catch(() => undefined);
  fake.state.startGoneOnce = false;
  await assert.rejects(
    async () => {
      fake.state.startGoneOnce = true;
      await PlaybackService.open({ ...next, number: 9 });
    },
    (e) => e.type === "urn:ott:error:playback-session-not-found",
  );
});

test("nothing prepared for one login is used for the next", async () => {
  PlaybackService.prefetch(next);
  await settle();
  await auth.logout();
  const before = creates();
  await PlaybackService.open(next);
  assert.equal(creates(), before + 1, "the other person's session was dropped");
});

test("only the latest few preparations are kept", async () => {
  const before = creates();
  for (const number of [11, 12, 13]) PlaybackService.prefetch({ ...next, number });
  await settle();
  assert.equal(creates(), before + 3);
  await PlaybackService.open({ ...next, number: 11 }); // the oldest was dropped: a new create
  assert.equal(creates(), before + 4);
  await PlaybackService.open({ ...next, number: 13 }); // still held: no create
  assert.equal(creates(), before + 4);
});

test("no request or response violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});
