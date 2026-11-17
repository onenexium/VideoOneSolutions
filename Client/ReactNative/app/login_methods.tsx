import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useViewer } from "@/hooks/useViewer";
import {
  addEmailMethod,
  removeLoginMethod,
  requestStepUp,
  startPhoneChange,
  verifyPhoneChange,
  type LoginMethod,
} from "@/services/accountService";
import { ApiError } from "@/services/api";
import { isNewPasswordOk, normalizeEmail, normalizePhone, requestEmailCode } from "@/services/authService";

const LABEL: Record<LoginMethod, string> = { phone: "Phone number", email: "Email", google: "Google", apple: "Apple" };

type Mode =
  | { name: "menu" }
  | { name: "phone" }
  | { name: "phoneCodes"; phone: string }
  | { name: "email" }
  | { name: "emailCode"; email: string; password: string }
  | { name: "remove"; method: LoginMethod };

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.type.replace("urn:ott:error:", "")) {
      case "otp-invalid":
        return "That code is not right.";
      case "phone-in-use":
        return "Another account already uses this number.";
      case "login-method-in-use":
        return "Another account already uses this.";
      case "last-login-method":
        return "You need at least one way to log in.";
      case "step-up-unavailable":
        return "Add a phone number or email first.";
      default:
        return error.message || "Something went wrong.";
    }
  }
  return "Cannot reach the server. Check your connection.";
}

