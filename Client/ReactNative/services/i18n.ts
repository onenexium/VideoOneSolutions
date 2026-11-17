// App text in the languages the app speaks (Hindi and English at launch). A screen asks for a key;
// a key a language lacks falls back to English, so a missing translation shows English, never a
// blank or the key. The Hindi below is a first draft for a native speaker to review.

import { useSyncExternalStore } from "react";

const en = {
  "common.retry": "Try again",
  "common.update": "Update",
  "common.notNow": "Not now",
  "common.back": "Back",
  "gate.update.title": "Please update the app",
  "gate.update.body": "This version is no longer supported. Update to keep watching.",
  "gate.maintenance.title": "We will be right back",
  "gate.maintenance.body": "The service is down for maintenance. Please try again soon.",
  "gate.login.title": "Log in to continue",
  "gate.login.body": "Please log in to watch.",
  "gate.login.button": "Log in",
  "gate.newVersion": "A new version is available.",
  "offline.message": "You are offline",
  "firstRun.welcome": "Welcome",
  "firstRun.noticeChanged": "Our privacy notice changed",
  "firstRun.appLanguage": "App language",
  "firstRun.watchIn": "Watch in",
  "firstRun.privacy": "Your privacy",
  "firstRun.privacyBody":
    "We use your details to run the app, play videos, keep your account safe and support you. You cannot use the app without this. These are optional and off unless you turn them on:",
  "firstRun.recommendations": "Recommendations from what I watch",
  "firstRun.analytics": "Help improve the app (analytics)",
  "firstRun.marketing": "Offers and updates",
  "firstRun.readNotice": "Read the privacy notice",
  "firstRun.adult": "I am 18 or older · Continue",
  "firstRun.minor": "I am under 18",
  "firstRun.accept": "Accept and continue",
  "firstRun.refusedTitle": "Sorry",
  "firstRun.refusedBody": "You need to be 18 or older to use this app. You can try again tomorrow.",
  "firstRun.networkError": "Cannot reach the server. Check your connection and try again.",
} as const;

export type TextKey = keyof typeof en;

const hi: Partial<Record<TextKey, string>> = {
  "common.retry": "फिर कोशिश करें",
  "common.update": "अपडेट करें",
  "common.notNow": "अभी नहीं",
  "common.back": "वापस",
  "gate.update.title": "कृपया ऐप अपडेट करें",
  "gate.update.body": "यह वर्ज़न अब काम नहीं करता। देखते रहने के लिए अपडेट करें।",
  "gate.maintenance.title": "हम जल्द ही लौटेंगे",
  "gate.maintenance.body": "सेवा रखरखाव के लिए बंद है। कृपया थोड़ी देर बाद कोशिश करें।",
  "gate.login.title": "आगे बढ़ने के लिए लॉग इन करें",
  "gate.login.body": "देखने के लिए कृपया लॉग इन करें।",
  "gate.login.button": "लॉग इन",
  "gate.newVersion": "नया वर्ज़न उपलब्ध है।",
  "offline.message": "आप ऑफ़लाइन हैं",
  "firstRun.welcome": "स्वागत है",
  "firstRun.noticeChanged": "हमारा गोपनीयता नोटिस बदल गया है",
  "firstRun.appLanguage": "ऐप की भाषा",
  "firstRun.watchIn": "इस भाषा में देखें",
  "firstRun.privacy": "आपकी गोपनीयता",
  "firstRun.privacyBody":
    "हम आपकी जानकारी का उपयोग ऐप चलाने, वीडियो दिखाने, आपका खाता सुरक्षित रखने और आपकी मदद करने के लिए करते हैं। इसके बिना आप ऐप का उपयोग नहीं कर सकते। नीचे दिए विकल्प वैकल्पिक हैं और जब तक आप चालू न करें, बंद रहते हैं:",
  "firstRun.recommendations": "मेरे देखे हुए के आधार पर सुझाव",
  "firstRun.analytics": "ऐप बेहतर बनाने में मदद करें (एनालिटिक्स)",
  "firstRun.marketing": "ऑफ़र और अपडेट",
  "firstRun.readNotice": "गोपनीयता नोटिस पढ़ें",
  "firstRun.adult": "मेरी उम्र 18 या अधिक है · आगे बढ़ें",
  "firstRun.minor": "मेरी उम्र 18 से कम है",
  "firstRun.accept": "स्वीकार करें और आगे बढ़ें",
  "firstRun.refusedTitle": "क्षमा करें",
  "firstRun.refusedBody": "इस ऐप का उपयोग करने के लिए आपकी उम्र 18 या अधिक होनी चाहिए। आप कल फिर कोशिश कर सकते हैं।",
  "firstRun.networkError": "सर्वर से संपर्क नहीं हो पा रहा। अपना कनेक्शन जाँचें और फिर कोशिश करें।",
};

const dictionaries: Record<string, Partial<Record<TextKey, string>>> = { en, hi };

let language = "en";
const listeners = new Set<() => void>();

export const getLanguage = () => language;

/** Sets the language the app speaks. An unknown language falls back to English. */
export function setLanguage(next: string) {
  const value = dictionaries[next] ? next : "en";
  if (value === language) return;
  language = value;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The text for a key in the current language; English when that language has none. */
export function translate(key: TextKey, lang: string = language): string {
  return dictionaries[lang]?.[key] ?? en[key];
}

/** Text for screens: re-renders when the language changes. */
export function useT() {
  const lang = useSyncExternalStore(subscribe, getLanguage, getLanguage);
  return (key: TextKey) => translate(key, lang);
}
