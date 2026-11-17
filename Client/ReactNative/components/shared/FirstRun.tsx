import React, { useEffect, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/services/api";
import { loadAppConfig, type AppConfig } from "@/services/appConfigService";
import { setLanguage, useT } from "@/services/i18n";
import { completeFirstRun, defaultAppLanguage, getFirstRun, subscribeFirstRun } from "@/services/firstRun";
import { colors } from "@/constants/theme";

const NAMES: Record<string, string> = { hi: "हिन्दी", en: "English", ta: "தமிழ்" };
const nameOf = (code: string) => NAMES[code] ?? code;

/**
 * The first screen of a new install: language, age, the privacy notice. It comes back alone (the
 * notice part) when the notice changes. Nothing is ticked for the viewer and "continue" is a
 * deliberate tap. A viewer who says they are too young gets a plain message for 24 hours.
 */
const FirstRun: React.FC = () => {
  const state = useSyncExternalStore(subscribeFirstRun, getFirstRun, getFirstRun);
  const t = useT();
  const insets = useSafeAreaInsets();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [appLanguage, setAppLanguage] = useState<string | null>(null);
  const [content, setContent] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needed = state.status === "needed" ? state : null;
  useEffect(() => {
    if (!needed) return;
    loadAppConfig().then((c) => {
      setConfig(c);
      if (c) {
        setAppLanguage((current) => {
          const chosen = current ?? defaultAppLanguage(c);
          setLanguage(chosen); // the screen speaks the language it is about to save
          return chosen;
        });
        setContent((current) => (current.length ? current : [c.languages.defaultContent]));
      }
    });
    setRecommendations(needed.choices?.recommendations ?? false);
    setAnalytics(needed.choices?.analytics ?? false);
    setMarketing(needed.choices?.marketing ?? false);
  }, [needed?.mode, needed?.notice.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.status === "refused") {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{t("firstRun.refusedTitle")}</Text>
        <Text style={styles.body}>{t("firstRun.refusedBody")}</Text>
      </View>
    );
  }
  if (!needed) return null;

  const submit = async (olderThanMinimum: boolean | undefined) => {
    setBusy(true);
    setError(null);
    try {
      await completeFirstRun({
        noticeId: needed.notice.id,
        recommendations,
        analytics,
        marketing,
        ...(needed.mode === "full"
          ? { appLanguage: appLanguage ?? undefined, contentLanguages: content, olderThanMinimum }
          : {}),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("firstRun.networkError"));
    } finally {
      setBusy(false);
    }
  };

  const toggleContent = (code: string, on: boolean) =>
    setContent((prev) => {
      const next = on ? [...prev, code] : prev.filter((c) => c !== code);
      return next.length ? next : prev; // at least one
    });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{needed.mode === "full" ? t("firstRun.welcome") : t("firstRun.noticeChanged")}</Text>

        {needed.mode === "full" && config && (
          <>
            <Text style={styles.label}>{t("firstRun.appLanguage")}</Text>
            <View style={styles.chips}>
              {config.languages.app.map((lang) => (
                <TouchableOpacity
                  key={lang}
                  style={[styles.chip, appLanguage === lang && styles.chipOn]}
                  onPress={() => {
                    setAppLanguage(lang);
                    setLanguage(lang);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: appLanguage === lang }}
                >
                  <Text style={styles.chipText}>{nameOf(lang)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>{t("firstRun.watchIn")}</Text>
            {config.languages.content.map((lang) => (
              <View key={lang} style={styles.switchRow}>
                <Text style={styles.text}>{nameOf(lang)}</Text>
                <Switch value={content.includes(lang)} onValueChange={(on) => toggleContent(lang, on)} accessibilityLabel={nameOf(lang)} />
              </View>
            ))}
          </>
        )}

        <Text style={styles.label}>{t("firstRun.privacy")}</Text>
        <Text style={styles.body}>{t("firstRun.privacyBody")}</Text>
        <View style={styles.switchRow}>
          <Text style={styles.text}>{t("firstRun.recommendations")}</Text>
          <Switch value={recommendations} onValueChange={setRecommendations} accessibilityLabel="Recommendations from what I watch" />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.text}>{t("firstRun.analytics")}</Text>
          <Switch value={analytics} onValueChange={setAnalytics} accessibilityLabel="Help improve the app" />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.text}>{t("firstRun.marketing")}</Text>
          <Switch value={marketing} onValueChange={setMarketing} accessibilityLabel="Offers and updates" />
        </View>
        <TouchableOpacity onPress={() => Linking.openURL(needed.notice.url)}>
          <Text style={styles.link}>{t("firstRun.readNotice")}</Text>
        </TouchableOpacity>
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      {needed.mode === "full" ? (
        <>
          <TouchableOpacity style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={() => submit(true)} accessibilityRole="button">
            {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>{t("firstRun.adult")}</Text>}
          </TouchableOpacity>
          <TouchableOpacity disabled={busy} onPress={() => submit(false)} accessibilityRole="button">
            <Text style={styles.link}>{t("firstRun.minor")}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={() => submit(undefined)} accessibilityRole="button">
          {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>{t("firstRun.accept")}</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, zIndex: 9500, backgroundColor: colors.background, paddingHorizontal: 24, justifyContent: "center", gap: 12 },
  scroll: { gap: 12, paddingVertical: 8 },
  title: { color: colors.text, fontSize: 26, fontWeight: "700" },
  label: { color: colors.textMuted, fontSize: 13, marginTop: 8 },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  text: { color: colors.text, fontSize: 15, flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10 },
  chipOn: { backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  primary: { backgroundColor: colors.accent, borderRadius: 10, height: 52, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  link: { color: colors.text, textAlign: "center", paddingVertical: 8, textDecorationLine: "underline" },
  error: { color: colors.danger, fontSize: 14 },
});

export default FirstRun;
