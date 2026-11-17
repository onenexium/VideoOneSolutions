// A fake ott-api for client tests. It implements only the endpoints the app calls, and it
// validates every request body it receives and every response it sends against the real
// OpenAPI document (openapi/viewer.json), so a fixture that drifts from the contract fails.
import http from "node:http";
import { readFileSync } from "node:fs";
import Ajv from "ajv";

// OpenAPI 3.0 marks optional-null values with `nullable: true` (often next to a $ref or
// allOf). JSON Schema has no such keyword, so turn it into "this schema, or null".
function withJsonSchemaNulls(node) {
  if (Array.isArray(node)) return node.map(withJsonSchemaNulls);
  if (node === null || typeof node !== "object") return node;
  const { nullable, ...rest } = node;
  const converted = Object.fromEntries(
    Object.entries(rest).map(([key, value]) => [key, withJsonSchemaNulls(value)]),
  );
  return nullable === true ? { anyOf: [converted, { type: "null" }] } : converted;
}

const spec = withJsonSchemaNulls(
  JSON.parse(readFileSync(new URL("../../openapi/viewer.json", import.meta.url), "utf8")),
);

const ajv = new Ajv({ strict: false, validateFormats: false });
const validators = new Map();
export function validate(schemaName, value) {
  if (!validators.has(schemaName)) {
    validators.set(
      schemaName,
      ajv.compile({
        $ref: `#/components/schemas/${schemaName}`,
        components: spec.components,
      }),
    );
  }
  const check = validators.get(schemaName);
  return check(value) ? null : ajv.errorsText(check.errors);
}

const art = (name) => ({ url: `https://img.test/${name}.jpg`, focalX: 0.5, focalY: 0.5 });
const card = (shortId, title, badge = "hot") => ({
  shortId,
  title,
  slug: title.toLowerCase().replace(/\s+/g, "-"),
  language: "hi",
  poster: art(`${shortId}-poster`),
  cover: art(`${shortId}-cover`),
  episodes: 3,
  rating: "UA13",
  releaseState: "ongoing",
  badge,
});

const user = {
  kind: "guest",
  loginMethods: [],
  status: "active",
  id: "11111111-1111-1111-1111-111111111111",
  phone: null,
  email: null,
  displayName: null,
  preferredLanguage: null,
  appLanguage: null,
  contentLanguages: ["hi"],
  deletionScheduledFor: null,
};

export const problem = (status, type, title, detail) => ({
  type: `urn:ott:error:${type}`,
  title,
  status,
  detail,
  requestId: "req-test",
});

