import React, { useEffect } from "react";
import { AppState } from "react-native";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/useColorScheme";
import { USE_MOCK_API } from "@/services/api";
import { loadAppConfig } from "@/services/appConfigService";
import { setLanguage } from "@/services/i18n";
import { useViewer } from "@/hooks/useViewer";
import { flushEvents } from "@/services/eventsService";
import { flushProgress } from "@/services/progressQueue";
import AppGate from "@/components/shared/AppGate";
import FirstRun from "@/components/shared/FirstRun";
import OfflineBanner from "@/components/shared/OfflineBanner";
import { checkFirstRun } from "@/services/firstRun";
import { getGate } from "@/services/appGate";
import { getViewer } from "@/services/session";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const viewerLanguage = useViewer()?.appLanguage;
  // The app speaks the language the viewer chose (until they choose, the one picked at first run).
  useEffect(() => {
    if (viewerLanguage) setLanguage(viewerLanguage);
  }, [viewerLanguage]);
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  // At start and whenever the app comes back: read the app config (minimum build, maintenance,
  // switches) and send watching positions the phone could not send earlier.
  useEffect(() => {
    if (USE_MOCK_API) return;
    let promptedAtLaunch = false;
    const refresh = () => {
      loadAppConfig().then(async () => {
        // First launch (or a changed privacy notice) before the app is used.
        await checkFirstRun();
        // The config can ask a guest to log in at launch: once per start of the app.
        if (!promptedAtLaunch && getGate().loginPromptAtLaunch && getViewer()?.kind !== "member") {
          promptedAtLaunch = true;
          router.push("/login" as any);
        }
      });
      void flushProgress();
    };
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
      if (state === "background") void flushEvents();
    });
    return () => subscription.remove();
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack initialRouteName="index">
        {/* home */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        {/* drama channel */}
        <Stack.Screen name="drama_channel" options={{ headerShown: false }} />
        {/* phone and login methods */}
        <Stack.Screen name="login_methods" options={{ headerShown: false }} />
        {/* settings */}
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        {/* coins */}
        <Stack.Screen name="wallet" options={{ headerShown: false }} />
        <Stack.Screen name="rewards" options={{ headerShown: false }} />
        {/* playing now */}
        <Stack.Screen name="streams" options={{ headerShown: false }} />
        {/* log in */}
        <Stack.Screen name="login" options={{ headerShown: false, presentation: "modal" }} />
        {/* series page, search, my list */}
        <Stack.Screen name="series" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ headerShown: false }} />
        <Stack.Screen name="my_list" options={{ headerShown: false }} />
        <Stack.Screen name="history" options={{ headerShown: false }} />
        <Stack.Screen name="report" options={{ headerShown: false }} />
        <Stack.Screen name="help" options={{ headerShown: false }} />
        <Stack.Screen name="help_article" options={{ headerShown: false }} />
        <Stack.Screen name="contact" options={{ headerShown: false }} />
        <Stack.Screen name="tickets" options={{ headerShown: false }} />
        <Stack.Screen name="ticket" options={{ headerShown: false }} />
        <Stack.Screen name="privacy" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        {/* see all / browse */}
        <Stack.Screen name="drama_all" options={{ headerShown: false }} />
        {/* drama player */}
        <Stack.Screen name="drama_player" options={{ headerShown: false }} />
        {/* not found */}
        <Stack.Screen name="+not-found" />
      </Stack>
      <OfflineBanner />
      <FirstRun />
      <AppGate />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
