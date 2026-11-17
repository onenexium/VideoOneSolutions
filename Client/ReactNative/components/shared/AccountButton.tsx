import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useViewer } from "@/hooks/useViewer";
import { logout } from "@/services/authService";
import { USE_MOCK_API } from "@/services/api";

/** "Log in" for a guest; for a member, their number, which opens the account menu. */
const AccountButton: React.FC = () => {
  const viewer = useViewer();
  const [open, setOpen] = useState(false);
  if (USE_MOCK_API) {
    return null; // the mock catalogue has no accounts
  }

  if (viewer?.kind === "member" && viewer.status !== "onboarding") {
    const label = viewer.phone ? `${viewer.phone.slice(0, 3)}••••${viewer.phone.slice(-3)}` : "Account";
    const go = (path: string) => {
      setOpen(false);
      router.push(path as any);
    };
    return (
      <>
        <TouchableOpacity style={styles.pill} accessibilityRole="button" accessibilityLabel="Account" onPress={() => setOpen(true)}>
          <Text style={styles.text}>{label}</Text>
        </TouchableOpacity>
        <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
            <View style={styles.menu}>
              <Text style={styles.menuTitle}>{viewer.phone ?? "Account"}</Text>
              <MenuItem label="Wallet" onPress={() => go("/wallet")} />
              <MenuItem label="Free coins" onPress={() => go("/rewards")} />
              <MenuItem label="Playing now" onPress={() => go("/streams")} />
              <MenuItem label="Settings" onPress={() => go("/settings")} />
              <MenuItem label="Help" onPress={() => go("/help")} />
              <MenuItem
                label="Log out"
                danger
                onPress={() => {
                  setOpen(false);
                  void logout();
                }}
              />
            </View>
          </Pressable>
        </Modal>
      </>
    );
  }

  return (
    <TouchableOpacity
      style={styles.pill}
      accessibilityRole="button"
      accessibilityLabel="Log in"
      onPress={() => router.push("/login" as any)}
    >
      <Text style={styles.text}>{viewer?.status === "onboarding" ? "Finish sign-up" : "Log in"}</Text>
    </TouchableOpacity>
  );
};

function MenuItem(props: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={styles.item} onPress={props.onPress} accessibilityRole="button">
      <Text style={[styles.itemText, props.danger && styles.danger]}>{props.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  text: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-start", alignItems: "flex-end", paddingTop: 90, paddingRight: 16 },
  menu: { backgroundColor: "#1E1E1E", borderRadius: 12, minWidth: 200, paddingVertical: 8 },
  menuTitle: { color: "#B3B3B3", fontSize: 12, paddingHorizontal: 16, paddingVertical: 8 },
  item: { paddingHorizontal: 16, paddingVertical: 12 },
  itemText: { color: "#FFFFFF", fontSize: 15 },
  danger: { color: "#FF6B6B" },
});

export default AccountButton;
