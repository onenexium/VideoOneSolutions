import assert from "node:assert/strict";
import test, { after } from "node:test";
import { boot } from "./support/boot.mjs";

const ctx = await boot();
after(() => ctx.fake.close());
const { fake } = ctx;
const history = await import("../services/historyService.ts");
const support = await import("../services/supportService.ts");

// ---- history and continue watching (BE-66) ----

test("History pages to the end, with where the viewer is; a series no longer shown has no card", async () => {
  fake.state.history = [["abc1", 3], ["gone", 2]];
  const first = await history.getHistory();
  assert.deepEqual(first.items.map((i) => [i.shortId, i.episode, i.position, i.availability]), [
    ["abc1", 3, 30, "available"],
    ["gone", 2, 30, "removed"],
  ]);
  assert.equal(first.items[0].meta.dramaId, "abc1");
  assert.equal(first.items[1].meta, null);
  const last = await history.getHistory(first.nextCursor);
  assert.deepEqual(last.items.map((i) => i.shortId), ["old1"]);
  assert.equal(last.nextCursor, null);
});

test("removing one series, then clearing all", async () => {
  fake.state.history = [["abc1", 3], ["def2", 1]];
  await history.removeFromHistory("abc1");
  assert.deepEqual(fake.state.history, [["def2", 1]]);
  await history.clearHistory();
  assert.deepEqual((await history.getHistory()).items, []);
});

test("Continue watching gives the episode to play next and how far in; hiding takes one off", async () => {
  fake.state.continuing = [["abc1", 4, 42], ["def2", 7, 0]];
  const items = await history.getContinueWatching();
  assert.deepEqual(items.map((i) => [i.meta.dramaId, i.episode, i.position, i.newEpisode]), [
    ["abc1", 4, 42, false],
    ["def2", 7, 0, true],
  ]);
  await history.hideFromContinue("abc1");
  assert.deepEqual((await history.getContinueWatching()).map((i) => i.meta.dramaId), ["def2"]);
});

test("pausing history is read back from the server", async () => {
  assert.equal(await history.getHistoryPaused(), false);
  assert.equal(await history.setHistoryPaused(true), true);
  assert.equal(await history.getHistoryPaused(), true);
  assert.equal(await history.setHistoryPaused(false), false);
});

// ---- help, legal, sharing ----

test("help articles in a language, searched; one article with its text; an unknown one is not found", async () => {
  assert.deepEqual((await support.getHelpArticles("hi")).map((a) => [a.slug, a.language]), [
    ["how-coins-work", "hi"],
    ["parental-lock", "en"],
  ]);
  assert.deepEqual((await support.getHelpArticles("en", "parental")).map((a) => a.slug), ["parental-lock"]);
  assert.match((await support.getHelpArticle("how-coins-work", "en")).body, /never expire/);
  await assert.rejects(() => support.getHelpArticle("nope", "en"), (e) => e.type === "urn:ott:error:help-article-not-found");
});

test("a legal text in force has its address; one not published yet is null, not an error", async () => {
  assert.equal((await support.getLegalDocument("terms", "hi")).url, "https://site.test/legal/terms/v2");
  assert.equal(await support.getLegalDocument("company", "en"), null);
});

test("a share gives the link to send; a series that does not exist is series-not-found", async () => {
  const share = await support.createShare({ series: "abc1", episode: 3, channel: "whatsapp" });
  assert.equal(share.url, `${share.canonicalUrl}?s=${share.code}`);
  assert.deepEqual(fake.state.shares.at(-1), { series: "abc1", episode: 3, channel: "whatsapp" });
  await assert.rejects(() => support.createShare({ series: "zzzz9" }), (e) => e.type === "urn:ott:error:series-not-found");
});

// ---- tickets and reports ----

