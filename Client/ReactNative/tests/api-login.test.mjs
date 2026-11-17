import assert from "node:assert/strict";
import test, { after } from "node:test";
import { boot } from "./support/boot.mjs";

const ctx = await boot();
after(() => ctx.fake.close());
const { fake, api, store } = ctx;
const auth = await import("../services/authService.ts");

test("phone numbers typed the way people type them become international form", () => {
  assert.equal(auth.normalizePhone("98123 45678"), "+919812345678");
  assert.equal(auth.normalizePhone("09812345678"), "+919812345678");
  assert.equal(auth.normalizePhone("+91 98123-45678"), "+919812345678");
  assert.equal(auth.normalizePhone("00919812345678"), "+919812345678");
  assert.equal(auth.normalizePhone("12345"), null);
  assert.equal(auth.normalizePhone("abcdefghij"), null);
});

test("the code is requested for this install, and a rate limit is the API's own error", async () => {
  const seconds = await auth.requestOtp("+919000000001");
  assert.equal(seconds, 300);
  const sent = fake.state.otpsSent.at(-1);
  assert.equal(sent.clientId, store.get("onenexium_device_id"), "the code works only on this device");
  await assert.rejects(
    () => auth.requestOtp("+919000000009"),
    (e) => e.type === "urn:ott:error:otp-rate-limited" && e.status === 429,
  );
});

test("verifying logs in, carries the guest session along, and keeps only the refresh token", async () => {
  await ctx.catalog.DramaService.getDramaFeed(5); // a guest exists
  const guestToken = api.getAccessToken();
  const step = await auth.verifyOtp("+919000000001", "123456");
  assert.equal(step.kind, "done");
  assert.equal(step.viewer.kind, "member");
  assert.equal(fake.state.verifiedWithGuest.at(-1), guestToken, "the guest's Authorization went with the code");
  assert.notEqual(api.getAccessToken(), guestToken, "the new session replaced the guest's");
  for (const value of store.values()) assert.notEqual(value, api.getAccessToken());
  assert.equal(auth.needsOnboarding(step.viewer), false);
  assert.equal(ctx.session.getViewer().kind, "member");
});

test("a wrong code is the API's otp-invalid and changes nothing", async () => {
  const before = api.getAccessToken();
  await assert.rejects(
    () => auth.verifyOtp("+919000000001", "000000"),
    (e) => e.type === "urn:ott:error:otp-invalid",
  );
  assert.equal(api.getAccessToken(), before);
});

test("an expired access token is refreshed and the same code tried again", async () => {
  fake.state.validAccess.clear(); // the token on the server is gone, the refresh token still works
  const step = await auth.verifyOtp("+919000000001", "123456");
  assert.equal(step.kind, "done");
  assert.notEqual(fake.state.verifiedWithGuest.at(-1), null, "retried with a fresh token");
});

test("at the device limit the screen gets the devices and a ticket, and resolving finishes the login", async () => {
  const step = await auth.verifyOtp("+919000000002", "123456");
  assert.equal(step.kind, "deviceLimit");
  assert.equal(step.devices[0].id, "22222222-2222-2222-2222-222222222222");
  const done = await auth.resolveDeviceLimit(step.ticket, step.devices[0].id);
  assert.equal(done.kind, "done");
  assert.deepEqual(fake.state.signedOut, ["22222222-2222-2222-2222-222222222222"]);
  await assert.rejects(
    () => auth.resolveDeviceLimit("stale-ticket-0000000000000", step.devices[0].id),
    (e) => e.type === "urn:ott:error:device-limit-ticket-invalid",
  );
});

test("a possibly recycled number asks, and the answer finishes the login", async () => {
  const step = await auth.verifyOtp("+919000000003", "123456");
  assert.equal(step.kind, "recycledNumber");
  const done = await auth.answerRecycledNumber(step.ticket, false);
  assert.equal(done.kind, "done");
  assert.deepEqual(fake.state.recycledAnswers, [false]);
});

test("a new number is in onboarding until its age and consent are given", async () => {
  const step = await auth.verifyOtp("+919000000004", "123456");
  assert.equal(step.kind, "done");
  assert.equal(auth.needsOnboarding(step.viewer), true);
  const notice = await auth.getConsentNotice("en");
  assert.equal(notice.upToDate, false);
  await auth.completeOnboarding({
    dateOfBirth: "1998-05-31",
    noticeId: notice.notice.id,
    recommendations: false,
    analytics: false,
    marketing: false,
  });
  assert.deepEqual(fake.state.ages.at(-1), { dateOfBirth: "1998-05-31" });
  assert.deepEqual(fake.state.consents.at(-1), {
    noticeId: notice.notice.id,
    required: true,
    recommendations: false,
    analytics: false,
    marketing: false,
  });
});

