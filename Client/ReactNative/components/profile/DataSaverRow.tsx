import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { getDataSaver, loadPlaybackSettings, setDataSaver } from "@/services/playbackSettings";
import { colors } from "@/constants/theme";

/** The data saver switch (kept on the phone, so it works logged out too). */
export default function DataSaverRow() {
  const [saver, setSaver] = useState(getDataSaver());
  useEffect(() => {
    loadPlaybackSettings().then(() => setSaver(getDataSaver()));
  }, []);
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Text style={styles.text}>Data saver</Text>
        <Text style={styles.note}>Plays at 360p at most to use less data.</Text>
      </View>
      <Switch
        value={saver}
        onValueChange={(on) => {
          setSaver(on);
          void setDataSaver(on);
        }}
        trackColor={{ true: colors.accent, false: colors.surfaceHigh }}
        thumbColor={colors.text}
        accessibilityLabel="Data saver"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, gap: 12 },
  flex: { flex: 1 },
  text: { color: colors.text, fontSize: 15 },
  note: { color: colors.textMuted, fontSize: 12 },
});
