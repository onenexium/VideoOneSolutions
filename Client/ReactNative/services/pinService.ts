// The parental PIN. A correct PIN gives a token that lets protected episodes play on this account
// and device for a while; it is kept in memory only and dropped when it expires.

import { api, unwrap } from "./api";
import type { components } from "@/types/api";

let token: { value: string; expiresAt: number } | null = null;

/** Checks the PIN. Throws ApiError: pin-invalid (attemptsLeft), pin-locked (429), pin-not-set (404). */
export async function verifyPin(pin: string): Promise<void> {
  const result = unwrap(await api.POST("/v1/me/pin/verify", { body: { pin } }));
  token = { value: result.token, expiresAt: Date.now() + result.expiresIn * 1000 };
}

/** The token to send with a playback request, or undefined when there is none or it has run out. */
export function getPinToken(now = Date.now()): string | undefined {
  if (token && token.expiresAt > now) return token.value;
  token = null;
  return undefined;
}

/** Forget the PIN (logout, or the app was in the background a long while). */
export function clearPinToken() {
  token = null;
}

// ---- setting up the PIN (needs a step-up code: requestStepUp in accountService) ----

export type PinState = components["schemas"]["PinStateResponse"];
export type PinRating = "UA7" | "UA13" | "UA16" | "A";

export async function getPinState(): Promise<PinState> {
  return unwrap(await api.GET("/v1/me/pin", {}));
}

/** Sets or changes the PIN (also ends a lockout: "forgot PIN"). Needs a fresh step-up code. */
export async function setPin(input: { pin: string; code: string; protectFrom?: PinRating }): Promise<PinState> {
  clearPinToken(); // every earlier PIN token stops working
  // The PIN is asked from this rating up; U/A 13+ unless the viewer chose otherwise.
  return unwrap(await api.PUT("/v1/me/pin", { body: { ...input, protectFrom: input.protectFrom ?? "UA13" } }));
}

/** Removes the PIN. Needs a fresh step-up code. */
export async function removePin(code: string): Promise<void> {
  clearPinToken();
  unwrap(await api.DELETE("/v1/me/pin", { body: { code } }));
}