test("logging out ends the login on the server, then the device is a guest again", async () => {
  const refresh = store.get("onenexium_refresh_token");
  const guestsBefore = fake.state.guestCalls;
  await auth.logout();
  assert.equal(fake.state.loggedOut.at(-1), refresh);
  assert.equal(fake.state.guestCalls, guestsBefore + 1, "a new guest session starts");
  assert.equal(ctx.session.getViewer().kind, "guest");
});

test("logging out offline still signs the device out", async () => {
  await auth.verifyOtp("+919000000001", "123456");
  const loggedBefore = fake.state.loggedOut.length;
  const memberToken = await ctx.session.getRefreshToken();
  fake.state.logoutDown = true;
  try {
    await auth.logout();
  } finally {
    fake.state.logoutDown = false;
  }
  assert.equal(fake.state.loggedOut.length, loggedBefore, "the server was not reached");
  assert.notEqual(await ctx.session.getRefreshToken(), memberToken, "the member's login is gone from the device");
  assert.equal(ctx.session.getViewer().kind, "guest", "the device is a guest again");
});

test("no request or response violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});

test("a date of birth must be a real date in the past", () => {
  const now = new Date("2026-11-17T00:00:00Z");
  assert.equal(auth.parseBirthDate("1998-05-31", now), "1998-05-31");
  assert.equal(auth.parseBirthDate("1998-02-30", now), null, "no such day");
  assert.equal(auth.parseBirthDate("2027-01-01", now), null, "not yet born");
  assert.equal(auth.parseBirthDate("31-05-1998", now), null);
  assert.equal(auth.parseBirthDate("1850-01-01", now), null);
});

// ---- email ----

test("email addresses and new passwords are checked before anything is sent", () => {
  assert.equal(auth.normalizeEmail("  asha@example.com "), "asha@example.com");
  assert.equal(auth.normalizeEmail("asha@"), null);
  assert.equal(auth.normalizeEmail("asha example@x.com"), null);
  assert.equal(auth.isNewPasswordOk("short"), false);
  assert.equal(auth.isNewPasswordOk("long enough pw"), true);
  assert.equal(auth.isNewPasswordOk("x".repeat(129)), false);
});

test("an email code is requested for this install", async () => {
  assert.equal(await auth.requestEmailCode("new@example.com"), 300);
  assert.equal(fake.state.emailCodes.at(-1).clientId, store.get("onenexium_device_id"));
});

test("signing up with the code sets the password and logs in, carrying the guest along", async () => {
  await auth.logout(); // a fresh guest
  const guest = api.getAccessToken();
  const step = await auth.verifyEmail("new@example.com", "123456", "a long new password");
  assert.equal(step.kind, "done");
  assert.equal(step.viewer.email, "new@example.com");
  assert.equal(fake.state.emailLogins.at(-1).bearer, guest, "the guest's Authorization went with it");
  await assert.rejects(() => auth.verifyEmail("new@example.com", "000000", "a long new password"), (e) => e.type === "urn:ott:error:otp-invalid");
});

test("logging in with email and password works; a wrong password is credentials-invalid", async () => {
  await auth.logout();
  const step = await auth.loginWithEmail("old@example.com", "correct horse battery");
  assert.equal(step.kind, "done");
  assert.equal(ctx.session.getViewer().kind, "member");
  await assert.rejects(() => auth.loginWithEmail("old@example.com", "nope"), (e) => e.type === "urn:ott:error:credentials-invalid" && e.status === 400);
  await assert.rejects(() => auth.loginWithEmail("nobody@example.com", "whatever whatever"), (e) => e.type === "urn:ott:error:credentials-invalid", "an unknown address answers the same");
});

test("too many wrong tries lock the login, and the API's own message is kept", async () => {
  fake.state.emailLocked = true;
  await assert.rejects(() => auth.loginWithEmail("old@example.com", "correct horse battery"), (e) => e.type === "urn:ott:error:login-locked" && e.status === 429);
  fake.state.emailLocked = false;
});

test("an expired guest token is refreshed and the email login tried again", async () => {
  await auth.logout();
  fake.state.validAccess.clear();
  const step = await auth.loginWithEmail("old@example.com", "correct horse battery");
  assert.equal(step.kind, "done");
});

test("no email request or response violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});
