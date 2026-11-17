import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register("./support/ts-loader.mjs", import.meta.url);
const { callPlayer, isReleasedPlayerError } = await import("../utils/safePlayer.ts");

// The exact error text captured from a phone running the app.
const FROM_PHONE = new Error(
  "Call to function 'VideoPlayer.pause' has been rejected.\n" +
    "→ Caused by: The 1st argument cannot be cast to type expo.modules.video.player.VideoPlayer (received class java.lang.Integer)\n" +
    "→ Caused by: Cannot use shared object that was already released",
);

test("recognises the released-player error from a real device", () => {
  assert.equal(isReleasedPlayerError(FROM_PHONE), true);
  assert.equal(isReleasedPlayerError("Cannot use shared object that was Already Released"), true);
});

test("does not mistake other errors for it", () => {
  for (const other of [new Error("decoder crashed"), new Error("Network request failed"), "boom", null, undefined, 0]) {
    assert.equal(isReleasedPlayerError(other), false, String(other));
  }
});

test("callPlayer runs the call and ignores only the released-player error", () => {
  let ran = 0;
  callPlayer(() => { ran++; });
  assert.equal(ran, 1);
  assert.doesNotThrow(() => callPlayer(() => { throw FROM_PHONE; }));
  assert.throws(() => callPlayer(() => { throw new Error("decoder crashed"); }), /decoder crashed/);
});
