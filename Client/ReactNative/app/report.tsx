import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/services/api";
import { reportTitle, type ReportCategory } from "@/services/supportService";
import { colors } from "@/constants/theme";

const CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: "wrong_rating", label: "Wrong age rating" },
  { value: "missing_warning", label: "Missing or wrong warning" },
  { value: "nudity_sex_obscenity", label: "Nudity, sex or obscenity" },
  { value: "violence_self_harm", label: "Violence, self-harm or dangerous acts" },
  { value: "drugs_tobacco", label: "Drugs or tobacco" },
  { value: "religion_caste_discrimination", label: "Hurts religious or caste sentiment, or discrimination" },
  { value: "sovereignty_security_order", label: "Sovereignty, security or public order" },
  { value: "child_safety", label: "Child safety" },
  { value: "copyright", label: "Copyright" },
  { value: "subtitles_accessibility", label: "Subtitles or accessibility" },
  { value: "video_sound", label: "Video or sound problem" },
  { value: "other", label: "Something else" },
];

/** Report a series or an episode (deep dive 7, K3): content becomes a grievance, technical problems go to support. */
export default function ReportScreen() {
  const { shortId, episode } = useLocalSearchParams<{ shortId: string; episode?: string }>();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: number; decideBy: string | null } | null>(null);

  const send = async () => {
    if (!category) return setError("Choose what the problem is.");
    setBusy(true);
    setError(null);
    try {
      const ticket = await reportTitle({
        series: shortId,
        ...(episode ? { episode: Number(episode) } : {}),
        category,
        ...(message.trim() ? { message: message.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      setDone({ number: ticket.number, decideBy: ticket.decideBy });
    } catch (err) {
      setError(
        err instanceof ApiError && err.type.endsWith("contact-email-required")
          ? "Please give an email address so we can answer you."
          : err instanceof ApiError
            ? err.message
            : "Cannot reach the server. Check your connection.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Report a problem</Text>
      </View>
      {done ? (
        <View style={styles.body}>
          <Text style={styles.heading}>Thank you</Text>
          <Text style={styles.text}>Your report number is {done.number}.</Text>
          {done.decideBy && (
            <Text style={styles.note}>
              We will reply within 24 hours and decide by {new Date(done.decideBy).toLocaleDateString()}. You can follow it in Help, My tickets.
            </Text>
          )}
          <TouchableOpacity style={styles.primary} onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.primaryText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>What is wrong?</Text>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.value}
              style={[styles.option, category === c.value && styles.optionOn]}
              onPress={() => setCategory(c.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: category === c.value }}
            >
              <Text style={styles.text}>{c.label}</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.label}>Tell us more (optional)</Text>
          <TextInput style={[styles.input, styles.multiline]} value={message} onChangeText={setMessage} multiline maxLength={4000} placeholderTextColor={colors.textMuted} placeholder="What did you see?" accessibilityLabel="Details" />
          <Text style={styles.label}>Email (so we can answer you)</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" placeholderTextColor={colors.textMuted} accessibilityLabel="Email" />
          {error && <Text style={styles.error}>{error}</Text>}
          <TouchableOpacity style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={send} accessibilityRole="button">
            <Text style={styles.primaryText}>{busy ? "Sending…" : "Send report"}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 48, gap: 12 },
  back: { color: colors.text, fontSize: 32 },
  title: { color: colors.text, fontSize: 18, fontWeight: "700", flex: 1 },
  body: { padding: 16, gap: 10 },
  heading: { color: colors.text, fontSize: 22, fontWeight: "700" },
  label: { color: colors.textMuted, fontSize: 13, marginTop: 8 },
  text: { color: colors.text, fontSize: 15 },
  note: { color: colors.textMuted, fontSize: 13 },
  option: { backgroundColor: colors.surface, borderRadius: 10, padding: 14 },
  optionOn: { borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.surfaceHigh },
  input: { backgroundColor: colors.surface, color: colors.text, borderRadius: 10, paddingHorizontal: 14, minHeight: 48, fontSize: 15 },
  multiline: { minHeight: 100, textAlignVertical: "top", paddingTop: 12 },
  primary: { backgroundColor: colors.accent, borderRadius: 10, height: 50, alignItems: "center", justifyContent: "center", marginTop: 8 },
  primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 14 },
});
