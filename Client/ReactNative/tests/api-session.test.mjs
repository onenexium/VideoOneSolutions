import assert from "node:assert/strict";
import test, { after } from "node:test";
import { boot } from "./support/boot.mjs";

const ctx = await boot();
after(() => ctx.fake.close());
const { fake, api, store } = ctx;

test("the first authenticated request starts exactly one guest session", async () => {
  // Three parallel calls before any session exists must not create three guests.
  const results = await Promise.all([
    ctx.catalog.DramaService.getDramaFeed(5),
    ctx.catalog.DramaService.getDramaFeed(5),
    ctx.catalog.DramaService.getDramaFeed(5),
  ]);
  assert.equal(results.every((items) => items.length === 2), true);
  assert.equal(fake.state.guestCalls, 1, "one guest session for parallel callers");

  const [guest] = fake.calls("POST", "/v1/auth/guest");
  assert.match(guest.body.device.id, /^[\w-]{8,64}$/, "device id matches the API pattern");
  assert.equal(guest.body.device.platform, "android");
  assert.equal(guest.body.device.appVersion, "1.0.0");
  assert.equal(guest.headers.authorization, undefined, "the guest request itself is anonymous");
});

test("authenticated requests carry the bearer token and platform header", () => {
  const feed = fake.calls("GET", "/v1/feed");
  assert.ok(feed.length >= 3);
  for (const request of feed) {
    assert.equal(request.headers.authorization, "Bearer access-1");
    assert.equal(request.headers["x-platform"], "android");
  }
});

test("only the refresh token and device id are persisted, never the access token", () => {
  assert.equal(store.get("onenexium_refresh_token"), "refresh-token-000000000001");
  assert.match(store.get("onenexium_device_id"), /^[\w-]{8,64}$/);
  for (const value of store.values()) {
    assert.notEqual(value, "access-1", "access token must stay in memory");
  }
  assert.equal(api.getAccessToken(), "access-1");
});

test("the same device id is reused for later sessions", async () => {
  const before = store.get("onenexium_device_id");
  api.setAccessToken(null);
  store.delete("onenexium_refresh_token");
  await ctx.catalog.DramaService.getDramaFeed(5);
  const guests = fake.calls("POST", "/v1/auth/guest");
  assert.equal(guests.length, 2);
  assert.equal(guests[1].body.device.id, before);
});

test("no request or response violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});
