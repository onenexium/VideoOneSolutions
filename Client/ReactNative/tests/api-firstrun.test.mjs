import assert from "node:assert/strict";
import test, { after } from "node:test";
import { boot } from "./support/boot.mjs";

const ctx = await boot();
after(() => ctx.fake.close());
const { fake } = ctx;
const fr = await import("../services/firstRun.ts");
const cfg = await import("../services/appConfigService.ts");
const gate = await import("../services/appGate.ts");
const { asyncStore } = await import("./support/stubs/async-storage.mjs");

const full = (extra = {}) => ({
  noticeId: "33333333-3333-3333-3333-333333333333",
  recommendations: false,
  analytics: false,
  marketing: false,
  appLanguage: "en",
  contentLanguages: ["hi", "ta"],
  olderThanMinimum: true,
  ...extra,
});

test("the phone's language is used when the app has it, else the default", async () => {
  const config = fake.state.config;
  assert.equal(fr.defaultAppLanguage(config, "en-IN"), "en");
  assert.equal(fr.defaultAppLanguage(config, "hi_IN"), "hi");
  assert.equal(fr.defaultAppLanguage(config, "fr-FR"), "hi", "not supported: the default");
});

test("on a first launch the whole screen is needed, with the notice and nothing pre-ticked", async () => {
  fr.resetFirstRun();
  const state = await fr.checkFirstRun();
  assert.equal(state.status, "needed");
  assert.equal(state.mode, "full");
  assert.equal(state.notice.id, "33333333-3333-3333-3333-333333333333");
  assert.equal(state.choices, null, "no choice made yet");
});

test("completing it saves the age, the languages and the consent, and the screen does not come back", async () => {
  const state = await fr.completeFirstRun(full({ analytics: true }));
  assert.equal(state.status, "done");
  assert.deepEqual(fake.state.ages.at(-1), { confirmedMinimumAge: true });
  assert.deepEqual(fake.state.profileChanges.at(-1), { appLanguage: "en", contentLanguages: ["hi", "ta"] });
  assert.deepEqual(fake.state.consents.at(-1), {
    noticeId: "33333333-3333-3333-3333-333333333333",
    required: true,
    recommendations: false,
    analytics: true,
    marketing: false,
  });
  fr.resetFirstRun();
  assert.equal((await fr.checkFirstRun()).status, "done", "next start: straight in");
});

test("when the notice changes the consent screen alone comes back, with the earlier choices", async () => {
  fake.state.noticeVersion = 3;
  fr.resetFirstRun();
  const state = await fr.checkFirstRun();
  assert.equal(state.status, "needed");
  assert.equal(state.mode, "consent");
  assert.deepEqual(state.choices, { recommendations: false, analytics: true, marketing: false });
  const ages = fake.state.ages.length;
  const done = await fr.completeFirstRun({ noticeId: state.notice.id, recommendations: false, analytics: true, marketing: false });
  assert.equal(done.status, "done");
  assert.equal(fake.state.ages.length, ages, "age is not asked again");
  fake.state.noticeVersion = 2;
  fake.state.consentedVersion = 2;
});

test("an account that already gave its date of birth just goes on", async () => {
  asyncStore.clear();
  fake.state.consentedVersion = null;
  fake.state.ageAlreadySet = true;
  fr.resetFirstRun();
  const state = await fr.checkFirstRun();
  const done = await fr.completeFirstRun(full({ noticeId: state.notice.id }));
  fake.state.ageAlreadySet = false;
  assert.equal(done.status, "done");
});

test("'I am under 18' stops the app for 24 hours, even after a restart, and then it asks again", async () => {
  asyncStore.clear();
  fake.state.consentedVersion = null;
  const ages = fake.state.ages.length;
  const now = Date.now();
  const refused = await fr.completeFirstRun(full({ olderThanMinimum: false }), now);
  assert.equal(refused.status, "refused");
  assert.equal(fake.state.ages.length, ages, "nothing sent about a viewer who declined");

  fr.resetFirstRun();
  assert.equal((await fr.checkFirstRun(now + 3600_000)).status, "refused", "an hour later, after a restart");
  fr.resetFirstRun();
  assert.equal((await fr.checkFirstRun(now + 25 * 3600_000)).status, "needed", "a day later it asks again");
});

test("the server refusing the age is remembered the same way", async () => {
  asyncStore.clear();
  fake.state.ageTooYoung = true;
  const refused = await fr.completeFirstRun(full());
  fake.state.ageTooYoung = false;
  assert.equal(refused.status, "refused");
  assert.ok(Number(asyncStore.get("onenexium_underage_until")) > Date.now());
});

test("a save that fails leaves the screen open and nothing marked done; trying again works", async () => {
  asyncStore.clear();
  fake.state.consentedVersion = null;
  fr.resetFirstRun();
  fake.state.consentDown = true;
  await assert.rejects(() => fr.completeFirstRun(full()));
  fake.state.consentDown = false;
  assert.equal(asyncStore.get("onenexium_first_run_done"), undefined);
  fr.resetFirstRun();
  assert.equal((await fr.checkFirstRun()).mode, "full", "still the whole first-run");
  assert.equal((await fr.completeFirstRun(full())).status, "done");
});

test("with guest mode off the app asks a guest to log in; with a launch prompt it asks once at launch", async () => {
  gate.resetGate();
  fake.state.config = { ...fake.state.config, guestMode: false, loginPrompt: "launch" };
  fake.state.configVersion = 50;
  await cfg.loadAppConfig();
  assert.equal(gate.getGate().loginRequired, true);
  assert.equal(gate.getGate().loginPromptAtLaunch, true);
  fake.state.config = { ...fake.state.config, guestMode: true, loginPrompt: "first_paywall" };
  fake.state.configVersion = 51;
  await cfg.loadAppConfig();
  assert.equal(gate.getGate().loginRequired, false);
  assert.equal(gate.getGate().loginPromptAtLaunch, false);
});

test("no request or response violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});
