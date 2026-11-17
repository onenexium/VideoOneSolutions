import React from "react";
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Constants from "expo-constants";
import { useAppGate } from "@/hooks/useAppGate";
import { router, useSegments } from "expo-router";
import { useViewer } from "@/hooks/useViewer";
import { dismissUpdate, loadAppConfig } from "@/services/appConfigService";
import { useT } from "@/services/i18n";
import { colors } from "@/constants/theme";

/** Where this build's store page is. iOS needs EXPO_PUBLIC_STORE_URL_IOS (the App Store id is not known yet). */
function storeUrl(): string | null {
  if (Platform.OS === "ios") return process.env.EXPO_PUBLIC_STORE_URL_IOS ?? null;
  if (process.env.EXPO_PUBLIC_STORE_URL_ANDROID) return process.env.EXPO_PUBLIC_STORE_URL_ANDROID;
  const id = Constants.expoConfig?.android?.package;
  return id ? `https://play.google.com/store/apps/details?id=${id}` : null;
}

/**
 * Covers the app when it cannot be used: this build is too old, or the service is in maintenance.
 * A newer build that is merely available is a small dismissible banner, once per version.
 */
const AppGate: React.FC = () => {
  const gate = useAppGate();
  const t = useT();
  const viewer = useViewer();
  const onLogin = useSegments()[0] === "login"; // the login screen itself must stay reachable
  const url = storeUrl();

  if (gate.updateRequired) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{t("gate.update.title")}</Text>
        <Text style={styles.body}>{t("gate.update.body")}</Text>
        {url && (
          <TouchableOpacity style={styles.button} accessibilityRole="button" onPress={() => Linking.openURL(url)}>
            <Text style={styles.buttonText}>{t("common.update")}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (gate.maintenance) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{t("gate.maintenance.title")}</Text>
        <Text style={styles.body}>
          {gate.maintenance.message ?? t("gate.maintenance.body")}
        </Text>
        <TouchableOpacity style={styles.button} accessibilityRole="button" onPress={() => void loadAppConfig()}>
          <Text style={styles.buttonText}>{t("common.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Guest mode is off: nothing to browse until the viewer logs in.
  if (gate.loginRequired && viewer?.kind !== "member" && !onLogin) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{t("gate.login.title")}</Text>
        <Text style={styles.body}>{t("gate.login.body")}</Text>
        <TouchableOpacity style={styles.button} accessibilityRole="button" onPress={() => router.push("/login" as any)}>
          <Text style={styles.buttonText}>{t("gate.login.button")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (gate.updateAvailable) {
    const version = gate.updateAvailable;
    return (
      <View style={styles.banner}>
        <Text style={styles.bannerText}>{t("gate.newVersion")}</Text>
        {url && (
          <TouchableOpacity onPress={() => Linking.openURL(url)} accessibilityRole="button">
            <Text style={styles.bannerAction}>{t("common.update")}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => void dismissUpdate(version)} accessibilityRole="button" accessibilityLabel="Not now">
          <Text style={styles.bannerDismiss}>{t("common.notNow")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, zIndex: 10000, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  title: { color: colors.text, fontSize: 24, fontWeight: "700", textAlign: "center" },
  body: { color: colors.textMuted, fontSize: 15, textAlign: "center", lineHeight: 22 },
  button: { backgroundColor: colors.accent, borderRadius: 10, height: 50, paddingHorizontal: 40, alignItems: "center", justifyContent: "center" },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
  banner: { position: "absolute", top: 48, left: 16, right: 16, zIndex: 9000, flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: colors.surfaceHigh, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  bannerText: { color: colors.text, fontSize: 13, flex: 1 },
  bannerAction: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  bannerDismiss: { color: colors.textMuted, fontSize: 13 },
});

export default AppGate;
