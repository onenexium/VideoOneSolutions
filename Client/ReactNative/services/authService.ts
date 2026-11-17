// Logging in with a phone number (deep dive 1): code by SMS, then the session. The steps the API
// can interpose (device limit, a possibly recycled number, onboarding) come back as a value for
// the screen to act on, never as a thrown error the screen must pick apart.

import { api, ApiError, getAccessToken, unwrap } from "./api";
import { clearPinToken } from "./pinService";
import {
  applySession,
  deviceInfo,
  ensureSession,
  getDeviceId,
  getRefreshToken,
  clearSession,
  refreshSession,
  type Viewer,
} from "./session";
import type { components } from "@/types/api";

type SessionResponse = components["schemas"]["SessionResponse"];
type ConsentsResponse = components["schemas"]["ConsentsResponse"];
type Device = Record<string, unknown> & { id: string };

const ERROR = "urn:ott:error:";

/** What a login attempt came to. */
export type LoginStep =
  | { kind: "done"; viewer: Viewer }
  /** At the device limit: the viewer picks one of `devices` to sign out, then `resolveDeviceLimit`. */
  | { kind: "deviceLimit"; ticket: string; devices: Device[] }
  /** The number may have a new owner: ask whether they used it before, then `answerRecycledNumber`. */
  | { kind: "recycledNumber"; ticket: string };

/** A phone number in international form, from what a person types in India: 9812345678 etc. */
export function normalizePhone(input: string, defaultCountry = "+91"): string | null {
  const digits = input.replace(/[\s\-().]/g, "");
  const full = digits.startsWith("+")
    ? digits
    : digits.startsWith("00")
      ? `+${digits.slice(2)}`
      : /^0?\d{10}$/.test(digits)
        ? `${defaultCountry}${digits.replace(/^0/, "")}`
        : digits;
  return /^\+[1-9]\d{7,14}$/.test(full) ? full : null;
}

const DOB = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A real calendar date in the past, as YYYY-MM-DD, or null. */
export function parseBirthDate(value: string, now = new Date()): string | null {
  const m = DOB.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  return real && date.getTime() < now.getTime() && y > 1900 ? value.trim() : null;
}

/** Sends the login code. Resolves with the seconds it stays valid. */
export async function requestOtp(phone: string): Promise<number> {
  const result = unwrap(
    await api.POST("/v1/auth/otp", {
      body: { phone, clientId: await getDeviceId() },
    }),
  );
  return result.expiresIn;
}

async function finish(session: SessionResponse): Promise<LoginStep> {
  await applySession(session);
  return { kind: "done", viewer: session.user };
}

/** Turns the API's two "one more step" answers into a LoginStep; anything else is rethrown. */
function interposed(error: unknown): LoginStep {
  if (error instanceof ApiError) {
    const extra = error.problem as Record<string, unknown>;
    if (error.type === `${ERROR}device-limit` && typeof extra.ticket === "string") {
      return {
        kind: "deviceLimit",
        ticket: extra.ticket,
        devices: Array.isArray(extra.devices) ? (extra.devices as Device[]) : [],
      };
    }
    if (error.type === `${ERROR}recycled-number-check` && typeof extra.ticket === "string") {
      return { kind: "recycledNumber", ticket: extra.ticket };
    }
  }
  throw error;
}

/**
 * A login call that carries the guest session along (its Authorization), so what the guest followed
 * or watched joins the account. An expired guest token is refreshed and the same call tried again
 * (a code is not used up by that 401); if the guest cannot be restored the login goes ahead without
 * it. The API's "one more step" answers come back as a LoginStep.
 */
async function loginWithGuest(
  call: (bearer: string | null) => Promise<{ data?: SessionResponse; error?: unknown; response: Response }>,
): Promise<LoginStep> {
  try {
    if (!getAccessToken()) await ensureSession().catch(() => undefined); // best effort: a guest to merge
    let result = await call(getAccessToken());
    if (result.response.status === 401 && getAccessToken()) {
      const restored = await refreshSession();
      result = await call(restored ? getAccessToken() : null);
    }
    return finish(unwrap(result));
  } catch (error) {
    return interposed(error);
  }
}

