import assert from "node:assert/strict";
import test, { after } from "node:test";
import { boot } from "./support/boot.mjs";

const ctx = await boot();
after(() => ctx.fake.close());
const { fake } = ctx;
const wallet = await import("../services/walletService.ts");
const lib = await import("../services/libraryService.ts");
const { PlaybackService } = ctx.playback;
const { DramaService } = ctx.catalog;
const spendable = (w) => w.purchased + w.promo;
const reset = () => {
  fake.state.unlocked.clear();
  fake.state.wallet = { purchased: 10, promo: 0, debt: 0 };
  fake.state.charges.length = 0;
  fake.state.price = 5;
};

test("the wallet is read from the server every time, with promo coins by the day they end", async () => {
  const w = await wallet.getWallet();
  assert.deepEqual([w.purchased, w.promo, w.total, w.debt], [10, 0, 10, 0]);
  fake.state.wallet.promo = 3;
  const again = await wallet.getWallet();
  assert.deepEqual(again.promoByExpiry, [{ coins: 3, expiresOn: "2026-12-31" }]);
  fake.state.wallet.promo = 0;
});

test("history pages newest first to the end", async () => {
  const first = await wallet.getWalletHistory();
  assert.deepEqual(first.items.map((e) => e.type), ["unlock", "bonus"]);
  const last = await wallet.getWalletHistory(first.nextCursor);
  assert.deepEqual(last.items.map((e) => e.id), ["e3"]);
  assert.equal(last.nextCursor, null);
});

test("episodes carry their price", async () => {
  const eps = await DramaService.getDramaList({ drama_id: "abc1" });
  assert.deepEqual(eps.map((e) => [e.order, e.vip, e.coins]), [[1, false, 0], [2, true, 5], [3, false, undefined]]);
});

test("unlocking charges once, the episode then plays, and the series page agrees", async () => {
  reset();
  const key = wallet.newIdempotencyKey();
  const result = await wallet.unlock({ series: "abc1", episode: 2, expectedCoins: 5, idempotencyKey: key });
  assert.equal(result.status, "unlocked");
  assert.deepEqual(result.episodes, [2]);
  assert.equal(result.coins, 5);
  assert.equal(spendable(await wallet.getWallet()), 5);
  const sent = fake.calls("POST", "/v1/unlocks").at(-1);
  assert.equal(sent.headers["idempotency-key"], key);
  assert.deepEqual(sent.body, { series: "abc1", episode: 2, expectedCoins: 5 });

  const eps = await DramaService.getDramaList({ drama_id: "abc1" });
  assert.equal(eps.find((e) => e.order === 2).vip, false, "unlocked: no longer locked");
  const detail = await lib.getSeriesDetail("abc1");
  assert.equal(detail.episodes.find((e) => e.order === 2).vip, false);
  assert.deepEqual(detail.mine.unlockedEpisodes, [2]);
});

test("a retry with the same key (a lost answer, a double tap) is charged once", async () => {
  reset();
  const key = wallet.newIdempotencyKey();
  const send = () => wallet.unlock({ series: "abc1", episode: 2, expectedCoins: 5, idempotencyKey: key });
  const [a, b] = await Promise.all([send(), send()]);
  const c = await send();
  assert.equal(fake.state.charges.length, 1, "one charge");
  assert.deepEqual([a.coins, b.coins, c.coins], [5, 5, 5], "the same answer each time");
  assert.equal(spendable(await wallet.getWallet()), 5);
});

test("unlocking what is already yours charges nothing", async () => {
  const result = await wallet.unlock({ series: "abc1", episode: 2, expectedCoins: 5, idempotencyKey: wallet.newIdempotencyKey() });
  assert.equal(result.status, "already-yours");
  assert.equal(result.coins, 0);
  assert.equal(spendable(await wallet.getWallet()), 5);
});

test("a price that moved is refused with the new price and nothing is charged", async () => {
  reset();
  fake.state.price = 8;
  await assert.rejects(
    () => wallet.unlock({ series: "abc1", episode: 2, expectedCoins: 5, idempotencyKey: wallet.newIdempotencyKey() }),
    (e) => {
      assert.deepEqual(wallet.refusalOf(e), { reason: "price-changed", coins: 8 });
      return true;
    },
  );
  assert.equal(spendable(await wallet.getWallet()), 10);
  fake.state.price = 5;
});

test("not enough coins, a balance due and a guest are each their own refusal, with nothing charged", async () => {
  reset();
  const attempt = () => wallet.unlock({ series: "abc1", episode: 2, expectedCoins: 5, idempotencyKey: wallet.newIdempotencyKey() });
  fake.state.wallet = { purchased: 2, promo: 0, debt: 0 };
  await assert.rejects(attempt, (e) => wallet.refusalOf(e)?.reason === "insufficient-coins");
  fake.state.wallet = { purchased: 10, promo: 0, debt: 4 };
  await assert.rejects(attempt, (e) => wallet.refusalOf(e)?.reason === "wallet-in-debt");
  fake.state.wallet = { purchased: 10, promo: 0, debt: 0 };
  fake.state.guestMoney = true;
  await assert.rejects(attempt, (e) => wallet.refusalOf(e)?.reason === "login-needed");
  fake.state.guestMoney = false;
  assert.equal(fake.state.unlocked.has(2), false);
  assert.equal(wallet.refusalOf(new Error("network")), null, "a network error is not a refusal");
});

