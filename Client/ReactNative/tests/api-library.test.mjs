import assert from "node:assert/strict";
import test, { after } from "node:test";
import { boot } from "./support/boot.mjs";

const ctx = await boot();
after(() => ctx.fake.close());
const { fake } = ctx;
const lib = await import("../services/libraryService.ts");

test("the series page has the details, every episode with its price, and what this viewer did", async () => {
  const detail = await lib.getSeriesDetail("abc1");
  assert.equal(detail.series.title, "Tamil Version");
  assert.deepEqual(detail.episodes.map((e) => e.order), [1, 2, 3], "all pages of episodes");
  assert.deepEqual(detail.episodes.map((e) => e.vip), [false, true, false], "episode 2 costs coins; no price yet is not locked");
  assert.equal(detail.following, false);
  assert.deepEqual(detail.watched, [1], "only finished episodes");
});

test("the page still works when the viewer's side cannot be read", async () => {
  fake.state.mySeriesDown = true;
  const detail = await lib.getSeriesDetail("abc1");
  fake.state.mySeriesDown = false;
  assert.equal(detail.episodes.length, 3);
  assert.equal(detail.following, false);
  assert.deepEqual(detail.watched, []);
});

test("following adds to My List and is seen on the series page; unfollowing removes it", async () => {
  await lib.follow("abc1");
  await lib.follow("abc1"); // idempotent
  assert.equal((await lib.getSeriesDetail("abc1")).following, true);
  const list = await lib.getMyList("updated");
  assert.deepEqual(list.items.map((i) => i.shortId), ["abc1"]);
  assert.equal(fake.state.listSorts.at(-1), "updated");
  assert.equal(list.items[0].newEpisodes, true);
  assert.equal(list.items[0].meta.dramaId, "abc1");
  assert.equal(list.limit, 500);
  await lib.unfollow("abc1");
  await lib.unfollow("abc1");
  assert.equal((await lib.getSeriesDetail("abc1")).following, false);
  assert.deepEqual((await lib.getMyList()).items, []);
});

test("a full list is the API's list-full, and nothing is added", async () => {
  fake.state.listFull = true;
  await assert.rejects(() => lib.follow("zzz9"), (e) => e.type === "urn:ott:error:list-full" && e.status === 409);
  fake.state.listFull = false;
  assert.equal(fake.state.followed.has("zzz9"), false);
});

test("a series taken down stays in the list as unavailable, without a card", async () => {
  await lib.follow("gone");
  const entry = (await lib.getMyList()).items.find((i) => i.shortId === "gone");
  assert.equal(entry.availability, "removed");
  assert.equal(entry.meta, null);
  assert.equal(entry.posterUrl, "https://img.test/gone-poster.jpg");
  await lib.unfollow("gone");
});

test("search pages through results to the end; no match is an empty page, not an error", async () => {
  const first = await lib.searchSeries("kismat");
  assert.deepEqual(first.items.map((d) => d.dramaId), ["res1", "res2"]);
  const last = await lib.searchSeries("kismat", first.nextCursor);
  assert.deepEqual(last.items.map((d) => d.dramaId), ["res3"]);
  assert.equal(last.nextCursor, null);
  assert.equal(fake.state.searches.at(-1), "kismat");
  const none = await lib.searchSeries("nothing");
  assert.deepEqual(none, { items: [], nextCursor: null });
});

test("suggestions give series and trope chips named in the app language, falling back to English", async () => {
  const hi = await lib.getSearchSuggestions("hi");
  assert.deepEqual(hi.series.map((d) => d.dramaId), ["sug1"]);
  assert.deepEqual(hi.tropes, [{ slug: "revenge", name: "बदला" }]);
  assert.deepEqual((await lib.getSearchSuggestions("ta")).tropes, [{ slug: "revenge", name: "Revenge" }]);
});

test("similar series come as cards", async () => {
  assert.deepEqual((await lib.getSimilar("abc1")).map((d) => d.dramaId), ["sim1", "sim2"]);
});

test("liking and unliking an episode is idempotent and shows on the series page and in the player's list", async () => {
  await lib.setLiked("abc1", 2, true);
  await lib.setLiked("abc1", 2, true);
  assert.deepEqual([...fake.state.liked], [2]);
  assert.deepEqual(fake.state.likeCalls.at(-1), ["PUT", "abc1", 2]);
  const detail = await lib.getSeriesDetail("abc1");
  assert.deepEqual(detail.episodes.map((e) => [e.order, e.liked]), [[1, undefined], [2, true], [3, undefined]]);
  const playing = await ctx.catalog.DramaService.getDramaList({ drama_id: "abc1" });
  assert.equal(playing.find((e) => e.order === 2).liked, true);
  await lib.setLiked("abc1", 2, false);
  await lib.setLiked("abc1", 2, false);
  assert.deepEqual([...fake.state.liked], []);
  assert.equal((await ctx.catalog.DramaService.getDramaList({ drama_id: "abc1" })).some((e) => e.liked), false);
});

test("a like that cannot be saved is an error the player can undo", async () => {
  fake.state.likeDown = true;
  await assert.rejects(() => lib.setLiked("abc1", 3, true));
  fake.state.likeDown = false;
  assert.deepEqual([...fake.state.liked], []);
});

test("no request or response violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});
