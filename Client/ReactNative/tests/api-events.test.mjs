import assert from "node:assert/strict";
import test, { after } from "node:test";
import { boot } from "./support/boot.mjs";

const ctx = await boot();
after(() => ctx.fake.close());
const { fake } = ctx;
const events = await import("../services/eventsService.ts");
const fr = await import("../services/firstRun.ts");
const { asyncStore } = await import("./support/stubs/async-storage.mjs");

const consent = (recommendations) =>
  fr.completeFirstRun({
    noticeId: "33333333-3333-3333-3333-333333333333",
    recommendations,
    analytics: false,
    marketing: false,
    olderThanMinimum: true,
  });

test("without consent to recommendations nothing is recorded, let alone sent", async () => {
  events.resetEvents();
  await consent(false);
  events.trackPreviewWatched({ series: "abc1", language: "hi", seconds: 30 });
  assert.equal(events.pendingEvents(), 0);
  await events.flushEvents();
  assert.equal(fake.state.eventBatches.length, 0);
});

test("with consent, a preview watched for 10 s counts once per series, and is sent in a batch", async () => {
  events.resetEvents();
  await consent(true);
  events.trackPreviewWatched({ series: "abc1", language: "hi", seconds: 4 });
  assert.equal(events.pendingEvents(), 0, "under 10 s does not count");
  events.trackPreviewWatched({ series: "abc1", language: "hi", seconds: 12.7 });
  events.trackPreviewWatched({ series: "abc1", language: "hi", seconds: 40 });
  events.trackPreviewWatched({ series: "xyz9", language: "ta", seconds: 11 });
  assert.equal(events.pendingEvents(), 2);
  await events.flushEvents();
  assert.deepEqual(fake.state.eventBatches.at(-1), [
    { kind: "preview_watched", series: "abc1", language: "hi", seconds: 12 },
    { kind: "preview_watched", series: "xyz9", language: "ta", seconds: 11 },
  ]);
  assert.equal(events.pendingEvents(), 0);
});

test("a batch that cannot be sent is kept and goes out next time, without a visible error", async () => {
  events.resetEvents();
  events.trackPreviewWatched({ series: "kept", language: "hi", seconds: 15 });
  fake.state.eventsDown = true;
  await events.flushEvents(); // does not throw
  fake.state.eventsDown = false;
  assert.equal(events.pendingEvents(), 1);
  await events.flushEvents();
  assert.equal(events.pendingEvents(), 0);
  assert.equal(fake.state.eventBatches.at(-1)[0].series, "kept");
});

test("withdrawing consent stops further events", async () => {
  events.resetEvents();
  asyncStore.clear();
  await consent(false);
  events.trackPreviewWatched({ series: "late", language: "hi", seconds: 20 });
  assert.equal(events.pendingEvents(), 0);
});

test("no request or response violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});
