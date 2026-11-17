import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError } from "@/services/api";
import { verifyPin } from "@/services/pinService";

/** What to say for a PIN that was refused; the API gives the tries left, or until when it is locked. */
export function pinMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const type = error.type.replace("urn:ott:error:", "");
    if (type === "pin-invalid") {
      const left = error.problem.attemptsLeft;
      return typeof left === "number"
        ? `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left.`
        : "Wrong PIN.";
    }
    if (type === "pin-locked") return "Too many wrong PINs. Try again later, or reset your PIN in Settings.";
    if (type === "pin-not-set") return "No PIN is set on this account.";
    return error.message;
  }
  return "Cannot reach the server. Check your connection.";
}

/** Asks for the parental PIN; calls `onVerified` once it is right so playback can be tried again. */
const PinPad: React.FC<{ onVerified: () => void }> = ({ onVerified }) => {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (value: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await verifyPin(value);
      onVerified();
    } catch (error) {
      setPin("");
      setMessage(pinMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter your PIN</Text>
      <Text style={styles.hint}>This episode needs your parental PIN.</Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, "").slice(0, 4);
          setPin(digits);
          if (digits.length === 4 && !busy) void submit(digits);
        }}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={4}
        autoFocus
        placeholder="••••"
        placeholderTextColor="#555"
        accessibilityLabel="4-digit PIN"
      />
      {busy && <ActivityIndicator color="#FFFFFF" />}
      {message && <Text style={styles.error}>{message}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: 12, padding: 24 },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  hint: { color: "#B3B3B3", fontSize: 14 },
  input: { backgroundColor: "#1A1A1A", color: "#FFFFFF", borderRadius: 10, width: 160, height: 56, fontSize: 28, letterSpacing: 12, textAlign: "center" },
  error: { color: "#FF6B6B", fontSize: 14, textAlign: "center" },
});

export default PinPad;
