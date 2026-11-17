import { useSyncExternalStore } from "react";
import { isOffline, subscribeConnectivity } from "@/services/connectivity";

/** True while the API cannot be reached. */
export function useOffline() {
  return useSyncExternalStore(subscribeConnectivity, isOffline, isOffline);
}
