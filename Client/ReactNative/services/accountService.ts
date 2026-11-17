// The signed-in account: profile, the devices it is signed in on, and deletion.

import { api, unwrap } from "./api";
import { updateViewer, type Viewer } from "./session";
import type { components } from "@/types/api";

export type Device = components["schemas"]["DeviceResponse"];

export interface ProfileChanges {
  displayName?: string;
  appLanguage?: string;
  contentLanguages?: string[];
}

/** Changes the name or languages. The answer is the viewer as the server now has it. */
export async function updateProfile(changes: ProfileChanges): Promise<Viewer> {
  const viewer = unwrap(await api.PATCH("/v1/me", { body: changes }));
  updateViewer(viewer);
  return viewer;
}

/** Devices this account is signed in on, most recently used first. */
export async function listDevices(): Promise<Device[]> {
  return unwrap(await api.GET("/v1/me/devices", {}));
}

/** Signs a device out; its login stops working at once. */
export async function signOutDevice(id: string): Promise<void> {
  unwrap(await api.DELETE("/v1/me/devices/{id}", { params: { path: { id } } }));
}

/**
 * Sends a code to the phone (else the email) to confirm a sensitive step. Resolves with the seconds
 * it stays valid. 409 step-up-unavailable: the account has neither a phone nor an email.
 */
export async function requestStepUp(): Promise<number> {
  return unwrap(await api.POST("/v1/me/step-up", {})).expiresIn;
}

/** Asks for the account to be deleted (erased after 30 days unless cancelled), with the step-up code. */
export async function requestDeletion(code: string): Promise<Viewer> {
  const viewer = unwrap(await api.POST("/v1/me/deletion", { body: { code } }));
  updateViewer(viewer);
  return viewer;
}

/** Keeps the account: cancels a pending deletion. No code needed. */
export async function cancelDeletion(): Promise<Viewer> {
  const viewer = unwrap(await api.DELETE("/v1/me/deletion", {}));
  updateViewer(viewer);
  return viewer;
}

export type LoginMethod = "phone" | "email" | "google" | "apple";

/**
 * Starts changing the phone number: a code to the current number and one to the new one (an account
 * without a phone gets only the new one's). 409 phone-in-use if another account has the new number.
 */
export async function startPhoneChange(phone: string): Promise<number> {
  return unwrap(await api.POST("/v1/me/phone", { body: { phone } })).expiresIn;
}

/** Finishes the change. `oldCode` only when the account has a number. The other devices are signed out. */
export async function verifyPhoneChange(input: { phone: string; newCode: string; oldCode?: string }): Promise<Viewer> {
  const viewer = unwrap(await api.POST("/v1/me/phone/verify", { body: input }));
  updateViewer(viewer);
  return viewer;
}

/** Adds an email login: the code from `requestEmailCode` (this device) and a password. */
export async function addEmailMethod(input: { email: string; code: string; password: string }): Promise<Viewer> {
  const viewer = unwrap(await api.POST("/v1/me/login-methods/email", { body: input }));
  updateViewer(viewer);
  return viewer;
}

/** Removes a login method with a step-up code (`requestStepUp`). Never the last one. */
export async function removeLoginMethod(method: LoginMethod, code: string): Promise<Viewer> {
  const viewer = unwrap(
    await api.DELETE("/v1/me/login-methods/{method}", { params: { path: { method } }, body: { code } }),
  );
  updateViewer(viewer);
  return viewer;
}
