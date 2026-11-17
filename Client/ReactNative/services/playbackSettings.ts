// Playback choices that live on the phone: the data saver (the API caps the quality at 360p).

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "onenexium_data_saver";
let dataSaver = false;
let loaded: Promise<void> | null = null;

/** Reads the saved choice once. Safe to call often. */
export function loadPlaybackSettings(): Promise<void> {
  loaded ??= AsyncStorage.getItem(KEY)
    .then((value) => {
      dataSaver = value === "1";
    })
    .catch(() => undefined);
  return loaded;
}

export const getDataSaver = () => dataSaver;

export async function setDataSaver(on: boolean) {
  dataSaver = on;
  loaded ??= Promise.resolve();
  await AsyncStorage.setItem(KEY, on ? "1" : "0").catch(() => undefined);
}

/** For tests: forget what was read, as a new start of the app. */
export function forgetPlaybackSettingsInMemory() {
  dataSaver = false;
  loaded = null;
}
