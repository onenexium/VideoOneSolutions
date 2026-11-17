// First launch (deep dive 1, B2, B6, B8): the language, the age confirmation and the consent notice,
// before the app is used. The same consent screen comes back alone when the notice changes
// (the server says `upToDate: false`). Consent is a deliberate tap, never implied.
//
// The state is kept in app storage (not the Keychain: that survives a reinstall, and a reinstall
// should start again). A refusal for age is remembered on the device for 24 hours.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ApiError, unwrap } from "./api";
import { getConsentNotice } from "./authService";
import { updateProfile } from "./accountService";
import type { AppConfig } from "./appConfigService";
import type { components } from "@/types/api";

type Consents = components["schemas"]["ConsentsResponse"];

const DONE_KEY = "onenexium_first_run_done";
const UNDERAGE_KEY = "onenexium_underage_until";
const REFUSAL_MS = 24 * 60 * 60 * 1000;

export type FirstRunState =
  | { status: "unknown" } // not checked yet
  | { status: "done" }
  /** `full`: first launch (language, age, consent). `consent`: only the notice changed. */
  | { status: "needed"; mode: "full" | "consent"; notice: Consents["notice"]; choices: Consents["choices"] }
  /** Under the minimum age: not usable until `until`. */
  | { status: "refused"; until: number };

type Choices = NonNullable<Consents["choices"]>;
let choices: Choices | null = null;

/** The viewer's optional consents as last known (all off until they have chosen). */
export function getConsentChoices(): Choices {
  return choices ?? { recommendations: false, analytics: false, marketing: false };
}

let state: FirstRunState = { status: "unknown" };
const listeners = new Set<() => void>();

function set(next: FirstRunState) {
  state = next;
  listeners.forEach((listener) => listener());
}
export const getFirstRun = () => state;
export function subscribeFirstRun(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The phone's language if the app supports it, else the app's default. */
export function defaultAppLanguage(config: AppConfig, phoneLocale?: string): string {
  const phone = (phoneLocale ?? Intl.DateTimeFormat().resolvedOptions().locale ?? "").slice(0, 2).toLowerCase();
  return config.languages.app.includes(phone) ? phone : config.languages.defaultApp;
}

/**
 * Decides whether the first-run screen must show. Cheap and safe to call at every start: a failure
 * to ask (offline) leaves the app usable and asks again next time, except when a refusal for age is
 * still in force.
 */
export async function checkFirstRun(now = Date.now()): Promise<FirstRunState> {
  const until = Number(await AsyncStorage.getItem(UNDERAGE_KEY).catch(() => null));
  if (until > now) {
    set({ status: "refused", until });
    return state;
  }
  const doneBefore = (await AsyncStorage.getItem(DONE_KEY).catch(() => null)) === "1";
  try {
    const consents = await getConsentNotice();
    choices = consents.choices ?? choices;
    if (doneBefore && consents.upToDate) set({ status: "done" });
    else set({ status: "needed", mode: doneBefore ? "consent" : "full", notice: consents.notice, choices: consents.choices });
  } catch {
    if (state.status === "unknown") set({ status: doneBefore ? "done" : "unknown" });
  }
  return state;
}

export interface FirstRunInput {
  noticeId: string;
  recommendations: boolean;
  analytics: boolean;
  marketing: boolean;
  /** `full` mode only. */
  appLanguage?: string;
  contentLanguages?: string[];
  /** `full` mode only: the viewer confirmed being old enough. */
  olderThanMinimum?: boolean;
}

/** Saves the choices. For a viewer who says they are too young, remembers it for 24 hours. */
export async function completeFirstRun(input: FirstRunInput, now = Date.now()): Promise<FirstRunState> {
  if (input.olderThanMinimum === false) {
    await AsyncStorage.setItem(UNDERAGE_KEY, String(now + REFUSAL_MS)).catch(() => undefined);
    set({ status: "refused", until: now + REFUSAL_MS });
    return state;
  }
  if (input.olderThanMinimum) {
    try {
      unwrap(await api.PUT("/v1/me/age", { body: { confirmedMinimumAge: true } }));
    } catch (error) {
      // An account that gave its date of birth already has this step done.
      if (!(error instanceof ApiError && error.type.endsWith("age-already-set"))) {
        if (error instanceof ApiError && error.type.endsWith("age-below-minimum")) {
          await AsyncStorage.setItem(UNDERAGE_KEY, String(now + REFUSAL_MS)).catch(() => undefined);
          set({ status: "refused", until: now + REFUSAL_MS });
          return state;
        }
        throw error;
      }
    }
  }
  if (input.appLanguage || input.contentLanguages) {
    await updateProfile({
      ...(input.appLanguage ? { appLanguage: input.appLanguage } : {}),
      ...(input.contentLanguages?.length ? { contentLanguages: input.contentLanguages } : {}),
    });
  }
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
  choices = { recommendations: input.recommendations, analytics: input.analytics, marketing: input.marketing };
  await AsyncStorage.setItem(DONE_KEY, "1").catch(() => undefined);
  set({ status: "done" });
  return state;
}

/** For tests: back to not-checked. */
export function resetFirstRun() {
  choices = null;
  set({ status: "unknown" });
}