test("a ticket needs somewhere to answer; with an email it is filed and listed", async () => {
  await assert.rejects(
    () => support.createTicket({ kind: "support", category: "account", message: "Cannot log in" }),
    (e) => e.type === "urn:ott:error:contact-email-required",
  );
  const t = await support.createTicket({ kind: "grievance", category: "wrong_rating", message: "Rated U", email: "a@example.com" });
  assert.equal(t.kind, "grievance");
  assert.ok(t.decideBy, "a grievance shows when it will be decided by");
  assert.deepEqual((await support.getTickets()).map((x) => x.id), [t.id]);
});

test("a report of a title: content is a grievance, a video problem is support", async () => {
  const content = await support.reportTitle({ series: "abc1", category: "violence_self_harm", email: "a@example.com" });
  const technical = await support.reportTitle({ series: "abc1", episode: 2, category: "video_sound", email: "a@example.com" });
  assert.deepEqual([content.kind, technical.kind], ["grievance", "support"]);
});

test("a ticket's history grows with replies; a closed one refuses them; a decided grievance shows the appeal route", async () => {
  const t = await support.createTicket({ kind: "grievance", category: "copyright", message: "Mine", email: "a@example.com" });
  const replied = await support.replyToTicket(t.id, "Any news?");
  assert.deepEqual(replied.events.map((e) => [e.kind, e.body]), [["created", null], ["reply", "Any news?"]]);
  fake.state.tickets.find((x) => x.id === t.id).status = "decided";
  assert.equal((await support.getTicket(t.id)).appealUrl, "https://www.dpcgc.org/");
  fake.state.tickets.find((x) => x.id === t.id).status = "closed";
  await assert.rejects(() => support.replyToTicket(t.id, "?"), (e) => e.type === "urn:ott:error:ticket-closed");
});

// ---- privacy and notifications ----

test("the privacy centre: a request and nominees need the step-up code", async () => {
  const centre = await support.getPrivacy();
  assert.equal(centre.responseDays, 30);
  assert.equal(centre.data.historySeries, 5);
  await assert.rejects(() => support.createPrivacyRequest({ kind: "access", code: "000000" }), (e) => e.type === "urn:ott:error:otp-invalid");
  const r = await support.createPrivacyRequest({ kind: "correction", details: "My name", code: "654321" });
  assert.equal(r.status, "open");
  await support.setNominees({ nominees: [{ name: "Ravi", phone: "+919812345678" }], code: "654321" });
  const after = await support.getPrivacy();
  assert.deepEqual([after.requests.length, after.nominees], [1, [{ name: "Ravi", phone: "+919812345678" }]]);
});

test("notification switches: a marketing one needs consent; a push token is registered", async () => {
  assert.equal((await support.getNotificationPreferences()).newEpisodes, true);
  await assert.rejects(
    () => support.updateNotificationPreferences({ checkinReminder: true }),
    (e) => e.type === "urn:ott:error:marketing-consent-required",
  );
  assert.equal((await support.updateNotificationPreferences({ newEpisodes: false })).newEpisodes, false);
  fake.state.marketingConsent = true;
  assert.equal((await support.updateNotificationPreferences({ checkinReminder: true })).checkinReminder, true);
  await support.registerPushToken({ expoToken: "ExponentPushToken[abcdefghijklmnopqrstuv]", platform: "android", timeZone: "Asia/Kolkata", language: "hi" });
  assert.equal(fake.state.pushTokens.at(-1).timeZone, "Asia/Kolkata");
});

test("no request or response violated the OpenAPI contract", () => {
  assert.deepEqual(fake.state.contractErrors, []);
});

test("changing an optional consent records it against the current notice, keeping the required one", async () => {
  const support2 = await import("../services/supportService.ts");
  await support2.updateConsent({ recommendations: false, analytics: false, marketing: true });
  assert.deepEqual(fake.state.consents.at(-1), {
    noticeId: "33333333-3333-3333-3333-333333333333",
    required: true,
    recommendations: false,
    analytics: false,
    marketing: true,
  });
  assert.deepEqual(fake.state.contractErrors, []);
});
