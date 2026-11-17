import assert from "node:assert/strict";
import test, { after } from "node:test";
import { boot } from "./support/boot.mjs";

const ctx = await boot();
after(() => ctx.fake.close());
const { fake } = ctx;
const gate = await import("../services/appGate.ts");
const cfg = await import("../services/appConfigService.ts");
const version = await import("../services/version.ts");
const { asyncStore } = await import("./support/stubs/async-storage.mjs");

test("versions compare numerically, not as text", () => {
  assert.equal(version.isOlderVersion("1.9.0", "1.10.0"), true);
  assert.equal(version.isOlderVersion("1.10.0", "1.9.0"), false);
  assert.equal(version.isOlderVersion("2.0.0", "2.0.0"), false);
  assert.equal(version.isOlderVersion("0.9.9", "1.0.0"), true);
  assert.equal(version.appVersion(), "1.0.0");
});

test("every request says which build it is, in the form the API accepts", async () => {
  await ctx.catalog.DramaService.getDramaFeed(1); // a guest start and a feed read
  const all = fake.state.log;
  assert.ok(all.length >= 2);
  for (const request of all) {
    assert.match(request.headers["x-app-version"], /^\d+\.\d+\.\d+$/, `${request.path} carries the build`);
  }
  assert.ok(all.some((r) => r.path.startsWith("/v1/auth/")), "also the public auth routes");
});

test("a build below the minimum gets 426, and the app shows its update screen", async () => {
  gate.resetGate();
  fake.state.minVersion = "1.0.1";
  await assert.rejects(() => ctx.catalog.DramaService.getDramaFeed(1), (e) => e.status === 426 && e.type === "urn:ott:error:app-update-required");
  assert.equal(gate.getGate().updateRequired, true);
  fake.state.minVersion = null;
});

test("a build at the minimum is not blocked", async () => {
  gate.resetGate();
  fake.state.minVersion = "1.0.0";
  await ctx.catalog.DramaService.getDramaFeed(1);
  assert.equal(gate.getGate().updateRequired, false);
  fake.state.minVersion = null;
});

test("the config is fetched, remembered with its ETag, and revalidated: unchanged is a 304", async () => {
  gate.resetGate();
  const first = await cfg.loadAppConfig();
  assert.equal(first.guestMode, true);
  assert.equal(fake.state.configCalls.at(-1), null, "the first fetch has nothing to revalidate");
  assert.equal(cfg.isFeatureOn("rewarded_ads"), true);
  assert.equal(cfg.isFeatureOn("something_else"), false, "a missing switch is off");

  const second = await cfg.loadAppConfig();
  assert.deepEqual(second, first);
  assert.equal(fake.state.configCalls.at(-1), '"cfg-1"', "sent the last ETag");
  assert.equal(gate.getGate().updateRequired, false);
});

test("a changed config is picked up", async () => {
  fake.state.config = { ...fake.state.config, featureFlags: { rewarded_ads: false } };
  fake.state.configVersion = 2;
  await cfg.loadAppConfig();
  assert.equal(cfg.isFeatureOn("rewarded_ads"), false);
});

test("the config can say this build is too old, even before any request is refused", async () => {
  gate.resetGate();
  fake.state.config = { ...fake.state.config, minVersion: "1.2.0" };
  fake.state.configVersion = 3;
  await cfg.loadAppConfig();
  assert.equal(gate.getGate().updateRequired, true);
});

test("maintenance is shown with its message, and clears when it ends", async () => {
  gate.resetGate();
  fake.state.config = { ...fake.state.config, minVersion: null, maintenance: { enabled: true, message: "Back at 6 pm." } };
  fake.state.configVersion = 4;
  await cfg.loadAppConfig();
  assert.deepEqual(gate.getGate().maintenance, { message: "Back at 6 pm." });
  fake.state.config = { ...fake.state.config, maintenance: { enabled: false, message: null } };
  fake.state.configVersion = 5;
  await cfg.loadAppConfig();
  assert.equal(gate.getGate().maintenance, null);
});

test("a newer build gets a soft prompt once; 'not now' is remembered for that version only", async () => {
  gate.resetGate();
  fake.state.config = { ...fake.state.config, latestVersion: "1.1.0" };
  fake.state.configVersion = 6;
  await cfg.loadAppConfig();
  assert.equal(gate.getGate().updateAvailable, "1.1.0");
  assert.equal(gate.getGate().updateRequired, false, "a prompt does not block");

  await cfg.dismissUpdate("1.1.0");
  assert.equal(gate.getGate().updateAvailable, null);
  await cfg.loadAppConfig();
  assert.equal(gate.getGate().updateAvailable, null, "not asked again for 1.1.0");

  fake.state.config = { ...fake.state.config, latestVersion: "1.2.0" };
  fake.state.configVersion = 7;
  await cfg.loadAppConfig();
  assert.equal(gate.getGate().updateAvailable, "1.2.0", "a still newer build asks again");
});

test("with no network the app starts on the last config and is never blocked by the failure", async () => {
  gate.resetGate();
  fake.state.config = { ...fake.state.config, latestVersion: null, minVersion: null };
  fake.state.configVersion = 8;
  await cfg.loadAppConfig();
  fake.state.configDown = true;
  const config = await cfg.loadAppConfig();
  fake.state.configDown = false;
  assert.equal(config.consentNoticeVersion, 2, "the kept config");
  assert.equal(gate.getGate().updateRequired, false);
  assert.equal(gate.getGate().maintenance, null);
});

test("with no network and nothing kept the app still starts", async () => {
  asyncStore.clear();
  fake.state.configDown = true;
  cfg.forgetAppConfigInMemory(); // as a new start of the app: nothing in memory, nothing on the phone
  assert.equal(await cfg.loadAppConfig(), null);
  fake.state.configDown = false;
  assert.equal(gate.getGate().updateRequired, false);
});

test("no request or response violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});

test("a request with no answer marks the app offline, and any answer clears it", async () => {
  const net = await import("../services/connectivity.ts");
  net.markOnline();
  fake.state.feedDown = true;
  await assert.rejects(() => ctx.catalog.DramaService.getDramaFeed(1));
  fake.state.feedDown = false;
  assert.equal(net.isOffline(), true);
  let heard = 0;
  const off = net.subscribeConnectivity(() => heard++);
  await ctx.catalog.DramaService.getDramaFeed(1);
  off();
  assert.equal(net.isOffline(), false);
  assert.equal(heard, 1, "the screen is woken once, when it changes");
  // an error answer still means the network works
  fake.state.feedDown = true;
  await assert.rejects(() => ctx.catalog.DramaService.getDramaFeed(1));
  fake.state.feedDown = false;
  fake.state.minVersion = "9.9.9";
  await assert.rejects(() => ctx.catalog.DramaService.getDramaFeed(1)); // 426: an answer
  fake.state.minVersion = null;
  assert.equal(net.isOffline(), false);
});
