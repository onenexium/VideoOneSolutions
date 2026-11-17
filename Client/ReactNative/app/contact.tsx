import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/services/api";
import { createTicket, type TicketCategory } from "@/services/supportService";

const TOPICS: { value: TicketCategory; label: string }[] = [
  { value: "account", label: "Account and login" },
  { value: "coins_payments", label: "Coins and payments" },
  { value: "playback", label: "Playback" },
  { value: "privacy", label: "Privacy" },
  { value: "other", label: "Something else" },
];

/**
 * Contact us, or file a grievance (deep dive 7, K1, K2). A grievance is acknowledged within 24 hours
 * and decided within 15 days. The app sends its version and platform with it, for support.
 */
export default function ContactScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const grievance = params.kind === "grievance";
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<TicketCategory>("other");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: number; decideBy: string | null } | null>(null);

  const send = async () => {
    if (!message.trim()) return setError("Write your message.");
    setBusy(true);
    setError(null);
    try {
      const ticket = await createTicket({
        kind: grievance ? "grievance" : "support",
        category,
        message: message.trim(),
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
        <Text style={styles.title}>{grievance ? "File a grievance" : "Contact us"}</Text>
      </View>
      {done ? (
        <View style={styles.body}>
          <Text style={styles.heading}>Sent</Text>
          <Text style={styles.text}>Your ticket number is {done.number}.</Text>
          <Text style={styles.note}>
            {done.decideBy
              ? `We acknowledge it within 24 hours and decide by ${new Date(done.decideBy).toLocaleDateString()}.`
              : "We will reply in Help, My tickets."}
          </Text>
          <TouchableOpacity style={styles.primary} onPress={() => router.replace("/tickets" as any)} accessibilityRole="button">
            <Text style={styles.primaryText}>See my tickets</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Topic</Text>
          <View style={styles.chips}>
            {TOPICS.map((t) => (
              <TouchableOpacity
                key={t.value}
                style={[styles.chip, category === t.value && styles.chipOn]}
                onPress={() => setCategory(t.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: category === t.value }}
              >
                <Text style={styles.chipText}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Message</Text>
          <TextInput style={[styles.input, styles.multiline]} value={message} onChangeText={setMessage} multiline maxLength={4000} placeholder="How can we help?" placeholderTextColor="#777" accessibilityLabel="Message" />
          <Text style={styles.label}>Email {grievance ? "" : "(optional if you have one on your account)"}</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" placeholderTextColor="#777" accessibilityLabel="Email" />
          {error && <Text style={styles.error}>{error}</Text>}
          <TouchableOpacity style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={send} accessibilityRole="button">
            <Text style={styles.primaryText}>{busy ? "Sending…" : "Send"}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 48, gap: 12 },
  back: { color: "#FFFFFF", fontSize: 32 },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", flex: 1 },
  body: { padding: 16, gap: 10 },
  heading: { color: "#FFFFFF", fontSize: 22, fontWeight: "700" },
  label: { color: "#B3B3B3", fontSize: 13, marginTop: 8 },
  text: { color: "#FFFFFF", fontSize: 15 },
  note: { color: "#B3B3B3", fontSize: 13 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: "#1A1A1A", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: "#3A3A3A", borderWidth: 1, borderColor: "#FFFFFF" },
  chipText: { color: "#FFFFFF", fontSize: 13 },
  input: { backgroundColor: "#1A1A1A", color: "#FFFFFF", borderRadius: 10, paddingHorizontal: 14, minHeight: 48, fontSize: 15 },
  multiline: { minHeight: 120, textAlignVertical: "top", paddingTop: 12 },
  primary: { backgroundColor: "#FFFFFF", borderRadius: 10, height: 50, alignItems: "center", justifyContent: "center", marginTop: 8 },
  primaryText: { color: "#000000", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  error: { color: "#FF6B6B", fontSize: 14 },
});
