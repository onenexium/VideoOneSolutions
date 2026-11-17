import assert from "node:assert/strict";
import test, { after } from "node:test";
import { boot } from "./support/boot.mjs";
import { problem } from "./support/fake-api.mjs";

const ctx = await boot();
after(() => ctx.fake.close());
const { fake } = ctx;
const { PlaybackService } = ctx.playback;
const queue = await import("../services/progressQueue.ts");
const pin = await import("../services/pinService.ts");
const streams = await import("../services/streamsService.ts");
const { asyncStore } = await import("./support/stubs/async-storage.mjs");
const ref = { series: "abc1", number: 1, language: "hi" };
const SESSION = "11111111-1111-4111-8111-111111111111";

// ---- progress queue ----

test("a heartbeat lost to a dropped connection is kept, and goes out when the connection is back", async () => {
  fake.state.heartbeatDown = true;
  await assert.rejects(() => PlaybackService.heartbeat(SESSION, 42, 7, "playing"));
  fake.state.heartbeatDown = false;
  assert.deepEqual(await queue.queuedPositions(), [{ sessionId: SESSION, sequence: 7, position: 42 }]);
  assert.equal(fake.state.progressBatches.length, 0, "nothing sent while offline");

  assert.equal(await PlaybackService.heartbeat(SESSION, 50, 8, "playing"), true); // back online
  await queue.flushProgress(); // let the background flush finish
  assert.deepEqual(fake.state.progressBatches.at(-1), [{ sessionId: SESSION, sequence: 7, position: 42 }]);
  assert.deepEqual(await queue.queuedPositions(), [], "the queue is cleared once the server has it");
});

test("only the latest position of a session is kept; a lost end is kept too", async () => {
  fake.state.heartbeatDown = true;
  await assert.rejects(() => PlaybackService.heartbeat(SESSION, 10, 1, "playing"));
  await assert.rejects(() => PlaybackService.heartbeat(SESSION, 20, 2, "playing"));
  await assert.rejects(() => PlaybackService.end(SESSION, 30, 3));
  fake.state.heartbeatDown = false;
  assert.deepEqual(await queue.queuedPositions(), [{ sessionId: SESSION, sequence: 3, position: 30 }]);
  await queue.flushProgress();
});

test("a refusal from the server is not a connection problem and is never queued", async () => {
  const before = await queue.queuedPositions();
  fake.state.heartbeatGone = true;
  await assert.rejects(
    () => PlaybackService.heartbeat(SESSION, 5, 1, "playing"),
    (e) => e.type === "urn:ott:error:playback-session-not-found",
  );
  fake.state.heartbeatGone = false;
  assert.deepEqual(await queue.queuedPositions(), before);
});

test("positions go out oldest first, at most 50 a request, and an offline flush keeps them all", async () => {
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  for (let n = 1; n <= 120; n++) await queue.enqueuePosition({ sessionId: id(n), sequence: n, position: n });
  fake.state.progressDown = true;
  await queue.flushProgress();
  assert.equal((await queue.queuedPositions()).length, 120, "offline: all kept");

  fake.state.progressDown = false;
  const batchesBefore = fake.state.progressBatches.length;
  await queue.flushProgress();
  const sent = fake.state.progressBatches.slice(batchesBefore);
  assert.deepEqual(sent.map((b) => b.length), [50, 50, 20]);
  assert.equal(sent[0][0].sessionId, id(1), "oldest first");
  assert.deepEqual(await queue.queuedPositions(), []);
});

test("a batch the server refuses as invalid is dropped, not retried forever", async () => {
  await queue.enqueuePosition({ sessionId: SESSION, sequence: 1, position: 5 });
  fake.state.progressRefused = true;
  await queue.flushProgress();
  fake.state.progressRefused = false;
  assert.deepEqual(await queue.queuedPositions(), []);
});

test("positions are clamped to what the API accepts and unreadable storage is ignored", async () => {
  await queue.enqueuePosition({ sessionId: SESSION, sequence: 1, position: 99999 });
  assert.equal((await queue.queuedPositions())[0].position, 36000);
  asyncStore.set("onenexium_progress_queue", "{not json");
  assert.deepEqual(await queue.queuedPositions(), []);
  await queue.flushProgress();
  asyncStore.clear();
});

// ---- parental PIN ----

test("a wrong PIN says how many tries are left; a locked PIN is the API's pin-locked", async () => {
  await assert.rejects(
    () => pin.verifyPin("9999"),
    (e) => e.type === "urn:ott:error:pin-invalid" && e.problem.attemptsLeft === 2,
  );
  await assert.rejects(() => pin.verifyPin("0000"), (e) => e.type === "urn:ott:error:pin-locked" && e.status === 429);
  assert.equal(pin.getPinToken(), undefined, "a failed PIN gives no token");
});

