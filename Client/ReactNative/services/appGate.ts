// Whether the app may be used right now: this build is too old (the API answers 426 or the config
// says so), the service is in maintenance, or a newer build is available (a one-time soft prompt).
// A plain store the screen reads; the API client and the config loader write to it.

export interface GateState {
  /** This build is older than the minimum: nothing works until it is updated. */
  updateRequired: boolean;
  /** A newer build exists (its version); null if none or already dismissed. */
  updateAvailable: string | null;
  /** Maintenance is on; the message, or null for the app's own. */
  maintenance: { message: string | null } | null;
  /** Guest mode is off: a guest must log in before using the app. */
  loginRequired: boolean;
  /** The config asks a guest to log in at launch (once per start of the app). */
  loginPromptAtLaunch: boolean;
}

const CLEAN: GateState = {
  updateRequired: false,
  updateAvailable: null,
  maintenance: null,
  loginRequired: false,
  loginPromptAtLaunch: false,
};
let state: GateState = CLEAN;
const listeners = new Set<() => void>();

function set(patch: Partial<GateState>) {
  const next = { ...state, ...patch };
  if (
    next.updateRequired === state.updateRequired &&
    next.updateAvailable === state.updateAvailable &&
    next.maintenance?.message === state.maintenance?.message &&
    Boolean(next.maintenance) === Boolean(state.maintenance) &&
    next.loginRequired === state.loginRequired &&
    next.loginPromptAtLaunch === state.loginPromptAtLaunch
  ) {
    return; // nothing changed: do not wake the screen
  }
  state = next;
  listeners.forEach((listener) => listener());
}

export const getGate = (): GateState => state;

export function subscribeGate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const requireUpdate = () => set({ updateRequired: true });
export const setUpdateAvailable = (version: string | null) => set({ updateAvailable: version });
export const setMaintenance = (maintenance: GateState["maintenance"]) => set({ maintenance });
export const setLoginPolicy = (loginRequired: boolean, loginPromptAtLaunch: boolean) =>
  set({ loginRequired, loginPromptAtLaunch });

/** For tests: back to a clean state. */
export function resetGate() {
  state = CLEAN;
  listeners.forEach((listener) => listener());
}
