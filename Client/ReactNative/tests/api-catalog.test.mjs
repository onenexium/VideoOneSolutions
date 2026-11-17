import assert from "node:assert/strict";
import test, { after } from "node:test";
import { boot } from "./support/boot.mjs";

const ctx = await boot();
after(() => ctx.fake.close());
const { fake } = ctx;
const { DramaService } = ctx.catalog;

test("home rails map onto the four screen sections", async () => {
  const channel = await DramaService.getDramaChannel();
  assert.deepEqual(channel.loop.map((d) => d.dramaId), ["aaa1", "aaa2"], "the hero rail is the carousel");
  assert.deepEqual(channel.trending.map((d) => d.dramaId), ["bbb1"]);
  assert.deepEqual(channel.new.map((d) => d.dramaId), ["ccc1"]);
  assert.deepEqual(channel.recommend.map((d) => d.dramaId), ["ddd1", "eee1"], "remaining rails are merged");
  assert.equal(channel.loop[0].dramaTitle, "Hero One");
  assert.equal(channel.loop[0].dramaCoverUrl, "https://img.test/aaa1-poster.jpg");
  assert.equal(channel.loop[0].newRelease, true);
  assert.equal(channel.loop[1].newRelease, false);
  assert.equal(channel.loop[0].dramaLength, 3);
});

test("a null badge (as staging sends) is treated as not new", async () => {
  fake.state.nullBadges = true;
  const channel = await DramaService.getDramaChannel();
  assert.equal(channel.loop.every((d) => d.newRelease === false), true);
  fake.state.nullBadges = false;
});

test("the feed maps each series to a first-episode playback reference", async () => {
  const feed = await DramaService.getDramaFeed(10);
  assert.equal(feed.length, 2);
  const [first] = feed;
  assert.equal(first.drama_meta.drama_id, "fff1");
  assert.equal(first.video_meta.vid, "fff1:1");
  assert.deepEqual(first.video_meta.playback, { series: "fff1", number: 1, language: "hi" });
  assert.deepEqual(first.video_meta.sources, [], "the URL comes from a playback session, not the catalogue");
  assert.equal(first.video_meta.vip, false);
  assert.equal(fake.calls("GET", "/v1/feed").at(-1).query.limit, "10");
});

test("the feed pages by cursor to the end, so no series is left out", async () => {
  const first = await DramaService.getDramaFeedPage(2);
  assert.deepEqual(first.items.map((i) => i.drama_meta.drama_id), ["fff1", "fff2"]);
  assert.equal(first.nextCursor, "page2");
  const second = await DramaService.getDramaFeedPage(2, first.nextCursor);
  assert.deepEqual(second.items.map((i) => i.drama_meta.drama_id), ["fff3"]);
  assert.equal(second.nextCursor, null, "the end of the feed");
  assert.equal(fake.calls("GET", "/v1/feed").at(-1).query.cursor, "page2");
});

test("home tells the screen which rails sit behind its sections, for See all", async () => {
  const channel = await DramaService.getDramaChannel();
  assert.deepEqual(channel.railKeys, { trending: "trending", new: "new" });
});

test("See all pages a rail by cursor to its end; an unknown rail is the API's rail-not-found", async () => {
  const first = await DramaService.getRailPage("trending");
  assert.deepEqual(first.items.map((d) => d.dramaId), ["trending1", "trending2"]);
  assert.equal(first.items[0].dramaTitle, "Rail One");
  const last = await DramaService.getRailPage("trending", first.nextCursor);
  assert.deepEqual(last.items.map((d) => d.dramaId), ["trending3"]);
  assert.equal(last.nextCursor, null);
  await assert.rejects(() => DramaService.getRailPage("missing"), (e) => e.type?.endsWith("rail-not-found"));
});

test("Browse pages through every series by cursor to the end", async () => {
  const ids = [];
  let cursor;
  do {
    const page = await DramaService.getBrowsePage(cursor);
    ids.push(...page.items.map((d) => d.dramaId));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.deepEqual(ids, ["brw1", "brw2", "brw3"]);
});

test("episodes are fetched across pages in the series' own language", async () => {
  const episodes = await DramaService.getDramaList({ drama_id: "abc1" });
  assert.deepEqual(episodes.map((e) => e.order), [1, 2, 3], "both pages are returned in order");
  assert.deepEqual(episodes.map((e) => e.vid), ["abc1:1", "abc1:2", "abc1:3"]);

  const requests = fake.calls("GET", "/v1/series/abc1/episodes");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].query.language, "ta", "uses the series' language, not a guess");
  assert.equal(requests[0].query.cursor, undefined);
  assert.equal(requests[1].query.cursor, "page2");

  assert.deepEqual(episodes[0].playback, { series: "abc1", number: 1, language: "ta" });
  assert.equal(episodes[0].duration, 61);
  assert.equal(episodes[0].cover_url, "https://img.test/thumb-1.jpg", "episode thumbnail wins");
  assert.equal(episodes[1].cover_url, "https://img.test/series-poster.jpg", "falls back to the poster");
  assert.equal(episodes[0].like, 10);
});

test("paid episodes are locked, free and unpriced ones are not", async () => {
  const episodes = await DramaService.getDramaList({ drama_id: "abc1" });
  assert.deepEqual(
    episodes.map((e) => e.vip),
    [false, true, false],
    "price {free:true}, price {free:false}, price null",
  );
});

test("an API failure is an ApiError, not an empty list", async () => {
  fake.state.catalogFails = true;
  await assert.rejects(
    () => DramaService.getDramaChannel(),
    (error) => error.name === "ApiError" && error.status === 503,
  );
  fake.state.catalogFails = false;
});

test("no request or response violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});
