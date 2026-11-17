import assert from "node:assert/strict";
import test, { after } from "node:test";
import { boot } from "./support/boot.mjs";
import { problem } from "./support/fake-api.mjs";

const ctx = await boot();
after(() => ctx.fake.close());
const { fake } = ctx;
const { PlaybackService } = ctx.playback;
const ref = { series: "abc1", number: 1, language: "hi" };

test("opening a session creates then starts it and returns the signed playlist", async () => {
  const session = await PlaybackService.open(ref);
  assert.equal(session.id, "sess-1");
  assert.equal(session.playlistUrl, "https://cdn.test/sess-1/playlist.m3u8?sig=abc");
  assert.equal(session.resume, 12);
  assert.equal(session.heartbeatSeconds, 15);
  assert.equal(session.licenceToken, null, "free episodes carry no licence");

  const order = fake.state.log.filter((r) => r.path.startsWith("/v1/playback/")).map((r) => r.path);
  assert.deepEqual(order, ["/v1/playback/sessions", "/v1/playback/sessions/sess-1/start"]);
  const [create] = fake.calls("POST", "/v1/playback/sessions");
  assert.deepEqual(create.body, {
    series: "abc1",
    episode: 1,
    language: "hi",
    capabilities: { dataSaver: false },
  });
  assert.match(create.headers.authorization, /^Bearer access-/);
});

test("heartbeats send position, a rising sequence and state, and report ok", async () => {
  assert.equal(await PlaybackService.heartbeat("sess-1", 30.5, 1, "playing"), true);
  assert.equal(await PlaybackService.heartbeat("sess-1", 31, 2, "paused"), true);
  const beats = fake.calls("POST", "/v1/playback/sessions/sess-1/heartbeat");
  assert.deepEqual(beats.map((b) => b.body), [
    { position: 30.5, sequence: 1, state: "playing" },
    { position: 31, sequence: 2, state: "paused" },
  ]);
});

test("a revoked heartbeat is reported so the player can stop", async () => {
  fake.state.heartbeatStatus = "revoked";
  assert.equal(await PlaybackService.heartbeat("sess-1", 40, 3, "playing"), false);
  fake.state.heartbeatStatus = "ok";
});

test("ending a session accepts the empty 204 response", async () => {
  await PlaybackService.end("sess-1", 45, 4);
  assert.deepEqual(fake.state.sessionsEnded, ["sess-1"]);
  const [end] = fake.calls("POST", "/v1/playback/sessions/sess-1/end");
  assert.deepEqual(end.body, { position: 45, sequence: 4 });
});

test("a refusal surfaces as an ApiError with the machine-readable type and safe detail", async () => {
  fake.state.playbackProblem = problem(402, "not-entitled", "Payment Required", "Unlock this episode first.");
  const startsBefore = fake.calls("POST", "/v1/playback/sessions/sess-1/start").length;
  await assert.rejects(
    () => PlaybackService.open(ref),
    (error) =>
      error.name === "ApiError" &&
      error.status === 402 &&
      error.type === "urn:ott:error:not-entitled" &&
      error.message === "Unlock this episode first." &&
      error.problem.requestId === "req-test",
  );
  assert.equal(
    fake.calls("POST", "/v1/playback/sessions/sess-1/start").length,
    startsBefore,
    "a refused session is never started",
  );
  fake.state.playbackProblem = null;
});

test("no request or response violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});
