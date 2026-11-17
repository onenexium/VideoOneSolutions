import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOffline } from "@/hooks/useOffline";
import { loadAppConfig } from "@/services/appConfigService";
import { useT } from "@/services/i18n";

/** A thin bar while the API cannot be reached; Retry asks again (any answer clears it). */
const OfflineBanner: React.FC = () => {
  const offline = useOffline();
  const t = useT();
  const insets = useSafeAreaInsets();
  if (!offline) return null;
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]} accessibilityLiveRegion="polite">
      <Text style={styles.text}>{t("offline.message")}</Text>
      <TouchableOpacity onPress={() => void loadAppConfig()} accessibilityRole="button" accessibilityLabel="Retry">
        <Text style={styles.retry}>{t("common.retry")}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 9400, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16, backgroundColor: "#7A2E2E", paddingBottom: 6 },
  text: { color: "#FFFFFF", fontSize: 13 },
  retry: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", textDecorationLine: "underline" },
});

export default OfflineBanner;
