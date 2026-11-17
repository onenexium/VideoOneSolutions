import React, { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/services/api";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "@/services/supportService";
import { colors } from "@/constants/theme";

type Switchable = "newEpisodes" | "continueWatching" | "coinsExpiring" | "checkinReminder" | "hideTitles";
const ROWS: { key: Switchable; label: string; note?: string; marketing?: boolean }[] = [
  { key: "newEpisodes", label: "New episodes", note: "Of series in My List" },
  { key: "continueWatching", label: "Series you left unfinished", marketing: true },
  { key: "coinsExpiring", label: "Free coins about to expire", marketing: true },
  { key: "checkinReminder", label: "Daily check-in reminder", marketing: true },
  { key: "hideTitles", label: "Hide series titles on the lock screen" },
];

/**
 * Settings → Notifications (deep dive 6, H5). Payments and account messages always come. The reminder
 * types need "Offers and updates" consent; without it they show off, with the reason.
 */
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getNotificationPreferences()
        .then(setPrefs)
        .catch(() => setMessage("Cannot load your notification settings."));
    }, []),
  );

  const toggle = async (key: Switchable, on: boolean) => {
    if (!prefs) return;
    const before = prefs;
    setPrefs({ ...prefs, [key]: on });
    setMessage(null);
    try {
      setPrefs(await updateNotificationPreferences({ [key]: on }));
    } catch (err) {
      setPrefs(before);
      setMessage(
        err instanceof ApiError && err.type.endsWith("marketing-consent-required")
          ? "Turn on \"Offers and updates\" in Privacy first to get reminders."
          : "Could not save. Please try again.",
      );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
      </View>
      {!prefs ? (
        message ? <Text style={[styles.note, styles.pad]}>{message}</Text> : <ActivityIndicator color={colors.text} />
      ) : (
        <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + 32 }]}>
          {ROWS.map((row) => (
            <View key={row.key} style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.text}>{row.label}</Text>
                {row.note && <Text style={styles.note}>{row.note}</Text>}
                {row.marketing && !prefs.marketingConsent && <Text style={styles.note}>{'Needs "Offers and updates" consent'}</Text>}
              </View>
              <Switch value={prefs[row.key]} onValueChange={(on) => void toggle(row.key, on)} accessibilityLabel={row.label} />
            </View>
          ))}
          <Text style={styles.note}>Payment and account messages are always sent.</Text>
          {message && <Text style={styles.error}>{message}</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 48, gap: 12 },
  back: { color: colors.text, fontSize: 32 },
  title: { color: colors.text, fontSize: 18, fontWeight: "700", flex: 1 },
  pad: { padding: 16, gap: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  text: { color: colors.text, fontSize: 15 },
  note: { color: colors.textMuted, fontSize: 12 },
  error: { color: colors.danger, fontSize: 14 },
});
