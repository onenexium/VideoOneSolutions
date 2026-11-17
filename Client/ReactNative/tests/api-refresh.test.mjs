import assert from "node:assert/strict";
import test, { after } from "node:test";
import { boot } from "./support/boot.mjs";

const ctx = await boot();
after(() => ctx.fake.close());
const { fake, api, store } = ctx;

test("a 401 refreshes once and retries the request with the new token", async () => {
  await ctx.catalog.DramaService.getDramaFeed(5); // creates the guest session (access-1)
  fake.state.validAccess.clear(); // the access token expires on the server

  const items = await ctx.catalog.DramaService.getDramaFeed(5);
  assert.equal(items.length, 2);
  assert.equal(fake.state.refreshCalls, 1);
  assert.equal(fake.state.guestCalls, 1, "refreshing must not start a new guest");

  const feed = fake.calls("GET", "/v1/feed");
  assert.equal(feed.at(-2).headers.authorization, "Bearer access-1", "first try used the old token");
  assert.equal(feed.at(-1).headers.authorization, "Bearer access-2", "the retry used the new token");
  assert.equal(feed.at(-1).headers["x-platform"], "android", "the retry keeps the platform header");
  assert.equal(
    fake.calls("POST", "/v1/auth/refresh").at(-1).headers.authorization,
    undefined,
    "the public refresh endpoint never receives the expired bearer token",
  );
  assert.equal(store.get("onenexium_refresh_token"), "refresh-token-000000000002", "the rotated refresh token is stored");
});

test("parallel 401s spend the single-use refresh token only once", async () => {
  const refreshBefore = fake.state.refreshCalls;
  fake.state.validAccess.clear();
  const results = await Promise.all([
    ctx.catalog.DramaService.getDramaFeed(5),
    ctx.catalog.DramaService.getDramaFeed(5),
    ctx.catalog.DramaService.getDramaFeed(5),
  ]);
  assert.equal(results.every((items) => items.length === 2), true);
  assert.equal(fake.state.refreshCalls - refreshBefore, 1);
});

test("a refresh the server cannot answer (503) keeps the login; a later try restores it", async () => {
  const guestsBefore = fake.state.guestCalls;
  const token = store.get("onenexium_refresh_token");
  fake.state.validAccess.clear();
  fake.state.refreshDown = "server";
  await assert.rejects(
    () => ctx.catalog.DramaService.getDramaFeed(5),
    (error) => error.name === "ApiError" && error.status === 401,
  );
  assert.equal(store.get("onenexium_refresh_token"), token, "the refresh token is kept");
  assert.equal(fake.state.guestCalls, guestsBefore, "no new guest replaces the account");

  fake.state.refreshDown = null;
  const items = await ctx.catalog.DramaService.getDramaFeed(5);
  assert.equal(items.length, 2, "the same login works once the server answers");
  assert.equal(fake.state.guestCalls, guestsBefore);
});

test("a cold start with no network keeps the login instead of starting a guest", async () => {
  const guestsBefore = fake.state.guestCalls;
  const token = store.get("onenexium_refresh_token");
  api.setAccessToken(null); // the app was just opened: nothing in memory
  fake.state.refreshDown = "network";
  await assert.rejects(() => ctx.catalog.DramaService.getDramaFeed(5));
  assert.equal(store.get("onenexium_refresh_token"), token);
  assert.equal(fake.state.guestCalls, guestsBefore);
  assert.equal(api.pendingRetryCopies(), 0);

  fake.state.refreshDown = null;
  assert.equal((await ctx.catalog.DramaService.getDramaFeed(5)).length, 2);
  assert.equal(fake.state.guestCalls, guestsBefore, "restored from the stored token, not a new guest");
});

test("a request that never gets a response leaves no retry copy behind", async () => {
  fake.state.feedDown = true;
  await assert.rejects(() => ctx.catalog.DramaService.getDramaFeed(5));
  fake.state.feedDown = false;
  assert.equal(api.pendingRetryCopies(), 0);
});

test("a revoked refresh token surfaces the 401 and does not loop", async () => {
  fake.state.validAccess.clear();
  fake.state.failRefresh = true;
  const refreshBefore = fake.state.refreshCalls;
  const feedBefore = fake.calls("GET", "/v1/feed").length;

  await assert.rejects(
    () => ctx.catalog.DramaService.getDramaFeed(5),
    (error) => error.name === "ApiError" && error.status === 401,
  );
  assert.equal(fake.state.refreshCalls - refreshBefore, 1, "one refresh attempt, not a loop");
  assert.equal(fake.calls("GET", "/v1/feed").length - feedBefore, 1, "the request is not retried");
  assert.equal(store.has("onenexium_refresh_token"), false, "the dead refresh token is dropped");
  assert.equal(api.getAccessToken(), null);
});

test("no request or response violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});
