import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useViewer } from "@/hooks/useViewer";
import {
  cancelDeletion,
  listDevices,
  requestDeletion,
  requestStepUp,
  signOutDevice,
  updateProfile,
  type Device,
} from "@/services/accountService";
import { ApiError } from "@/services/api";
import { loadAppConfig, type AppConfig } from "@/services/appConfigService";
import { logout } from "@/services/authService";
import DataSaverRow from "@/components/profile/DataSaverRow";
import { colors } from "@/constants/theme";

const NAMES: Record<string, string> = { hi: "हिन्दी", en: "English", ta: "தமிழ்" };
const nameOf = (code: string) => NAMES[code] ?? code;

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    const type = error.type.replace("urn:ott:error:", "");
    if (type === "otp-invalid") return "That code is not right.";
    if (type === "step-up-unavailable") return "Add a phone number or email to your account first.";
    return error.message || "Something went wrong.";
  }
  return "Cannot reach the server. Check your connection.";
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const viewer = useViewer();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [name, setName] = useState(viewer?.displayName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "code">("idle");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadAppConfig().then(setConfig);
    listDevices().then(setDevices).catch(() => setDevices([]));
  }, []);
  useEffect(() => setName(viewer?.displayName ?? ""), [viewer?.displayName]);

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const playbackRow = (
    <>
        <Text style={styles.section}>Playback</Text>
        <DataSaverRow />
    </>
  );

  if (!viewer || viewer.kind !== "member") {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        {playbackRow}
        <Text style={styles.text}>Log in to manage your account.</Text>
        <TouchableOpacity style={styles.primary} onPress={() => router.replace("/login" as any)}>
          <Text style={styles.primaryText}>Log in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const contentOn = new Set(viewer.contentLanguages);
  const toggleContent = (code: string, on: boolean) => {
    const next = on ? [...viewer.contentLanguages, code] : viewer.contentLanguages.filter((c) => c !== code);
    if (next.length === 0) return; // at least one is needed
    void run(async () => void (await updateProfile({ contentLanguages: next })));
  };

  const pending = viewer.status === "deletion_pending";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        {pending && (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingText}>
              Your account will be deleted on{" "}
              {viewer.deletionScheduledFor ? new Date(viewer.deletionScheduledFor).toLocaleDateString() : "a set date"}.
            </Text>
            <TouchableOpacity
              style={styles.secondary}
              disabled={busy}
              onPress={() => run(async () => void (await cancelDeletion()))}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Keep my account</Text>
            </TouchableOpacity>
          </View>
        )}

        {playbackRow}

        <Text style={styles.section}>Profile</Text>
        <Text style={styles.label}>Name</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={name}
            onChangeText={setName}
            maxLength={40}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Name"
          />
          <TouchableOpacity
            style={[styles.secondary, (busy || !name.trim() || name.trim() === viewer.displayName) && styles.disabled]}
            disabled={busy || !name.trim() || name.trim() === viewer.displayName}
            onPress={() => run(async () => void (await updateProfile({ displayName: name.trim() })))}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Save</Text>
          </TouchableOpacity>
        </View>
        {viewer.phone ? <Text style={styles.note}>Phone: {viewer.phone}</Text> : null}
        {viewer.email ? <Text style={styles.note}>Email: {viewer.email}</Text> : null}

        {config && (
          <>
            <Text style={styles.label}>App language</Text>
            <View style={styles.chips}>
              {config.languages.app.map((lang) => (
                <TouchableOpacity
                  key={lang}
                  style={[styles.chip, (viewer.appLanguage ?? config.languages.defaultApp) === lang && styles.chipOn]}
                  disabled={busy}
                  onPress={() => run(async () => void (await updateProfile({ appLanguage: lang })))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: (viewer.appLanguage ?? config.languages.defaultApp) === lang }}
                >
                  <Text style={styles.chipText}>{nameOf(lang)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Watch in</Text>
            {config.languages.content.map((lang) => (
              <View key={lang} style={styles.switchRow}>
                <Text style={styles.text}>{nameOf(lang)}</Text>
                <Switch value={contentOn.has(lang)} disabled={busy} onValueChange={(on) => toggleContent(lang, on)} accessibilityLabel={nameOf(lang)} />
              </View>
            ))}
          </>
        )}

        <Text style={styles.section}>Devices</Text>
        {devices === null ? (
          <Text style={styles.note}>Loading…</Text>
        ) : (
          devices.map((device) => (
            <View key={device.id} style={styles.deviceRow}>
              <View style={styles.flex}>
                <Text style={styles.text}>
                  {device.model ?? device.platform}
                  {device.current ? " (this device)" : ""}
                </Text>
                <Text style={styles.note}>Last used {new Date(device.lastSeenAt).toLocaleDateString()}</Text>
              </View>
              {!device.current && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Sign out ${device.model ?? device.platform}`}
                  onPress={() =>
                    Alert.alert("Sign out this device?", device.model ?? device.platform, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Sign out",
                        style: "destructive",
                        onPress: () =>
                          run(async () => {
                            await signOutDevice(device.id);
                            setDevices((prev) => prev?.filter((d) => d.id !== device.id) ?? prev);
                          }),
                      },
                    ])
                  }
                >
                  <Text style={styles.danger}>Sign out</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}

        <Text style={styles.section}>More</Text>
        <TouchableOpacity style={styles.secondary} onPress={() => router.push("/notifications" as any)} accessibilityRole="button">
          <Text style={styles.secondaryText}>Notifications</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={() => router.push("/privacy" as any)} accessibilityRole="button">
          <Text style={styles.secondaryText}>Privacy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={() => router.push("/help" as any)} accessibilityRole="button">
          <Text style={styles.secondaryText}>Help</Text>
        </TouchableOpacity>

        <Text style={styles.section}>Account</Text>
        <TouchableOpacity style={styles.secondary} onPress={() => router.push("/login_methods" as any)} accessibilityRole="button">
          <Text style={styles.secondaryText}>Phone number and login methods</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={() => void logout().then(() => router.back())} accessibilityRole="button">
          <Text style={styles.secondaryText}>Log out</Text>
        </TouchableOpacity>

        {!pending && step === "idle" && (
          <TouchableOpacity
            style={[styles.dangerButton, busy && styles.disabled]}
            disabled={busy}
            accessibilityRole="button"
            onPress={() =>
              Alert.alert(
                "Delete your account?",
                "Your account, coins and watch history will be erased after 30 days. You can change your mind until then.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Send me a code",
                    style: "destructive",
                    onPress: () =>
                      run(async () => {
                        await requestStepUp();
                        setStep("code");
                      }),
                  },
                ],
              )
            }
          >
            <Text style={styles.dangerText}>Delete my account</Text>
          </TouchableOpacity>
        )}
        {step === "code" && (
          <View style={styles.codeBox}>
            <Text style={styles.text}>Enter the 6-digit code we sent you to confirm.</Text>
            <TextInput
              style={[styles.input, styles.code]}
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={6}
              autoFocus
              accessibilityLabel="6-digit code"
            />
            <TouchableOpacity
              style={[styles.dangerButton, (busy || code.length !== 6) && styles.disabled]}
              disabled={busy || code.length !== 6}
              accessibilityRole="button"
              onPress={() =>
                run(async () => {
                  await requestDeletion(code);
                  setStep("idle");
                  setCode("");
                })
              }
            >
              <Text style={styles.dangerText}>Confirm deletion</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setStep("idle"); setCode(""); }}>
              <Text style={styles.link}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: "center", justifyContent: "center", gap: 16 },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 48, gap: 12 },
  back: { color: colors.text, fontSize: 32 },
  title: { color: colors.text, fontSize: 18, fontWeight: "700", flex: 1 },
  body: { padding: 16, gap: 10 },
  section: { color: colors.text, fontSize: 18, fontWeight: "700", marginTop: 18 },
  label: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  text: { color: colors.text, fontSize: 15 },
  note: { color: colors.textMuted, fontSize: 12 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: { backgroundColor: colors.surface, color: colors.text, borderRadius: 10, paddingHorizontal: 14, height: 48, fontSize: 15 },
  code: { fontSize: 22, letterSpacing: 6, textAlign: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 13 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  deviceRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  primary: { backgroundColor: colors.accent, borderRadius: 10, height: 48, paddingHorizontal: 32, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.onAccent, fontSize: 15, fontWeight: "700" },
  secondary: { backgroundColor: colors.surfaceHigh, borderRadius: 10, height: 44, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  danger: { color: colors.danger, fontSize: 14 },
  dangerButton: { backgroundColor: colors.surfaceHigh, borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginTop: 8 },
  dangerText: { color: colors.danger, fontSize: 15, fontWeight: "700" },
  link: { color: colors.text, textAlign: "center", paddingVertical: 8, textDecorationLine: "underline" },
  codeBox: { gap: 10 },
  pendingBox: { backgroundColor: colors.surfaceHigh, borderRadius: 10, padding: 14, gap: 10 },
  pendingText: { color: colors.gold, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14 },
});
