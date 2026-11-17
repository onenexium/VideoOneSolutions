import Constants from "expo-constants";

/** The API only accepts MAJOR.MINOR.PATCH. */
export const APP_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** This build's version if it is one the API accepts, else undefined (then it is not sent). */
export function appVersion(): string | undefined {
  const version = Constants.expoConfig?.version ?? "";
  return APP_VERSION_PATTERN.test(version) ? version : undefined;
}

/** True if `version` is below `minimum`, comparing numerically (1.10.0 is newer than 1.9.0). */
export function isOlderVersion(version: string, minimum: string): boolean {
  const a = version.split(".").map(Number);
  const b = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff < 0;
  }
  return false;
}