const bearerHeader = (bearer: string | null) => ({
  params: { header: { Authorization: bearer ? `Bearer ${bearer}` : undefined } },
});

/** Checks the SMS code and logs in (creating the account on a first login). */
export async function verifyOtp(phone: string, code: string): Promise<LoginStep> {
  const device = await deviceInfo();
  return loginWithGuest((bearer) =>
    api.POST("/v1/auth/verify", { ...bearerHeader(bearer), body: { phone, code, device } }),
  );
}

/** Sends a code to the address, to sign up or to set a new password. Resolves with the seconds it lasts. */
export async function requestEmailCode(email: string): Promise<number> {
  return unwrap(
    await api.POST("/v1/auth/email/code", { body: { email, clientId: await getDeviceId() } }),
  ).expiresIn;
}

/**
 * Proves the address with its code and sets the password: a new account, or a new password for an
 * existing one (which signs its other devices out). Logs in.
 */
export async function verifyEmail(email: string, code: string, password: string): Promise<LoginStep> {
  const device = await deviceInfo();
  return loginWithGuest((bearer) =>
    api.POST("/v1/auth/email/verify", { ...bearerHeader(bearer), body: { email, code, password, device } }),
  );
}

/** Logs in with email and password. A wrong password and an unknown address get the same answer. */
export async function loginWithEmail(email: string, password: string): Promise<LoginStep> {
  const device = await deviceInfo();
  return loginWithGuest((bearer) =>
    api.POST("/v1/auth/email/login", { ...bearerHeader(bearer), body: { email, password, device } }),
  );
}

/** An email address as the API will take it, or null. Trimmed; the API lowercases. */
export function normalizeEmail(input: string): string | null {
  const email = input.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** The password rule for a new password: 10 to 128 characters. */
export const isNewPasswordOk = (password: string) => password.length >= 10 && password.length <= 128;

export async function resolveDeviceLimit(ticket: string, signOutDeviceId: string): Promise<LoginStep> {
  try {
    return await finish(
      unwrap(await api.POST("/v1/auth/device-limit/resolve", { body: { ticket, signOutDeviceId } })),
    );
  } catch (error) {
    return interposed(error);
  }
}

export async function answerRecycledNumber(ticket: string, usedBefore: boolean): Promise<LoginStep> {
  try {
    return await finish(
      unwrap(await api.POST("/v1/auth/recycled-number", { body: { ticket, usedBefore } })),
    );
  } catch (error) {
    return interposed(error);
  }
}

/** A new number is `onboarding` until its date of birth and consent are given. */
export const needsOnboarding = (viewer: Viewer | null) => viewer?.status === "onboarding";

export async function getConsentNotice(language?: string): Promise<ConsentsResponse> {
  return unwrap(await api.GET("/v1/me/consents", { params: { query: { language } } }));
}

/** Date of birth, then the consent choices on the notice shown. `required` is needed to use the app. */
export async function completeOnboarding(input: {
  dateOfBirth: string;
  noticeId: string;
  recommendations: boolean;
  analytics: boolean;
  marketing: boolean;
}): Promise<void> {
  unwrap(await api.PUT("/v1/me/age", { body: { dateOfBirth: input.dateOfBirth } }));
  unwrap(
    await api.POST("/v1/me/consents", {
      body: {
        noticeId: input.noticeId,
        required: true,
        recommendations: input.recommendations,
        analytics: input.analytics,
        marketing: input.marketing,
      },
    }),
  );
}

/** Ends this login on the server, then on the device, and starts a fresh guest. */
export async function logout(): Promise<void> {
  const refreshToken = await getRefreshToken();
  try {
    if (refreshToken) {
      unwrap(await api.POST("/v1/auth/logout", { body: { refreshToken } }));
    }
  } catch {
    // Offline or already ended: the device is signed out either way.
  }
  await clearSession();
  clearPinToken(); // the next person on this phone does not inherit the PIN
  await ensureSession().catch(() => undefined);
}
