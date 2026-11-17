import assert from "node:assert/strict";
import test, { after } from "node:test";
import { boot } from "./support/boot.mjs";

const ctx = await boot();
after(() => ctx.fake.close());
const { fake } = ctx;
const account = await import("../services/accountService.ts");

test("changing the name or languages sends only what changed and keeps the viewer the server returns", async () => {
  await ctx.catalog.DramaService.getDramaFeed(1); // a session exists
  const viewer = await account.updateProfile({ displayName: "Asha", appLanguage: "en", contentLanguages: ["hi", "ta"] });
  assert.deepEqual(fake.state.profileChanges.at(-1), { displayName: "Asha", appLanguage: "en", contentLanguages: ["hi", "ta"] });
  assert.equal(viewer.displayName, "Asha");
  assert.equal(ctx.session.getViewer().displayName, "Asha", "the app's viewer follows");
  await account.updateProfile({ displayName: "Asha K" });
  assert.deepEqual(fake.state.profileChanges.at(-1), { displayName: "Asha K" });
  assert.deepEqual(ctx.session.getViewer().contentLanguages, ["hi", "ta"], "untouched fields stay");
});

test("a language that is not on is the API's language-unavailable and changes nothing", async () => {
  const before = ctx.session.getViewer().appLanguage;
  await assert.rejects(() => account.updateProfile({ appLanguage: "fr" }), (e) => e.type === "urn:ott:error:language-unavailable");
  assert.equal(ctx.session.getViewer().appLanguage, before);
});

test("the viewer subscription hears profile changes", async () => {
  let heard = 0;
  const off = ctx.session.subscribeViewer(() => heard++);
  await account.updateProfile({ displayName: "Asha M" });
  off();
  assert.equal(heard, 1);
});

test("devices are listed with this one marked, and signing one out removes it", async () => {
  const list = await account.listDevices();
  assert.deepEqual(list.map((d) => [d.id, d.current]), [["dev-1", true], ["dev-2", false]]);
  await account.signOutDevice("dev-2");
  assert.deepEqual(fake.state.devicesSignedOut, ["dev-2"]);
  assert.deepEqual((await account.listDevices()).map((d) => d.id), ["dev-1"]);
});

test("deleting needs a code first; a wrong code deletes nothing", async () => {
  assert.equal(await account.requestStepUp(), 300);
  assert.equal(fake.state.stepUpsSent, 1);
  await assert.rejects(() => account.requestDeletion("000000"), (e) => e.type === "urn:ott:error:otp-invalid");
  assert.equal(ctx.session.getViewer().status, "active");
});

test("with the right code the deletion is scheduled and the viewer shows it; cancelling keeps the account", async () => {
  const pending = await account.requestDeletion("654321");
  assert.equal(pending.status, "deletion_pending");
  assert.equal(ctx.session.getViewer().deletionScheduledFor, "2026-12-17T00:00:00.000Z");
  assert.deepEqual(fake.calls("POST", "/v1/me/deletion").at(-1).body, { code: "654321" });

  const kept = await account.cancelDeletion();
  assert.equal(kept.status, "active");
  assert.equal(ctx.session.getViewer().deletionScheduledFor, null);
});

test("an account with neither phone nor email cannot get a code: the API's step-up-unavailable", async () => {
  fake.state.stepUpUnavailable = true;
  await assert.rejects(() => account.requestStepUp(), (e) => e.type === "urn:ott:error:step-up-unavailable" && e.status === 409);
  fake.state.stepUpUnavailable = false;
});

test("no request or response violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});

// ---- phone number and login methods ----

test("changing the phone number: a code to each number, and the viewer then has the new one", async () => {
  fake.state.me = { ...fake.state.me, phone: "+919000000001", loginMethods: ["phone"] };
  assert.equal(await account.startPhoneChange("+919000000055"), 300);
  assert.deepEqual(fake.state.phoneChangesStarted, ["+919000000055"]);
  await assert.rejects(
    () => account.verifyPhoneChange({ phone: "+919000000055", oldCode: "000000", newCode: "222222" }),
    (e) => e.type === "urn:ott:error:otp-invalid",
  );
  assert.equal(ctx.session.getViewer().phone, "+919000000001", "a wrong code changes nothing");
  const viewer = await account.verifyPhoneChange({ phone: "+919000000055", oldCode: "111111", newCode: "222222" });
  assert.equal(viewer.phone, "+919000000055");
  assert.equal(ctx.session.getViewer().phone, "+919000000055");
});

test("a number another account has is the API's phone-in-use", async () => {
  await assert.rejects(() => account.startPhoneChange("+919000000077"), (e) => e.type === "urn:ott:error:phone-in-use" && e.status === 409);
});

test("an account without a phone adds one with only the new number's code", async () => {
  fake.state.me = { ...fake.state.me, phone: null, loginMethods: ["email"], email: "a@example.com" };
  const viewer = await account.verifyPhoneChange({ phone: "+919000000066", newCode: "222222" });
  assert.deepEqual(fake.state.phoneChanges.at(-1), { phone: "+919000000066", newCode: "222222" }, "no oldCode sent");
  assert.deepEqual(viewer.loginMethods.sort(), ["email", "phone"]);
});

test("adding an email login uses the emailed code; a taken address is login-method-in-use", async () => {
  fake.state.me = { ...fake.state.me, phone: "+919000000001", loginMethods: ["phone"], email: null };
  const viewer = await account.addEmailMethod({ email: "me@example.com", code: "123456", password: "a long new password" });
  assert.deepEqual(viewer.loginMethods.sort(), ["email", "phone"]);
  assert.equal(ctx.session.getViewer().email, "me@example.com");
  await assert.rejects(
    () => account.addEmailMethod({ email: "taken@example.com", code: "123456", password: "a long new password" }),
    (e) => e.type === "urn:ott:error:login-method-in-use",
  );
});

test("removing a login method needs the step-up code, and the last one cannot be removed", async () => {
  await assert.rejects(() => account.removeLoginMethod("email", "000000"), (e) => e.type === "urn:ott:error:otp-invalid");
  assert.equal(ctx.session.getViewer().loginMethods.length, 2);
  const viewer = await account.removeLoginMethod("email", "654321");
  assert.deepEqual(viewer.loginMethods, ["phone"]);
  await assert.rejects(() => account.removeLoginMethod("phone", "654321"), (e) => e.type === "urn:ott:error:last-login-method" && e.status === 409);
  assert.deepEqual(fake.calls("DELETE", "/v1/me/login-methods/phone").at(-1).body, { code: "654321" });
});

test("no phone or login-method request violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});
