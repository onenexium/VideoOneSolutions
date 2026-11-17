import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { useViewer } from "@/hooks/useViewer";
import { USE_MOCK_API } from "@/services/api";
import { colors } from "@/constants/theme";

/**
 * "Log in" (or "Finish sign-up") in Home's header while logged out. Nothing once logged in: the
 * account lives in the Profile tab.
 */
const AccountButton: React.FC = () => {
  const viewer = useViewer();
  if (USE_MOCK_API) return null; // the mock catalogue has no accounts
  if (viewer?.kind === "member" && viewer.status !== "onboarding") return null;
  const onboarding = viewer?.status === "onboarding";
  return (
    <TouchableOpacity
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={onboarding ? "Finish sign-up" : "Log in"}
      onPress={() => router.push("/login" as any)}
    >
      <Text style={styles.text}>{onboarding ? "Finish sign-up" : "Log in"}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: { height: 40, paddingHorizontal: 18, borderRadius: 20, backgroundColor: colors.accent, justifyContent: "center" },
  text: { color: colors.onAccent, fontSize: 14, fontWeight: "700" },
});

export default AccountButton;