test("starting playback after an auto-unlock tells the player, and Undo gives the coins back", async () => {
  reset();
  fake.state.unlocked.add(2);
  fake.state.wallet.purchased = 5;
  fake.state.autoUnlocked = { unlockId: "u-1", episode: 2, coins: 5 };
  const session = await PlaybackService.open({ series: "abc1", number: 2, language: "hi" });
  assert.deepEqual(session.autoUnlocked, { unlockId: "u-1", episode: 2, coins: 5 });

  const undone = await wallet.undoUnlock("u-1");
  assert.equal(undone.coins, 5);
  assert.equal(spendable(await wallet.getWallet()), 10);
  assert.equal(fake.state.unlocked.has(2), false, "locked again");

  fake.state.undoUnavailable = true;
  await assert.rejects(() => wallet.undoUnlock("u-1"), (e) => e.type === "urn:ott:error:unlock-undo-unavailable");
  fake.state.undoUnavailable = false;
  fake.state.autoUnlocked = null;
  const none = await PlaybackService.open({ series: "abc1", number: 1, language: "hi" });
  assert.equal(none.autoUnlocked, null);
});

test("the screen is told when starting charged an auto-unlock, and when an episode turns out to be locked", async () => {
  const events = await import("../services/playbackEvents.ts");
  const { problem } = await import("./support/fake-api.mjs");
  const got = [];
  const off = [
    events.autoUnlocked.subscribe((e) => got.push(["auto", e])),
    events.locked.subscribe((e) => got.push(["locked", e])),
  ];
  fake.state.autoUnlocked = { unlockId: "u-2", episode: 2, coins: 5 };
  await PlaybackService.open({ series: "abc1", number: 2, language: "hi" });
  fake.state.autoUnlocked = null;
  fake.state.playbackProblem = problem(402, "not-entitled", "Payment Required", "Unlock this episode first.");
  await assert.rejects(() => PlaybackService.open({ series: "abc1", number: 3, language: "hi" }));
  fake.state.playbackProblem = problem(403, "pin-required", "Forbidden", "PIN.");
  await assert.rejects(() => PlaybackService.open({ series: "abc1", number: 4, language: "hi" }));
  fake.state.playbackProblem = null;
  off.forEach((f) => f());
  assert.deepEqual(got, [
    ["auto", { series: "abc1", unlockId: "u-2", episode: 2, coins: 5 }],
    ["locked", { series: "abc1", episode: 3 }],
  ], "a PIN prompt is not a lock");
});

test("with auto-unlock on, locked episodes can be played (the API charges at start) but the series page still shows the lock", async () => {
  reset();
  fake.state.autoUnlock = true;
  const playing = await DramaService.getDramaList({ drama_id: "abc1" });
  assert.equal(playing.find((e) => e.order === 2).vip, false);
  assert.equal(playing.find((e) => e.order === 2).coins, 5, "the price is still known");
  assert.equal((await lib.getSeriesDetail("abc1")).episodes.find((e) => e.order === 2).vip, true);
  fake.state.autoUnlock = false;
  assert.equal((await DramaService.getDramaList({ drama_id: "abc1" })).find((e) => e.order === 2).vip, true);
});

test("auto-unlock is switched on and off per series and read back on the series page", async () => {
  await wallet.setAutoUnlock("abc1", true);
  assert.equal((await lib.getSeriesDetail("abc1")).mine.autoUnlock, true);
  await wallet.setAutoUnlock("abc1", false);
  assert.equal((await lib.getSeriesDetail("abc1")).mine.autoUnlock, false);
});

test("the daily check-in is claimed once; a retry with the same key gives the first result", async () => {
  reset();
  const state = await wallet.getCheckIn();
  assert.deepEqual([state.canClaim, state.nextCoins, state.ladder.length], [true, 1, 7]);
  const key = wallet.newIdempotencyKey();
  const first = await wallet.claimCheckIn(key);
  const retry = await wallet.claimCheckIn(key);
  assert.deepEqual(retry, first);
  assert.equal(fake.state.wallet.promo, 1, "granted once");
  await assert.rejects(
    () => wallet.claimCheckIn(wallet.newIdempotencyKey()),
    (e) => e.type === "urn:ott:error:checkin-already-claimed",
  );
  assert.equal((await wallet.getCheckIn()).claimedToday, true);
});

test("every money write carried an Idempotency-Key", () => {
  const writes = [...fake.calls("POST", "/v1/unlocks"), ...fake.calls("POST", "/v1/me/checkins")];
  assert.ok(writes.length > 5);
  for (const w of writes) assert.match(w.headers["idempotency-key"], /^[\w-]{8,}$/);
});

test("no request or response violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});
