import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useViewer } from "@/hooks/useViewer";
import { logout } from "@/services/authService";
import { getWallet } from "@/services/walletService";
import Gradient from "@/components/ui/Gradient";
import DataSaverRow from "./DataSaverRow";
import { colors } from "@/constants/theme";

const go = (path: string) => () => router.push(path as any);

/**
 * The Profile tab on Home. Logged out (a guest, or a sign-up not finished): what works without an
 * account, under a big Log in button. Logged in: the whole account (coins, history, devices,
 * notifications, privacy, settings, help).
 */
export default function ProfileView({ bottomInset = 0 }: { bottomInset?: number }) {
  const insets = useSafeAreaInsets();
  const viewer = useViewer();
  const member = viewer?.kind === "member" && viewer.status !== "onboarding";
  const [coins, setCoins] = useState<number | null>(null);

  // The balance is the server's, read again whenever Profile is shown (coins are spent elsewhere).
  useFocusEffect(
    useCallback(() => {
      if (!member) return;
      let live = true;
      getWallet()
        .then((w) => live && setCoins(w.total))
        .catch(() => undefined); // the row still opens the wallet
      return () => {
        live = false;
      };
    }, [member]),
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.body, { paddingTop: insets.top + 8, paddingBottom: bottomInset + 24 }]}
    >
      <Text style={styles.title} accessibilityRole="header">
        Profile
      </Text>

      {member ? (
        <>
          <View style={styles.account}>
            <Text style={styles.name}>{viewer.displayName || "Your account"}</Text>
            {(viewer.phone || viewer.email) && <Text style={styles.note}>{viewer.phone ?? viewer.email}</Text>}
          </View>
          <TouchableOpacity style={styles.promo} onPress={go("/rewards")} accessibilityRole="button">
            <Gradient borderRadius={14} />
            <Text style={styles.promoTitle}>Free coins every day</Text>
            <Text style={styles.promoText}>Check in to claim your coins for today</Text>
          </TouchableOpacity>
          <Section title="Coins">
            <Row label="Wallet" value={coins === null ? undefined : `${coins} coins`} onPress={go("/wallet")} />
            <Row label="Free coins" onPress={go("/rewards")} />
          </Section>
          <Section title="Watching">
            <Row label="Watch history" onPress={go("/history")} />
            <Row label="Playing now" onPress={go("/streams")} />
            <DataSaverRow />
          </Section>
          <Section title="Account">
            <Row label="Settings" hint="Name, languages, devices, login methods" onPress={go("/settings")} />
            <Row label="Notifications" onPress={go("/notifications")} />
            <Row label="Privacy" onPress={go("/privacy")} />
          </Section>
          <Section title="Support">
            <Row label="Help and support" onPress={go("/help")} />
          </Section>
          <TouchableOpacity style={styles.logout} onPress={() => void logout()} accessibilityRole="button">
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>
              {viewer?.status === "onboarding" ? "Finish signing up" : "Log in to get the full app"}
            </Text>
            <Text style={styles.note}>
              Keep your list and history on every phone, get coins and daily rewards, and manage your devices, privacy and
              notifications.
            </Text>
            <TouchableOpacity
              style={styles.loginButton}
              onPress={go("/login")}
              accessibilityRole="button"
              accessibilityLabel={viewer?.status === "onboarding" ? "Finish sign-up" : "Log in"}
            >
              <Gradient borderRadius={12} />
              <Text style={styles.loginButtonText}>{viewer?.status === "onboarding" ? "Finish sign-up" : "Log in"}</Text>
            </TouchableOpacity>
          </View>
          <Section title="Watching">
            <Row label="Watch history" onPress={go("/history")} />
            <DataSaverRow />
          </Section>
          <Section title="Support">
            <Row label="Help and support" hint="Answers, contact us, terms and policies" onPress={go("/help")} />
          </Section>
        </>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row(props: { label: string; hint?: string; value?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.row} onPress={props.onPress} accessibilityRole="button" accessibilityLabel={props.label}>
      <View style={styles.flex}>
        <Text style={styles.text}>{props.label}</Text>
        {props.hint && <Text style={styles.note}>{props.hint}</Text>}
      </View>
      {props.value && <Text style={styles.value}>{props.value}</Text>}
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: 16, gap: 16 },
  flex: { flex: 1 },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" },
  account: { gap: 2 },
  name: { color: colors.text, fontSize: 20, fontWeight: "700" },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  promo: { borderRadius: 14, padding: 16, gap: 4, overflow: "hidden", backgroundColor: colors.accent },
  promoTitle: { color: colors.onAccent, fontSize: 17, fontWeight: "700" },
  promoText: { color: colors.onAccent, fontSize: 13 },
  loginCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 20, gap: 12 },
  loginTitle: { color: colors.text, fontSize: 20, fontWeight: "700" },
  loginButton: {
    height: 56,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  loginButtonText: { color: colors.onAccent, fontSize: 17, fontWeight: "700" },
  section: { gap: 8 },
  sectionTitle: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  card: { backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", minHeight: 52, gap: 12 },
  text: { color: colors.text, fontSize: 15 },
  value: { color: colors.gold, fontSize: 14 },
  chevron: { color: colors.textMuted, fontSize: 22 },
  logout: { height: 48, borderRadius: 12, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: "600" },
});
