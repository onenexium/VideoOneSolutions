import assert from "node:assert/strict";
import test, { after } from "node:test";
import { boot } from "./support/boot.mjs";

const ctx = await boot({ mock: true });
after(() => ctx.fake.close());
const { fake } = ctx;
const { DramaService } = ctx.catalog;

test("without a base URL the app runs on the mock catalogue and never touches the network", async () => {
  assert.equal(ctx.api.USE_MOCK_API, true);
  const channel = await DramaService.getDramaChannel();
  const feed = await DramaService.getDramaFeed(5);
  const episodes = await DramaService.getDramaList({ drama_id: "d1" });
  await ctx.session.ensureSession();

  assert.ok(channel.loop.length > 0 && channel.trending.length > 0);
  assert.ok(feed.length > 0);
  assert.ok(episodes.length > 0);
  assert.equal(fake.state.log.length, 0, "no request was made");
});

test("mock episodes keep the direct-source shape the player already supported", async () => {
  const [episode] = await DramaService.getDramaList({ drama_id: "d1" });
  assert.ok(episode.sources.length > 0 && episode.sources[0].url.startsWith("https://"));
  assert.equal(episode.playback, undefined, "mock episodes need no playback session");
  assert.equal(episode.vip, false);
});

test("test videos are addressed through whichever dev server the app was loaded from", async () => {
  const { devMediaBase } = await import("../services/mockCatalog.ts");
  assert.equal(
    devMediaBase("k9k9nti-ott-onenexium-8081.exp.direct"),
    "https://k9k9nti-ott-onenexium-8081.exp.direct/dev-media",
    "an Expo tunnel is https",
  );
  assert.equal(devMediaBase("192.168.1.5:8081"), "http://192.168.1.5:8081/dev-media", "a LAN server is http");
  assert.equal(devMediaBase("192.168.1.5:8081/extra/path"), "http://192.168.1.5:8081/dev-media");
  assert.equal(devMediaBase(undefined), null, "a release build has no dev server");
  assert.equal(devMediaBase(""), null);
});

test("without a dev server the mock episodes fall back to the public test stream", async () => {
  const { mockEpisodes } = await import("../services/mockCatalog.ts");
  const episodes = mockEpisodes("d1");
  assert.equal(episodes.length, 4);
  for (const episode of episodes) {
    assert.match(episode.sources[0].url, /^https:\/\/test-streams\.mux\.dev\//);
  }
});
