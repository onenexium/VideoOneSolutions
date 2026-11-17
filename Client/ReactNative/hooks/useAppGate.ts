import { useSyncExternalStore } from "react";
import { getGate, subscribeGate } from "@/services/appGate";

/** Whether the app is blocked (too old, maintenance) or has an update available. */
export function useAppGate() {
  return useSyncExternalStore(subscribeGate, getGate, getGate);
}