test("a correct PIN gives a token that goes with the playback request, until it expires", async () => {
  await PlaybackService.open(ref);
  assert.equal(fake.calls("POST", "/v1/playback/sessions").at(-1).body.pinToken, undefined, "none before the PIN");

  await pin.verifyPin("1234");
  await PlaybackService.open(ref);
  assert.equal(fake.calls("POST", "/v1/playback/sessions").at(-1).body.pinToken, "pin-token-1");

  assert.equal(pin.getPinToken(Date.now() + 15000 * 1000), undefined, "expired after its lifetime");
  pin.clearPinToken();
  await PlaybackService.open(ref);
  assert.equal(fake.calls("POST", "/v1/playback/sessions").at(-1).body.pinToken, undefined);
});

test("the API's pin-required reaches the player as an ApiError it can branch on", async () => {
  fake.state.playbackProblem = problem(403, "pin-required", "Forbidden", "Enter your PIN.");
  await assert.rejects(() => PlaybackService.open(ref), (e) => e.type === "urn:ott:error:pin-required");
  fake.state.playbackProblem = null;
});

// ---- Playing now ----

test("Playing now lists the streams and stopping one removes it", async () => {
  const list = await streams.getStreams();
  assert.deepEqual(list.map((s) => [s.id, s.series, s.episode, s.thisDevice]), [["st-1", "abc1", 3, false]]);
  await streams.stopStream("st-1");
  assert.deepEqual(fake.state.streamsStopped, ["st-1"]);
  assert.deepEqual(await streams.getStreams(), []);
});

test("no request or response violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});

test("logging out forgets the PIN, so the next login does not inherit it", async () => {
  const auth = await import("../services/authService.ts");
  await pin.verifyPin("1234");
  assert.equal(pin.getPinToken(), "pin-token-1");
  await auth.logout();
  assert.equal(pin.getPinToken(), undefined);
});

// ---- setting up the PIN ----

test("the PIN state is read; setting it needs the step-up code, defaults to U/A 13+, and voids any PIN token held", async () => {
  assert.deepEqual(await pin.getPinState(), { protectFrom: null, on: false, lockedUntil: null });
  await pin.verifyPin("1234");
  assert.equal(pin.getPinToken(), "pin-token-1");
  await assert.rejects(() => pin.setPin({ pin: "4321", code: "000000" }), (e) => e.type === "urn:ott:error:otp-invalid");
  const state = await pin.setPin({ pin: "4321", code: "654321" });
  assert.deepEqual(state, { protectFrom: "UA13", on: true, lockedUntil: null });
  assert.deepEqual(fake.state.pinSets.at(-1), { pin: "4321", code: "654321", protectFrom: "UA13" });
  assert.equal(pin.getPinToken(), undefined, "tokens of the old PIN are gone");
});

test("a stricter rating can be chosen, and removing the PIN needs the code too", async () => {
  assert.equal((await pin.setPin({ pin: "1111", code: "654321", protectFrom: "UA7" })).protectFrom, "UA7");
  await assert.rejects(() => pin.removePin("000000"), (e) => e.type === "urn:ott:error:otp-invalid");
  assert.equal((await pin.getPinState()).on, true, "a wrong code removes nothing");
  await pin.removePin("654321");
  assert.deepEqual(await pin.getPinState(), { protectFrom: null, on: false, lockedUntil: null });
});

test("no PIN setup request violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});

// ---- data saver and the rating card ----

test("the data saver is remembered, read back at the next start, and sent with every new session", async () => {
  const settings = await import("../services/playbackSettings.ts");
  await settings.setDataSaver(true);
  settings.forgetPlaybackSettingsInMemory(); // a new start of the app
  await settings.loadPlaybackSettings();
  assert.equal(settings.getDataSaver(), true);
  await PlaybackService.open(ref);
  assert.deepEqual(fake.calls("POST", "/v1/playback/sessions").at(-1).body.capabilities, { dataSaver: true });
  await settings.setDataSaver(false);
  await PlaybackService.open(ref);
  assert.deepEqual(fake.calls("POST", "/v1/playback/sessions").at(-1).body.capabilities, { dataSaver: false });
});

test("the screen is told which rating an opened episode has, for the rating card", async () => {
  const events = await import("../services/playbackEvents.ts");
  const got = [];
  const off = events.opened.subscribe((e) => got.push(e));
  await PlaybackService.open({ series: "abc1", number: 2, language: "hi" });
  off();
  assert.deepEqual(got, [{ series: "abc1", episode: 2, rating: "UA13" }]);
});
