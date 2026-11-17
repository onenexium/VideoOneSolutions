import React, { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { requestStepUp } from "@/services/accountService";
import { ApiError } from "@/services/api";
import { createPrivacyRequest, getPrivacy, setNominees, updateConsent, type Privacy } from "@/services/supportService";

type RequestKind = "access" | "correction" | "erasure" | "nomination";
const KINDS: { kind: RequestKind; label: string }[] = [
  { kind: "access", label: "A summary of my data" },
  { kind: "correction", label: "Correct my data" },
  { kind: "erasure", label: "Erase my data" },
  { kind: "nomination", label: "I am acting for someone (nomination)" },
];
const STATUS = { open: "Open", completed: "Done", rejected: "Rejected" } as const;

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.type.endsWith("otp-invalid")) return "That code is not right.";
    if (error.type.endsWith("step-up-unavailable")) return "Add a phone number or email to your account first.";
    return error.message;
  }
  return "Cannot reach the server. Check your connection.";
}

/**
 * The privacy centre (deep dive 7, K4): what we hold, who receives it, the consent in force; requests
 * and nominees, each confirmed with a code sent to the viewer.
 */
export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Privacy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<null | { what: "request"; kind: RequestKind } | { what: "nominee" }>(null);
  const [details, setDetails] = useState("");
  const [nomineeName, setNomineeName] = useState("");
  const [nomineePhone, setNomineePhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getPrivacy()
      .then((p) => {
        setData(p);
        setError(null);
      })
      .catch((e) => setError(messageFor(e)));
  }, []);
  useFocusEffect(load);

  const begin = async (next: NonNullable<typeof step>) => {
    setBusy(true);
    setError(null);
    try {
      await requestStepUp();
      setCode("");
      setStep(next);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  type Purpose = "recommendations" | "analytics" | "marketing";
  const PURPOSES: { key: Purpose; label: string }[] = [
    { key: "recommendations", label: "Recommendations from what I watch" },
    { key: "analytics", label: "Help improve the app (analytics)" },
    { key: "marketing", label: "Offers and updates" },
  ];
  const changeConsent = async (key: Purpose, on: boolean) => {
    const current = data?.consent?.choices ?? { recommendations: false, analytics: false, marketing: false };
    setError(null);
    try {
      await updateConsent({ ...current, [key]: on });
      load();
    } catch (e) {
      setError(messageFor(e));
    }
  };

  const confirm = async () => {
    if (!step || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      if (step.what === "request") {
        await createPrivacyRequest({ kind: step.kind, code, ...(details.trim() ? { details: details.trim() } : {}) });
      } else {
        const list = nomineeName.trim() && nomineePhone.trim() ? [{ name: nomineeName.trim(), phone: nomineePhone.trim() }] : [];
        await setNominees({ nominees: list, code });
      }
      setStep(null);
      setDetails("");
      load();
    } catch (e) {
      setError(messageFor(e));
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
        <Text style={styles.title}>Privacy</Text>
      </View>
      {!data ? (
        error ? <Text style={[styles.note, styles.pad]}>{error}</Text> : <ActivityIndicator color="#FFFFFF" />
      ) : (
        <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.section}>Your data</Text>
          <Text style={styles.text}>
            {[
              data.data.phone && `Phone ${data.data.phone}`,
              data.data.email && `Email ${data.data.email}`,
              `${data.data.devices} devices`,
              `${data.data.follows} in My List`,
              `${data.data.likes} likes`,
              `${data.data.historySeries} series in History`,
              `${data.data.unlocks} episodes unlocked`,
              `${data.data.coins} coins`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>

          <Text style={styles.section}>Your consent</Text>
          <Text style={styles.text}>
            {data.consent
              ? `Given ${new Date(data.consent.givenAt).toLocaleDateString()} (notice version ${data.consent.noticeVersion}). Recommendations ${data.consent.choices.recommendations ? "on" : "off"}, analytics ${data.consent.choices.analytics ? "on" : "off"}, offers ${data.consent.choices.marketing ? "on" : "off"}.`
              : "Not given yet."}
          </Text>
          {PURPOSES.map((p) => (
            <View key={p.key} style={styles.switchRow}>
              <Text style={[styles.text, styles.flex]}>{p.label}</Text>
              <Switch
                value={data.consent?.choices[p.key] ?? false}
                onValueChange={(on) => void changeConsent(p.key, on)}
                accessibilityLabel={p.label}
              />
            </View>
          ))}

          <Text style={styles.section}>Who receives your data</Text>
          {data.processors.map((p) => (
            <Text key={p.name} style={styles.note}>
              {p.name}: {p.purpose} ({p.data})
            </Text>
          ))}

          <Text style={styles.section}>Requests</Text>
          <Text style={styles.note}>We answer within {data.responseDays} days. To delete your account, use Settings.</Text>
          {data.requests.map((r) => (
            <Text key={r.id} style={styles.text}>
              {KINDS.find((k) => k.kind === r.kind)?.label} · {STATUS[r.status]} · due {new Date(r.dueBy).toLocaleDateString()}
            </Text>
          ))}
          {!step &&
            KINDS.map((k) => (
              <TouchableOpacity key={k.kind} style={[styles.secondary, busy && styles.disabled]} disabled={busy} onPress={() => void begin({ what: "request", kind: k.kind })} accessibilityRole="button">
                <Text style={styles.secondaryText}>{k.label}</Text>
              </TouchableOpacity>
            ))}

          <Text style={styles.section}>Nominee</Text>
          <Text style={styles.note}>Someone who may use your rights if you cannot.</Text>
          {data.nominees.map((n) => (
            <Text key={n.phone} style={styles.text}>
              {n.name} · {n.phone}
            </Text>
          ))}
          {!step && (
            <TouchableOpacity style={[styles.secondary, busy && styles.disabled]} disabled={busy} onPress={() => void begin({ what: "nominee" })} accessibilityRole="button">
              <Text style={styles.secondaryText}>{data.nominees.length ? "Change nominee" : "Add a nominee"}</Text>
            </TouchableOpacity>
          )}

          {step && (
            <View style={styles.box}>
              {step.what === "request" ? (
                <TextInput style={[styles.input, styles.multiline]} value={details} onChangeText={setDetails} multiline maxLength={2000} placeholder="Details (what to correct, and so on)" placeholderTextColor="#777" accessibilityLabel="Details" />
              ) : (
                <>
                  <TextInput style={styles.input} value={nomineeName} onChangeText={setNomineeName} placeholder="Name (leave empty to remove)" placeholderTextColor="#777" accessibilityLabel="Nominee name" />
                  <TextInput style={styles.input} value={nomineePhone} onChangeText={setNomineePhone} keyboardType="phone-pad" placeholder="+91 phone number" placeholderTextColor="#777" accessibilityLabel="Nominee phone" />
                </>
              )}
              <Text style={styles.note}>Enter the 6-digit code we sent you.</Text>
              <TextInput style={[styles.input, styles.code]} value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} accessibilityLabel="6-digit code" />
              <TouchableOpacity style={[styles.primary, (busy || code.length !== 6) && styles.disabled]} disabled={busy || code.length !== 6} onPress={confirm} accessibilityRole="button">
                <Text style={styles.primaryText}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep(null)}>
                <Text style={styles.link}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
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
  pad: { padding: 16, gap: 10 },
  section: { color: "#FFFFFF", fontSize: 17, fontWeight: "700", marginTop: 14 },
  text: { color: "#FFFFFF", fontSize: 14, lineHeight: 20 },
  note: { color: "#B3B3B3", fontSize: 12, lineHeight: 18 },
  box: { gap: 10, marginTop: 8 },
  flex: { flex: 1 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  input: { backgroundColor: "#1A1A1A", color: "#FFFFFF", borderRadius: 10, paddingHorizontal: 14, minHeight: 48, fontSize: 15 },
  multiline: { minHeight: 90, textAlignVertical: "top", paddingTop: 12 },
  code: { fontSize: 22, letterSpacing: 6, textAlign: "center" },
  primary: { backgroundColor: "#FFFFFF", borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#000000", fontSize: 15, fontWeight: "700" },
  secondary: { backgroundColor: "#2A2A2A", borderRadius: 10, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  secondaryText: { color: "#FFFFFF", fontSize: 14 },
  disabled: { opacity: 0.5 },
  link: { color: "#FFFFFF", textAlign: "center", paddingVertical: 8, textDecorationLine: "underline" },
  error: { color: "#FF6B6B", fontSize: 14 },
});