export default function LoginMethodsScreen() {
  const insets = useSafeAreaInsets();
  const viewer = useViewer();
  const [mode, setMode] = useState<Mode>({ name: "menu" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [oldCode, setOldCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
  const back = () => {
    setMode({ name: "menu" });
    setError(null);
    setOldCode("");
    setNewCode("");
  };
  const digits = (set: (v: string) => void) => (t: string) => set(t.replace(/\D/g, "").slice(0, 6));

  if (!viewer || viewer.kind !== "member") {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.text}>Log in to manage how you log in.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (mode.name === "menu" ? router.back() : back())} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Phone and login</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        {mode.name === "menu" && (
          <>
            <Text style={styles.section}>You can log in with</Text>
            {viewer.loginMethods.map((method) => (
              <View key={method} style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.text}>{LABEL[method]}</Text>
                  <Text style={styles.note}>{method === "phone" ? viewer.phone : method === "email" ? viewer.email : ""}</Text>
                </View>
                {viewer.loginMethods.length > 1 && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${LABEL[method]}`}
                    disabled={busy}
                    onPress={() =>
                      run(async () => {
                        await requestStepUp();
                        setNewCode("");
                        setMode({ name: "remove", method });
                      })
                    }
                  >
                    <Text style={styles.danger}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity style={styles.secondary} onPress={() => setMode({ name: "phone" })} accessibilityRole="button">
              <Text style={styles.secondaryText}>{viewer.phone ? "Change phone number" : "Add a phone number"}</Text>
            </TouchableOpacity>
            {!viewer.loginMethods.includes("email") && (
              <TouchableOpacity style={styles.secondary} onPress={() => setMode({ name: "email" })} accessibilityRole="button">
                <Text style={styles.secondaryText}>Add email login</Text>
              </TouchableOpacity>
            )}
            {notice && <Text style={styles.ok}>{notice}</Text>}
          </>
        )}

        {mode.name === "phone" && (
          <>
            <Text style={styles.section}>{viewer.phone ? "New phone number" : "Phone number"}</Text>
            <Text style={styles.note}>
              {viewer.phone ? "We send a code to your current number and one to the new one." : "We send a code to this number."} Your other devices are signed out when it changes.
            </Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Mobile number" placeholderTextColor="#777" accessibilityLabel="New mobile number" />
            <Button
              label="Send codes"
              busy={busy}
              onPress={() => {
                const normalized = normalizePhone(phone);
                if (!normalized) return setError("Enter a valid mobile number.");
                void run(async () => {
                  await startPhoneChange(normalized);
                  setMode({ name: "phoneCodes", phone: normalized });
                });
              }}
            />
          </>
        )}

        {mode.name === "phoneCodes" && (
          <>
            <Text style={styles.section}>Enter the codes</Text>
            {viewer.phone && (
              <>
                <Text style={styles.note}>Code sent to {viewer.phone}</Text>
                <TextInput style={[styles.input, styles.code]} value={oldCode} onChangeText={digits(setOldCode)} keyboardType="number-pad" maxLength={6} accessibilityLabel="Code from your current number" />
              </>
            )}
            <Text style={styles.note}>Code sent to {mode.phone}</Text>
            <TextInput style={[styles.input, styles.code]} value={newCode} onChangeText={digits(setNewCode)} keyboardType="number-pad" maxLength={6} accessibilityLabel="Code from the new number" />
            <Button
              label="Change number"
              busy={busy}
              onPress={() => {
                if (newCode.length !== 6 || (viewer.phone && oldCode.length !== 6)) return setError("Enter the 6-digit codes.");
                void run(async () => {
                  await verifyPhoneChange({ phone: mode.phone, newCode, ...(viewer.phone ? { oldCode } : {}) });
                  setNotice("Phone number changed. Your other devices were signed out.");
                  setPhone("");
                  back();
                });
              }}
            />
          </>
        )}

        {mode.name === "email" && (
          <>
            <Text style={styles.section}>Add email login</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Email" placeholderTextColor="#777" accessibilityLabel="Email" />
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Password (10 or more characters)" placeholderTextColor="#777" accessibilityLabel="Password" />
            <Button
              label="Send code"
              busy={busy}
              onPress={() => {
                const normalized = normalizeEmail(email);
                if (!normalized) return setError("Enter a valid email address.");
                if (!isNewPasswordOk(password)) return setError("Choose a password of 10 to 128 characters.");
                void run(async () => {
                  await requestEmailCode(normalized);
                  setMode({ name: "emailCode", email: normalized, password });
                });
              }}
            />
          </>
        )}

        {mode.name === "emailCode" && (
          <>
            <Text style={styles.section}>Check your email</Text>
            <Text style={styles.note}>We sent a code to {mode.email}.</Text>
            <TextInput style={[styles.input, styles.code]} value={newCode} onChangeText={digits(setNewCode)} keyboardType="number-pad" maxLength={6} accessibilityLabel="6-digit code" />
            <Button
              label="Add email"
              busy={busy}
              onPress={() => {
                if (newCode.length !== 6) return setError("Enter the 6-digit code.");
                void run(async () => {
                  await addEmailMethod({ email: mode.email, code: newCode, password: mode.password });
                  setPassword("");
                  setNotice("Email login added.");
                  back();
                });
              }}
            />
          </>
        )}

        {mode.name === "remove" && (
          <>
            <Text style={styles.section}>Remove {LABEL[mode.method]}</Text>
            <Text style={styles.note}>Enter the code we sent you to confirm.</Text>
            <TextInput style={[styles.input, styles.code]} value={newCode} onChangeText={digits(setNewCode)} keyboardType="number-pad" maxLength={6} autoFocus accessibilityLabel="6-digit code" />
            <Button
              label="Remove"
              busy={busy}
              onPress={() => {
                if (newCode.length !== 6) return setError("Enter the 6-digit code.");
                void run(async () => {
                  await removeLoginMethod(mode.method, newCode);
                  setNotice(`${LABEL[mode.method]} removed.`);
                  back();
                });
              }}
            />
          </>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </View>
  );
}

function Button(props: { label: string; busy: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.primary, props.busy && styles.disabled]} disabled={props.busy} onPress={props.onPress} accessibilityRole="button">
      <Text style={styles.primaryText}>{props.busy ? "…" : props.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  center: { alignItems: "center", justifyContent: "center" },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 48, gap: 12 },
  back: { color: "#FFFFFF", fontSize: 32 },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", flex: 1 },
  body: { padding: 16, gap: 12 },
  section: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  text: { color: "#FFFFFF", fontSize: 15 },
  note: { color: "#B3B3B3", fontSize: 13 },
  ok: { color: "#5BD98A", fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  input: { backgroundColor: "#1A1A1A", color: "#FFFFFF", borderRadius: 10, paddingHorizontal: 14, height: 48, fontSize: 15 },
  code: { fontSize: 22, letterSpacing: 6, textAlign: "center" },
  primary: { backgroundColor: "#FFFFFF", borderRadius: 10, height: 50, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#000000", fontSize: 16, fontWeight: "700" },
  secondary: { backgroundColor: "#2A2A2A", borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  danger: { color: "#FF6B6B", fontSize: 14 },
  error: { color: "#FF6B6B", fontSize: 14 },
});