export async function startFakeApi() {
  const state = {
    log: [], // every request: { method, path, query, headers, body }
    guestCalls: 0,
    refreshCalls: 0,
    tokenSeq: 0,
    validAccess: new Set(),
    validRefresh: null,
    failRefresh: false,
    feedDown: false,
    phone: null,
    history: [],
    continuing: [],
    historyPaused: false,
    historyItem: (id, ep) => ({ shortId: id, title: `Title ${id}`, poster: { url: `https://img.test/${id}-poster.jpg`, focalX: 0.5, focalY: 0.5 },
      availability: id === "gone" ? "removed" : "available", card: id === "gone" ? null : card(id, `Title ${id}`),
      episode: ep, position: 30, duration: 120, watched: false, lastWatchedAt: "2026-01-02T00:00:00.000Z" }),
    shares: [],
    tickets: [],
    accountEmail: false,
    privacyRequests: [],
    nominees: [],
    notif: { newEpisodes: true, continueWatching: false, coinsExpiring: false, checkinReminder: false, hideTitles: false },
    marketingConsent: false,
    pushTokens: [],
    eventsDown: false,
    eventBatches: [],
    pin: { protectFrom: null, on: false, lockedUntil: null },
    pinSets: [],
    phoneChangesStarted: [],
    phoneChanges: [],
    consentDown: false,
    noticeVersion: 2,
    consentedVersion: null,
    ageAlreadySet: false,
    ageTooYoung: false,
    emailCodes: [],
    emailAccounts: new Map([["old@example.com", "correct horse battery"]]),
    emailLogins: [],
    emailLocked: false,
    liked: new Set(),
    likeDown: false,
    likeCalls: [],
    me: { ...user, kind: "member", loginMethods: ["phone"], phone: "+919000000001" },
    profileChanges: [],
    devices: [
      { id: "dev-1", platform: "android", model: "Pixel 8", appVersion: "1.0.0", lastSeenAt: "2026-01-02T00:00:00.000Z", current: true },
      { id: "dev-2", platform: "ios", model: "iPhone 15", appVersion: "1.0.0", lastSeenAt: "2026-01-01T00:00:00.000Z", current: false },
    ],
    devicesSignedOut: [],
    stepUpsSent: 0,
    stepUpUnavailable: false,
    minVersion: null,
    configVersion: 1,
    configDown: false,
    configCalls: [],
    config: {
      featureFlags: { rewarded_ads: true },
      minVersion: null,
      latestVersion: null,
      maintenance: { enabled: false, message: null },
      guestMode: true,
      loginPrompt: "first_paywall",
      languages: { app: ["hi", "en"], content: ["hi"], defaultApp: "hi", defaultContent: "hi" },
      consentNoticeVersion: 2,
    },
    startGoneOnce: false,
    sessionExpiresAt: null,
    price: 5,
    unlocked: new Set(),
    autoUnlock: false,
    autoUnlocked: null,
    undoUnavailable: false,
    guestMoney: false,
    wallet: { purchased: 10, promo: 0, debt: 0 },
    idem: new Map(),
    unlockKeys: [],
    checkinKeys: [],
    charges: [],
    undone: [],
    checkIn: { ladder: [1, 2, 2, 3, 3, 4, 6], today: "2026-01-01", claimedToday: false, canClaim: true, nextStep: 1, nextCoins: 1 },
    progressDown: false,
    progressRefused: false,
    progressBatches: [],
    heartbeatDown: false,
    heartbeatGone: false,
    streams: [{ id: "st-1", device: { id: "d1", platform: "android", model: "Pixel 8" }, thisDevice: false, series: "abc1", episode: 3, startedAt: "2026-01-01T00:00:00.000Z" }],
    streamsStopped: [],
    followed: new Set(),
    listFull: false,
    mySeriesDown: false,
    listSorts: [],
    searches: [],
    logoutDown: false,
    otpsSent: [],
    verifiedWithGuest: [],
    signedOut: [],
    recycledAnswers: [],
    loggedOut: [],
    ages: [],
    consents: [],
    refreshDown: null, // "network" | "server": refresh cannot be answered
    playbackProblem: null, // { status, body } makes POST /playback/sessions fail
    heartbeatStatus: "ok",
    sessionsEnded: [],
    contractErrors: [], // any request/response that did not match the OpenAPI document
  };

  function issueSession(asUser = user) {
    const n = ++state.tokenSeq;
    const accessToken = `access-${n}`;
    // The contract requires refresh tokens of at least 20 characters.
    const refreshToken = `refresh-token-${String(n).padStart(12, "0")}`;
    state.validAccess.add(accessToken);
    state.validRefresh = refreshToken;
    return { accessToken, refreshToken, expiresIn: 900, user: asUser };
  }

  const isAuthed = (headers) => {
    const token = (headers.authorization ?? "").replace(/^Bearer /, "");
    return state.validAccess.has(token);
  };

  function send(res, status, body, schemaName, contentType = "application/json") {
    if (schemaName) {
      const error = validate(schemaName, body);
      if (error) {
        state.contractErrors.push(`response ${schemaName}: ${error}`);
      }
    }
    const payload = body === undefined ? "" : JSON.stringify(body);
    res.writeHead(status, { "content-type": contentType });
    res.end(payload);
  }
  const sendProblem = (res, body) =>
    send(res, body.status, body, undefined, "application/problem+json");

  function route(method, url, headers, body, res) {
    const path = url.pathname;
    // The API's global rule: below the minimum build (or without a valid version) every route is 426.
    if (state.minVersion) {
      const version = headers["x-app-version"];
      const older = (v, m) => {
        const a = v.split(".").map(Number), b = m.split(".").map(Number);
        for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
        return false;
      };
      if (!version || !/^\d+\.\d+\.\d+$/.test(version) || older(version, state.minVersion)) {
        return sendProblem(res, problem(426, "app-update-required", "Upgrade Required", "Please update."));
      }
    }
    if (method === "GET" && path === "/v1/app-config") {
      state.configCalls.push(headers["if-none-match"] ?? null);
      if (state.configDown) return res.socket.destroy();
      const etag = `"cfg-${state.configVersion}"`;
      if (headers["if-none-match"] === etag) {
        res.writeHead(304, { etag });
        return res.end();
      }
      const error = validate("AppConfigResponse", state.config);
      if (error) state.contractErrors.push(`response AppConfigResponse: ${error}`);
      res.writeHead(200, { "content-type": "application/json", etag });
      return res.end(JSON.stringify(state.config));
    }
    const needsAuth = () => {
      if (isAuthed(headers)) return false;
      sendProblem(res, problem(401, "unauthorized", "Unauthorized", "Sign in first."));
      return true;
    };
    const checkBody = (schemaName) => {
      const error = validate(schemaName, body);
      if (error) state.contractErrors.push(`request ${schemaName}: ${error}`);
      return error;
    };

    if (method === "POST" && path === "/v1/auth/guest") {
      state.guestCalls++;
      if (checkBody("GuestSessionDto")) {
        return sendProblem(res, problem(400, "validation", "Bad Request", "invalid device"));
      }
      return send(res, 201, issueSession(), "SessionResponse");
    }
    if (method === "POST" && path === "/v1/auth/refresh") {
      state.refreshCalls++;
      if (checkBody("RefreshTokenDto")) {
        return sendProblem(res, problem(400, "validation", "Bad Request", "invalid body"));
      }
      if (state.refreshDown === "network") return res.socket.destroy(); // the connection drops
      if (state.refreshDown === "server") {
        return sendProblem(res, problem(503, "server-busy", "Service Unavailable", "Try again shortly."));
      }
      if (state.failRefresh || body.refreshToken !== state.validRefresh) {
        return sendProblem(res, problem(401, "refresh-invalid", "Unauthorized", "Log in again."));
      }
      return send(res, 200, issueSession(), "SessionResponse");
    }
    if (method === "GET" && path === "/v1/home") {
      if (state.catalogFails) {
        return sendProblem(res, problem(503, "unavailable", "Service Unavailable", "Try again soon."));
      }
      // Staging really sends badge: null although the published schema forbids it, so this
      // switch skips response validation on purpose to prove the app tolerates it.
      const nullBadges = (rails) =>
        rails.map((rail) => ({ ...rail, items: rail.items.map((item) => ({ ...item, badge: null })) }));
      const homeBody = {
          rails: [
            { key: "hero", style: "hero", titles: { en: "Featured" }, items: [card("aaa1", "Hero One", "new"), card("aaa2", "Hero Two")], numbered: false, nextCursor: null },
            { key: "trending", style: "standard", titles: { en: "Trending" }, items: [card("bbb1", "Trending One")], numbered: true, nextCursor: null },
            { key: "new", style: "standard", titles: { en: "New" }, items: [card("ccc1", "New One", "new")], numbered: false, nextCursor: null },
            { key: "more", style: "standard", titles: { en: "More" }, items: [card("ddd1", "More One")], numbered: false, nextCursor: null },
            { key: "extra", style: "standard", titles: { en: "Extra" }, items: [card("eee1", "Extra One")], numbered: false, nextCursor: null },
          ],
        };
      if (state.nullBadges) {
        return send(res, 200, { rails: nullBadges(homeBody.rails) }, undefined);
      }
      return send(res, 200, homeBody, "HomeResponse");
    }
    // ---- phone login (the number picks the scenario) ----
    const member = (status = "active") => ({ ...user, kind: "member", loginMethods: ["phone"], phone: state.phone, status });
    if (method === "POST" && path === "/v1/auth/otp") {
      if (checkBody("RequestOtpDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      state.otpsSent.push(body);
      if (body.phone === "+919000000009") {
        return sendProblem(res, { ...problem(429, "otp-rate-limited", "Too Many Requests", "Wait."), retryAfter: 60 });
      }
      return send(res, 202, { expiresIn: 300 }, "OtpSentResponse");
    }
    if (method === "POST" && path === "/v1/auth/verify") {
      if (checkBody("VerifyOtpDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      const bearer = (headers.authorization ?? "").replace(/^Bearer /, "");
      if (bearer && !state.validAccess.has(bearer)) {
        return sendProblem(res, problem(401, "unauthenticated", "Unauthorized", "Token expired."));
      }
      if (body.code !== "123456") return sendProblem(res, problem(400, "otp-invalid", "Bad Request", "Wrong code."));
      state.phone = body.phone;
      state.verifiedWithGuest.push(bearer || null);
      if (body.phone === "+919000000002") {
        return sendProblem(res, {
          ...problem(409, "device-limit", "Conflict", "Too many devices."),
          ticket: "ticket-device-limit-00000001",
          devices: [{ id: "22222222-2222-2222-2222-222222222222", platform: "android", model: "Pixel 8" }],
        });
      }
      if (body.phone === "+919000000003") {
        return sendProblem(res, { ...problem(409, "recycled-number-check", "Conflict", "Check."), ticket: "ticket-recycled-00000000001" });
      }
      return send(res, 200, issueSession(member(body.phone === "+919000000004" ? "onboarding" : "active")), "SessionResponse");
    }
    // ---- email login ----
    if (method === "POST" && path === "/v1/auth/email/code") {
      if (checkBody("RequestEmailCodeDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      state.emailCodes.push(body);
      return send(res, 202, { expiresIn: 300 }, "OtpSentResponse");
    }
    if (method === "POST" && (path === "/v1/auth/email/verify" || path === "/v1/auth/email/login")) {
      const dto = path.endsWith("verify") ? "VerifyEmailDto" : "EmailLoginDto";
      if (checkBody(dto)) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      const bearer = (headers.authorization ?? "").replace(/^Bearer /, "");
      if (bearer && !state.validAccess.has(bearer)) return sendProblem(res, problem(401, "unauthenticated", "Unauthorized", "Token expired."));
      if (path.endsWith("verify")) {
        if (body.code !== "123456") return sendProblem(res, problem(400, "otp-invalid", "Bad Request", "Wrong code."));
        state.emailAccounts.set(body.email, body.password);
      } else {
        if (state.emailLocked) return sendProblem(res, problem(429, "login-locked", "Too Many Requests", "Too many tries."));
        if (state.emailAccounts.get(body.email) !== body.password) {
          return sendProblem(res, problem(400, "credentials-invalid", "Bad Request", "Wrong email or password."));
        }
      }
      state.emailLogins.push({ path, bearer: bearer || null, email: body.email });
      return send(res, 200, issueSession({ ...user, kind: "member", loginMethods: ["email"], email: body.email }), "SessionResponse");
    }
    if (method === "POST" && path === "/v1/auth/device-limit/resolve") {
      if (checkBody("ResolveDeviceLimitDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      if (body.ticket !== "ticket-device-limit-00000001") return sendProblem(res, problem(400, "device-limit-ticket-invalid", "Bad Request", "Log in again."));
      state.signedOut.push(body.signOutDeviceId);
      return send(res, 200, issueSession(member()), "SessionResponse");
    }
    if (method === "POST" && path === "/v1/auth/recycled-number") {
      if (checkBody("AnswerRecycledNumberDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      state.recycledAnswers.push(body.usedBefore);
      return send(res, 200, issueSession(member()), "SessionResponse");
    }
    if (method === "POST" && path === "/v1/auth/logout") {
      if (checkBody("RefreshTokenDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      if (state.logoutDown) return res.socket.destroy(); // offline
      state.loggedOut.push(body.refreshToken);
      return send(res, 204, undefined);
    }
    if (method === "GET" && path === "/v1/me/consents") {
      if (needsAuth()) return;
      const last = state.consents.at(-1);
      const notice = { id: "33333333-3333-3333-3333-333333333333", version: state.noticeVersion, language: "en", url: "https://site.test/privacy" };
      const upToDate = state.consentedVersion === state.noticeVersion;
      return send(res, 200, { choices: last ? { recommendations: last.recommendations, analytics: last.analytics, marketing: last.marketing } : null, upToDate, notice }, "ConsentsResponse");
    }
    if (method === "PUT" && path === "/v1/me/age") {
      if (needsAuth()) return;
      if (checkBody("SetAgeDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      if (state.ageAlreadySet) return sendProblem(res, problem(409, "age-already-set", "Conflict", "Already set."));
      if (state.ageTooYoung) return sendProblem(res, { ...problem(403, "age-below-minimum", "Forbidden", "Too young."), minimumAge: 18 });
      state.ages.push(body);
      return send(res, 204, undefined);
    }
    if (method === "POST" && path === "/v1/me/consents") {
      if (needsAuth()) return;
      if (state.consentDown) return res.socket.destroy();
      if (checkBody("RecordConsentDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      state.consents.push(body);
      state.consentedVersion = state.noticeVersion;
      return send(res, 201, { choices: { recommendations: body.recommendations, analytics: body.analytics, marketing: body.marketing }, upToDate: true, notice: { id: body.noticeId, version: 2, language: "en", url: "https://site.test/privacy" } }, "ConsentsResponse");
    }
    // ---- series page, My List, search ----
    let m2 = path.match(/^\/v1\/series\/([a-z0-9]+)\/similar$/);
    if (method === "GET" && m2) {
      return send(res, 200, [card("sim1", "Similar One"), card("sim2", "Similar Two")], undefined);
    }
    m2 = path.match(/^\/v1\/me\/series\/([a-z0-9]+)$/);
    if (method === "GET" && m2) {
      if (needsAuth()) return;
      if (state.mySeriesDown) return sendProblem(res, problem(403, "guest-not-allowed", "Forbidden", "Log in."));
      const unlocked = [...state.unlocked].sort((a, b) => a - b);
      return send(res, 200, {
        following: state.followed.has(m2[1]),
        likedEpisodes: [...state.liked].sort((a, b) => a - b),
        progress: [{ episode: 1, position: 60, duration: 61, watched: true }, { episode: 2, position: 5, duration: 62, watched: false }],
        unlockedEpisodes: unlocked,
        seriesUnlock: state.unlocked.has(2) ? null : { coins: state.price, episodes: [2] },
        autoUnlock: state.autoUnlock,
        vipIncluded: false,
        adUnlock: null,
      }, "MySeriesResponse");
    }
    m2 = path.match(/^\/v1\/me\/list\/([a-z0-9]+)$/);
    if (m2 && (method === "PUT" || method === "DELETE")) {
      if (needsAuth()) return;
      if (method === "PUT") {
        if (state.listFull) return sendProblem(res, problem(409, "list-full", "Conflict", "Your list is full."));
        state.followed.add(m2[1]);
      } else {
        state.followed.delete(m2[1]);
      }
      return send(res, 204, undefined);
    }
    if (method === "GET" && path === "/v1/me/list") {
      if (needsAuth()) return;
      state.listSorts.push(url.searchParams.get("sort"));
      const items = [...state.followed].map((id, i) => ({
        availability: id === "gone" ? "removed" : "available",
        followedAt: "2026-01-01T00:00:00.000Z",
        newEpisodes: i === 0,
        shortId: id,
        title: `Title ${id}`,
        poster: art(`${id}-poster`),
        card: id === "gone" ? null : card(id, `Title ${id}`),
      }));
      return send(res, 200, { items, nextCursor: null, count: items.length, limit: 500 }, "MyListPageResponse");
    }
    if (method === "GET" && path === "/v1/search/suggestions") {
      return send(res, 200, { series: [card("sug1", "Suggested")], tropes: [{ slug: "revenge", kind: "trope", names: { en: "Revenge", hi: "बदला" } }] }, "SearchSuggestionsResponse");
    }
    if (method === "GET" && path === "/v1/search") {
      const q = url.searchParams.get("q");
      state.searches.push(q);
      if (q === "nothing") return send(res, 200, { items: [], nextCursor: null }, "SeriesCardPage");
      if (url.searchParams.get("cursor") === "s2") return send(res, 200, { items: [card("res3", "Result Three")], nextCursor: null }, "SeriesCardPage");
      return send(res, 200, { items: [card("res1", "Result One"), card("res2", "Result Two")], nextCursor: "s2" }, "SeriesCardPage");
    }
    // ---- progress batches, PIN, streams ----
    if (method === "POST" && path === "/v1/me/progress") {
      if (needsAuth()) return;
      if (state.progressDown) return res.socket.destroy();
      if (checkBody("ProgressBatchDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      if (state.progressRefused) return sendProblem(res, problem(400, "validation", "Bad Request", "refused"));
      state.progressBatches.push(body.items);
      return send(res, 204, undefined);
    }
    if (path === "/v1/me/pin" && ["GET", "PUT", "DELETE"].includes(method)) {
      if (needsAuth()) return;
      if (method === "GET") return send(res, 200, state.pin, "PinStateResponse");
      if (checkBody(method === "PUT" ? "SetPinDto" : "StepUpCodeDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      if (body.code !== "654321") return sendProblem(res, problem(400, "otp-invalid", "Bad Request", "Wrong code."));
      if (method === "PUT") {
        state.pinSets.push(body);
        state.pin = { protectFrom: body.protectFrom, on: true, lockedUntil: null };
        return send(res, 200, state.pin, "PinStateResponse");
      }
      state.pin = { protectFrom: null, on: false, lockedUntil: null };
      return send(res, 204, undefined);
    }
    if (method === "POST" && path === "/v1/me/pin/verify") {
      if (needsAuth()) return;
      if (checkBody("VerifyPinDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      if (body.pin === "0000") return sendProblem(res, { ...problem(429, "pin-locked", "Too Many Requests", "Locked."), lockedUntil: "2026-01-01T00:00:00.000Z" });
      if (body.pin !== "1234") return sendProblem(res, { ...problem(400, "pin-invalid", "Bad Request", "Wrong PIN."), attemptsLeft: 2 });
      return send(res, 200, { token: "pin-token-1", expiresIn: 14400 }, "PinTokenResponse");
    }
    if (method === "GET" && path === "/v1/me/streams") {
      if (needsAuth()) return;
      return send(res, 200, { items: [...state.streams] }, "StreamsResponse");
    }
    m2 = path.match(/^\/v1\/me\/streams\/([\w-]+)$/);
    if (method === "DELETE" && m2) {
      if (needsAuth()) return;
      state.streams = state.streams.filter((x) => x.id !== m2[1]);
      state.streamsStopped.push(m2[1]);
      return send(res, 204, undefined);
    }
    // ---- money: wallet, unlock, undo, auto-unlock, check-in ----
    const guestMoney = () => {
      if (!state.guestMoney) return false;
      sendProblem(res, problem(403, "guest-not-allowed", "Forbidden", "Log in to do this."));
      return true;
    };
    const walletBody = () => ({
      purchased: state.wallet.purchased,
      promo: state.wallet.promo,
      total: state.wallet.purchased + state.wallet.promo,
      promoByExpiry: state.wallet.promo > 0 ? [{ coins: state.wallet.promo, expiresOn: "2026-12-31" }] : [],
      debt: state.wallet.debt,
    });
    const balanceBody = () => ({ spendable: state.wallet.purchased + state.wallet.promo, debt: state.wallet.debt });
    if (method === "GET" && path === "/v1/me/wallet") {
      if (needsAuth() || guestMoney()) return;
      return send(res, 200, walletBody(), "WalletResponse");
    }
    if (method === "GET" && path === "/v1/me/wallet/history") {
      if (needsAuth() || guestMoney()) return;
      if (url.searchParams.get("cursor") === "h2") {
        return send(res, 200, { items: [{ id: "e3", at: "2026-01-01T00:00:00.000Z", type: "purchase", coins: 100, debt: 0, source: "google" }], nextCursor: null }, "WalletHistoryResponse");
      }
      return send(res, 200, { items: [{ id: "e1", at: "2026-01-03T00:00:00.000Z", type: "unlock", coins: -5, debt: 0, source: null }, { id: "e2", at: "2026-01-02T00:00:00.000Z", type: "bonus", coins: 2, debt: 0, source: "check-in" }], nextCursor: "h2" }, "WalletHistoryResponse");
    }
    if (method === "POST" && (path === "/v1/unlocks" || /^\/v1\/unlocks\/[\w-]+\/undo$/.test(path))) {
      if (needsAuth() || guestMoney()) return;
      const key = headers["idempotency-key"];
      if (!key) return sendProblem(res, problem(400, "idempotency-key-required", "Bad Request", "Send an Idempotency-Key."));
      state.unlockKeys.push(key);
      if (state.idem.has(key)) return send(res, 200, state.idem.get(key).body, state.idem.get(key).schema);
      let out;
      if (path === "/v1/unlocks") {
        if (checkBody("UnlockDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
        if (body.expectedCoins !== state.price) {
          return sendProblem(res, { ...problem(409, "price-changed", "Conflict", "The price changed."), coins: state.price });
        }
        if (state.wallet.debt > 0) return sendProblem(res, problem(409, "wallet-in-debt", "Conflict", "Settle your balance due first."));
        const wanted = body.episode === undefined ? [2] : [body.episode];
        const need = wanted.filter((n) => !state.unlocked.has(n));
        if (need.length === 0) {
          out = { body: { status: "already-yours", episodes: wanted, coins: 0, balance: balanceBody() }, schema: "UnlockResponse" };
        } else {
          if (state.wallet.purchased + state.wallet.promo < state.price) return sendProblem(res, problem(402, "insufficient-coins", "Payment Required", "Not enough coins."));
          state.wallet.promo >= state.price ? (state.wallet.promo -= state.price) : ((state.wallet.purchased -= state.price - state.wallet.promo), (state.wallet.promo = 0));
          need.forEach((n) => state.unlocked.add(n));
          state.charges.push({ key, coins: state.price, episodes: need });
          out = { body: { status: "unlocked", episodes: need, coins: state.price, balance: balanceBody() }, schema: "UnlockResponse" };
        }
      } else {
        if (state.undoUnavailable) return sendProblem(res, problem(409, "unlock-undo-unavailable", "Conflict", "Too late to undo."));
        state.wallet.purchased += state.autoUnlocked?.coins ?? 0;
        state.unlocked.delete(state.autoUnlocked?.episode);
        state.undone.push(path);
        out = { body: { coins: state.autoUnlocked?.coins ?? 0, balance: balanceBody() }, schema: "UndoResponse" };
      }
      state.idem.set(key, out);
      return send(res, 200, out.body, out.schema);
    }
    m2 = path.match(/^\/v1\/me\/auto-unlock\/([a-z0-9]+)$/);
    if (m2 && (method === "PUT" || method === "DELETE")) {
      if (needsAuth() || guestMoney()) return;
      state.autoUnlock = method === "PUT";
      return send(res, 204, undefined);
    }
    if (method === "GET" && path === "/v1/me/rewards") {
      if (needsAuth() || guestMoney()) return;
      return send(res, 200, { checkIn: state.checkIn }, "RewardsResponse");
    }
    if (method === "POST" && path === "/v1/me/checkins") {
      if (needsAuth() || guestMoney()) return;
      const key = headers["idempotency-key"];
      if (!key) return sendProblem(res, problem(400, "idempotency-key-required", "Bad Request", "Send an Idempotency-Key."));
      state.checkinKeys.push(key);
      if (state.idem.has(key)) return send(res, 201, state.idem.get(key).body, "ClaimResponse");
      if (state.checkIn.claimedToday) return sendProblem(res, problem(409, "checkin-already-claimed", "Conflict", "Already claimed today."));
      const coins = state.checkIn.nextCoins;
      state.wallet.promo += coins;
      state.checkIn = { ...state.checkIn, claimedToday: true, canClaim: false };
      const body = { day: "2026-01-01", step: 1, coins, toBalanceDue: 0, halved: false, balance: balanceBody(), expiresOn: "2026-02-01" };
      state.idem.set(key, { body });
      return send(res, 201, body, "ClaimResponse");
    }
    // ---- account: profile, devices, step-up, deletion ----
    if (path === "/v1/me" && (method === "GET" || method === "PATCH")) {
      if (needsAuth()) return;
      if (method === "PATCH") {
        if (checkBody("UpdateProfileDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
        if (body.appLanguage && !["hi", "en"].includes(body.appLanguage)) {
          return sendProblem(res, problem(400, "language-unavailable", "Bad Request", "That language is not on."));
        }
        state.profileChanges.push(body);
        state.me = { ...state.me, ...body };
      }
      return send(res, 200, state.me, "MeResponse");
    }
    if (method === "GET" && path === "/v1/me/devices") {
      if (needsAuth()) return;
      return send(res, 200, state.devices, undefined);
    }
    m2 = path.match(/^\/v1\/me\/devices\/([\w-]+)$/);
    if (method === "DELETE" && m2) {
      if (needsAuth()) return;
      state.devices = state.devices.filter((d) => d.id !== m2[1]);
      state.devicesSignedOut.push(m2[1]);
      return send(res, 204, undefined);
    }
    // ---- change phone, login methods ----
    if (method === "POST" && path === "/v1/me/phone") {
      if (needsAuth()) return;
      if (checkBody("ChangePhoneDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      if (body.phone === "+919000000077") return sendProblem(res, problem(409, "phone-in-use", "Conflict", "Another account has this number."));
      state.phoneChangesStarted.push(body.phone);
      return send(res, 202, { expiresIn: 300 }, "OtpSentResponse");
    }
    if (method === "POST" && path === "/v1/me/phone/verify") {
      if (needsAuth()) return;
      if (checkBody("VerifyPhoneChangeDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      const hasPhone = Boolean(state.me.phone);
      if (body.newCode !== "222222" || (hasPhone && body.oldCode !== "111111")) {
        return sendProblem(res, problem(400, "otp-invalid", "Bad Request", "Wrong code."));
      }
      state.phoneChanges.push(body);
      state.me = { ...state.me, phone: body.phone, loginMethods: [...new Set([...state.me.loginMethods, "phone"])] };
      return send(res, 200, state.me, "MeResponse");
    }
    if (method === "POST" && path === "/v1/me/login-methods/email") {
      if (needsAuth()) return;
      if (checkBody("AddEmailMethodDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      if (body.code !== "123456") return sendProblem(res, problem(400, "otp-invalid", "Bad Request", "Wrong code."));
      if (body.email === "taken@example.com") return sendProblem(res, problem(409, "login-method-in-use", "Conflict", "Another account has it."));
      state.me = { ...state.me, email: body.email, loginMethods: [...new Set([...state.me.loginMethods, "email"])] };
      return send(res, 200, state.me, "MeResponse");
    }
    m2 = path.match(/^\/v1\/me\/login-methods\/(phone|email|google|apple)$/);
    if (method === "DELETE" && m2) {
      if (needsAuth()) return;
      if (checkBody("StepUpCodeDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      if (body.code !== "654321") return sendProblem(res, problem(400, "otp-invalid", "Bad Request", "Wrong code."));
      if (state.me.loginMethods.length <= 1) return sendProblem(res, problem(409, "last-login-method", "Conflict", "Keep at least one."));
      state.me = { ...state.me, loginMethods: state.me.loginMethods.filter((x) => x !== m2[1]) };
      return send(res, 200, state.me, "MeResponse");
    }
    if (method === "POST" && path === "/v1/me/step-up") {
      if (needsAuth()) return;
      if (state.stepUpUnavailable) return sendProblem(res, problem(409, "step-up-unavailable", "Conflict", "Add a phone or email first."));
      state.stepUpsSent++;
      return send(res, 202, { expiresIn: 300 }, "OtpSentResponse");
    }
    if (path === "/v1/me/deletion" && (method === "POST" || method === "DELETE")) {
      if (needsAuth()) return;
      if (method === "POST") {
        if (checkBody("StepUpCodeDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
        if (body.code !== "654321") return sendProblem(res, problem(400, "otp-invalid", "Bad Request", "Wrong code."));
        state.me = { ...state.me, status: "deletion_pending", deletionScheduledFor: "2026-12-17T00:00:00.000Z" };
      } else {
        state.me = { ...state.me, status: "active", deletionScheduledFor: null };
      }
      return send(res, 200, state.me, "MeResponse");
    }
    m2 = path.match(/^\/v1\/me\/likes\/([a-z0-9]+)\/(\d+)$/);
    if (m2 && (method === "PUT" || method === "DELETE")) {
      if (needsAuth()) return;
      if (state.likeDown) return res.socket.destroy();
      const number = Number(m2[2]);
      if (method === "PUT") state.liked.add(number);
      else state.liked.delete(number);
      state.likeCalls.push([method, m2[1], number]);
      return send(res, 204, undefined);
    }
    if (method === "POST" && path === "/v1/events") {
      if (needsAuth()) return;
      if (state.eventsDown) return sendProblem(res, problem(503, "server-busy", "Service Unavailable", "Busy."));
      if (checkBody("PostEventsDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      state.eventBatches.push(body.events);
      return res.writeHead(202, { "content-type": "application/json" }), res.end(JSON.stringify({ received: body.events.length, rejected: [] }));
    }
    // ---- history, continue watching, preferences (BE-66) ----
    if (method === "GET" && path === "/v1/me/history") {
      if (needsAuth()) return;
      if (url.searchParams.get("cursor") === "hc2") {
        return send(res, 200, { items: [state.historyItem("old1", 1)], nextCursor: null }, "HistoryPageResponse");
      }
      const items = state.history.map(([id, ep]) => state.historyItem(id, ep));
      return send(res, 200, { items, nextCursor: state.history.length ? "hc2" : null }, "HistoryPageResponse");
    }
    if (method === "DELETE" && path === "/v1/me/history") {
      if (needsAuth()) return;
      state.history = [];
      state.continuing = [];
      return send(res, 204, undefined);
    }
    m2 = path.match(/^\/v1\/me\/history\/([a-z0-9]+)$/);
    if (method === "DELETE" && m2) {
      if (needsAuth()) return;
      state.history = state.history.filter(([id]) => id !== m2[1]);
      return send(res, 204, undefined);
    }
    if (method === "GET" && path === "/v1/me/continue-watching") {
      if (needsAuth()) return;
      const items = state.continuing.map(([id, ep, position]) => ({
        card: card(id, `Title ${id}`), episode: ep, position, duration: position ? 120 : null,
        newEpisode: position === 0, lastWatchedAt: "2026-01-02T00:00:00.000Z",
      }));
      return send(res, 200, { items }, "ContinueWatchingResponse");
    }
    m2 = path.match(/^\/v1\/me\/continue-watching\/([a-z0-9]+)$/);
    if (method === "DELETE" && m2) {
      if (needsAuth()) return;
      state.continuing = state.continuing.filter(([id]) => id !== m2[1]);
      return send(res, 204, undefined);
    }
    if (path === "/v1/me/preferences" && (method === "GET" || method === "PATCH")) {
      if (needsAuth()) return;
      if (method === "PATCH") {
        if (checkBody("UpdatePreferencesDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
        if (body.historyPaused !== undefined) state.historyPaused = body.historyPaused;
      }
      return send(res, 200, { historyPaused: state.historyPaused }, "PreferencesResponse");
    }
    // ---- help, legal (public), shares, tickets, reports, privacy, notifications ----
    if (method === "GET" && path === "/v1/help/articles") {
      const language = url.searchParams.get("language") ?? "en";
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const items = [
        { slug: "how-coins-work", category: "coins", title: language === "hi" ? "कॉइन" : "How coins work", language },
        { slug: "parental-lock", category: "ratings", title: "The parental lock", language: "en" },
      ].filter((i) => !q || i.title.toLowerCase().includes(q));
      return send(res, 200, { items }, "HelpArticlesResponse");
    }
    m2 = path.match(/^\/v1\/help\/articles\/([a-z0-9-]+)$/);
    if (method === "GET" && m2) {
      if (m2[1] !== "how-coins-work") return sendProblem(res, problem(404, "help-article-not-found", "Not Found", "No such article."));
      return send(res, 200, { slug: m2[1], category: "coins", title: "How coins work", language: "en", body: "Coins you buy **never expire**.", updatedAt: "2026-11-17T00:00:00.000Z" }, "HelpArticleResponse");
    }
    m2 = path.match(/^\/v1\/legal\/([a-z_]+)$/);
    if (method === "GET" && m2) {
      if (m2[1] === "company") return sendProblem(res, problem(404, "legal-document-not-found", "Not Found", "Not published."));
      return send(res, 200, { kind: m2[1], version: 2, language: "en", url: `https://site.test/legal/${m2[1]}/v2`, publishedAt: "2026-11-13T00:00:00.000Z" }, "LegalDocumentResponse");
    }
    if (method === "POST" && path === "/v1/shares") {
      if (needsAuth()) return;
      if (checkBody("CreateShareDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      if (body.series === "zzzz9") return sendProblem(res, problem(404, "series-not-found", "Not Found", "No such series."));
      state.shares.push(body);
      const canonicalUrl = `https://site.test/hi/series/title-${body.series}${body.episode ? `/episode-${body.episode}` : ""}`;
      return send(res, 201, { code: "Ab3dE5gH9k", url: `${canonicalUrl}?s=Ab3dE5gH9k`, canonicalUrl }, "ShareResponse");
    }
    const ticketOf = (t) => ({ id: t.id, number: t.number, kind: t.kind, category: t.category, status: t.status, receivedAt: "2026-11-17T00:00:00.000Z",
      acknowledgeBy: t.kind === "grievance" ? "2026-11-18T00:00:00.000Z" : null, decideBy: t.kind === "grievance" ? "2026-12-02T00:00:00.000Z" : null });
    if (method === "POST" && (path === "/v1/tickets" || path === "/v1/reports")) {
      if (needsAuth()) return;
      const dto = path === "/v1/tickets" ? "CreateTicketDto" : "CreateReportDto";
      if (checkBody(dto)) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      if (!body.email && !state.accountEmail) return sendProblem(res, problem(400, "contact-email-required", "Bad Request", "Give an email."));
      const kind = path === "/v1/tickets" ? body.kind : ["video_sound", "subtitles_accessibility"].includes(body.category) ? "support" : "grievance";
      const t = { id: `00000000-0000-4000-8000-${String(state.tickets.length + 1).padStart(12, "0")}`, number: 100001 + state.tickets.length, kind, category: body.category, status: "received", message: body.message ?? "", events: [{ kind: "created", by: "viewer", body: null, at: "2026-11-17T00:00:00.000Z" }] };
      state.tickets.push(t);
      return send(res, 201, ticketOf(t), "TicketResponse");
    }
    if (method === "GET" && path === "/v1/me/tickets") {
      if (needsAuth()) return;
      return send(res, 200, { items: [...state.tickets].reverse().map(ticketOf) }, "TicketsResponse");
    }
    m2 = path.match(/^\/v1\/me\/tickets\/([\w-]+)(\/messages)?$/);
    if (m2 && (method === "GET" || (method === "POST" && m2[2]))) {
      if (needsAuth()) return;
      const t = state.tickets.find((x) => x.id === m2[1]);
      if (!t) return sendProblem(res, problem(404, "ticket-not-found", "Not Found", "No such ticket."));
      if (method === "POST") {
        if (checkBody("TicketMessageDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
        if (t.status === "closed") return sendProblem(res, problem(409, "ticket-closed", "Conflict", "Closed."));
        t.events.push({ kind: "reply", by: "viewer", body: body.message, at: "2026-11-17T01:00:00.000Z" });
      }
      const decided = t.status === "decided" || t.status === "closed";
      return send(res, method === "POST" ? 201 : 200, { ...ticketOf(t), message: t.message, series: null, episode: null, decision: t.decision ?? null, decidedAt: decided ? "2026-11-20T00:00:00.000Z" : null,
        appealUrl: t.kind === "grievance" && decided ? "https://www.dpcgc.org/" : null, events: t.events }, "TicketDetailResponse");
    }
    if (method === "GET" && path === "/v1/me/privacy") {
      if (needsAuth()) return;
      return send(res, 200, {
        consent: { choices: { recommendations: true, analytics: false, marketing: false }, noticeVersion: 1, givenAt: "2026-11-13T00:00:00.000Z" },
        data: { phone: "+919000000001", email: null, displayName: "Asha", ageGiven: true, devices: 2, follows: 3, likes: 4, historySeries: 5, unlocks: 6, coins: 7, coinsOwed: 0, shares: 1 },
        processors: [{ name: "Bunny.net", purpose: "Delivering the videos you watch", data: "Your network address" }],
        requests: state.privacyRequests, nominees: state.nominees, responseDays: 30,
      }, "PrivacyResponse");
    }
    if (method === "POST" && path === "/v1/me/privacy/requests") {
      if (needsAuth()) return;
      if (checkBody("PrivacyRequestDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      if (body.code !== "654321") return sendProblem(res, problem(400, "otp-invalid", "Bad Request", "Wrong code."));
      const r = { id: "11111111-2222-4333-8444-555555555555", kind: body.kind, status: "open", createdAt: "2026-11-17T00:00:00.000Z", dueBy: "2026-12-17T00:00:00.000Z", outcome: null };
      state.privacyRequests.unshift(r);
      return send(res, 201, r, "PrivacyRequestResponse");
    }
    if (method === "PUT" && path === "/v1/me/nominees") {
      if (needsAuth()) return;
      if (checkBody("SetNomineesDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      if (body.code !== "654321") return sendProblem(res, problem(400, "otp-invalid", "Bad Request", "Wrong code."));
      state.nominees = body.nominees;
      return send(res, 200, state.nominees, undefined);
    }
    if (path === "/v1/me/notification-preferences" && (method === "GET" || method === "PATCH")) {
      if (needsAuth()) return;
      if (method === "PATCH") {
        if (checkBody("UpdateNotificationPreferencesDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
        const marketingOn = ["continueWatching", "coinsExpiring", "checkinReminder"].some((k) => body[k] === true);
        if (marketingOn && !state.marketingConsent) return sendProblem(res, problem(409, "marketing-consent-required", "Conflict", "Allow offers first."));
        Object.assign(state.notif, body);
      }
      return send(res, 200, { ...state.notif, marketingConsent: state.marketingConsent }, "NotificationPreferencesResponse");
    }
    if (method === "PUT" && path === "/v1/me/push-tokens") {
      if (needsAuth()) return;
      if (checkBody("RegisterPushTokenDto")) return sendProblem(res, problem(400, "validation", "Bad Request", "invalid"));
      state.pushTokens.push(body);
      return send(res, 204, undefined);
    }
    let railMatch = path.match(/^\/v1\/rails\/([a-z-]+)$/);
    if (method === "GET" && railMatch) {
      const key = railMatch[1];
      if (key === "missing") return sendProblem(res, problem(404, "rail-not-found", "Not Found", "No such rail."));
      const cursor = url.searchParams.get("cursor");
      if (cursor === "r2") return send(res, 200, { items: [card(`${key}3`, "Rail Three")], nextCursor: null }, "SeriesCardPage");
      return send(res, 200, { items: [card(`${key}1`, "Rail One"), card(`${key}2`, "Rail Two")], nextCursor: "r2" }, "SeriesCardPage");
    }
    if (method === "GET" && path === "/v1/browse") {
      const cursor = url.searchParams.get("cursor");
      if (cursor === "b2") return send(res, 200, { items: [card("brw3", "Browse Three")], nextCursor: null }, "SeriesCardPage");
      return send(res, 200, { items: [card("brw1", "Browse One"), card("brw2", "Browse Two")], nextCursor: "b2" }, "SeriesCardPage");
    }
    if (method === "GET" && path === "/v1/feed") {
      if (needsAuth()) return;
      if (state.feedDown) return res.socket.destroy(); // the connection drops mid-request
      if (url.searchParams.get("cursor") === "page2") {
        return send(res, 200, { items: [{ ...card("fff3", "Feed Three"), tags: [] }], nextCursor: null }, "FeedPageResponse");
      }
      return send(
        res,
        200,
        {
          items: [
            { ...card("fff1", "Feed One"), tags: ["romance"] },
            { ...card("fff2", "Feed Two"), tags: [] },
          ],
          nextCursor: "page2",
        },
        "FeedPageResponse",
      );
    }
    let match = path.match(/^\/v1\/series\/([a-z0-9]+)$/);
    if (method === "GET" && match) {
      return send(
        res,
        200,
        {
          shortId: match[1],
          language: "ta",
          title: "Tamil Version",
          synopsis: "A story.",
          slug: "tamil-version",
          rating: "UA13",
          descriptors: [],
          advisory: null,
          releaseState: "ongoing",
          scheduleText: null,
          year: 2026,
          freeEpisodes: 1,
          versions: [{ language: "ta", kind: "original", title: "Tamil Version", slug: "tamil-version", episodes: 3 }],
          tags: [],
          cast: [],
          artwork: { cover: null, poster: art("series-poster"), banner: null, share: null },
        },
        "SeriesResponse",
      );
    }
    match = path.match(/^\/v1\/series\/([a-z0-9]+)\/episodes$/);
    if (method === "GET" && match) {
      const cursor = url.searchParams.get("cursor");
      const episode = (number, price) => ({
        number,
        durationSeconds: 60 + number,
        publishedAt: "2026-01-01T00:00:00.000Z",
        price,
        thumbnail: number === 1 ? art("thumb-1") : null,
        languages: ["ta"],
        likes: number * 10,
      });
      if (!cursor) {
        return send(res, 200, { items: [episode(1, { free: true, coins: 0 }), episode(2, { free: false, coins: 5 })], nextCursor: "page2" }, "EpisodePage");
      }
      return send(res, 200, { items: [episode(3, null)], nextCursor: null }, "EpisodePage");
    }
    if (method === "POST" && path === "/v1/playback/sessions") {
      if (needsAuth()) return;
      if (checkBody("CreateSessionDto")) {
        return sendProblem(res, problem(400, "validation", "Bad Request", "invalid body"));
      }
      if (state.playbackProblem) {
        return sendProblem(res, state.playbackProblem);
      }
      return send(
        res,
        201,
        {
          sessionId: "sess-1",
          playlistUrl: "https://cdn.test/sess-1/playlist.m3u8?sig=abc",
          expiresAt: state.sessionExpiresAt ?? new Date(Date.now() + 3600_000).toISOString(),
          qualityCap: 480,
          drm: "widevine",
          rating: "UA13",
          next: { number: 2, playable: true },
          heartbeatSeconds: 15,
          resume: 12,
        },
        "PlaybackSessionResponse",
      );
    }
    match = path.match(/^\/v1\/playback\/sessions\/([^/]+)\/(start|heartbeat|end)$/);
    if (method === "POST" && match) {
      if (needsAuth()) return;
      const [, id, action] = match;
      if (state.heartbeatDown && action !== "start") return res.socket.destroy(); // the connection drops
      if (action === "start" && state.startGoneOnce) {
        state.startGoneOnce = false;
        return sendProblem(res, problem(404, "playback-session-not-found", "Not Found", "No such session."));
      }
      if (action === "start") {
        checkBody("StartSessionDto");
        return send(res, 200, { licenceToken: null, expiresAt: "2026-01-01T01:00:00.000Z", autoUnlocked: state.autoUnlocked ?? null }, "PlaybackStartResponse");
      }
      if (action === "heartbeat") {
        checkBody("HeartbeatDto");
        if (state.heartbeatGone) return sendProblem(res, problem(404, "playback-session-not-found", "Not Found", "No such session."));
        return send(res, 200, { status: state.heartbeatStatus, reason: state.heartbeatStatus === "ok" ? null : "stopped-elsewhere" }, "HeartbeatResponse");
      }
      checkBody("EndSessionDto");
      state.sessionsEnded.push(id);
      return send(res, 204, undefined);
    }
    sendProblem(res, problem(404, "not-found", "Not Found", `${method} ${path}`));
  }

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url, "http://localhost");
      let body;
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = undefined;
        }
      }
      state.log.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body });
      route(req.method, url, req.headers, body, res);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    state,
    calls: (method, path) => state.log.filter((r) => r.method === method && r.path === path),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
