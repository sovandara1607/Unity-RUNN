import { useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { Anton_400Regular } from "@expo-google-fonts/anton/400Regular";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { readConfig } from "../constants/config";
import { ApiProvider } from "../services/api/provider";
import { Feedback } from "../components/ui";
import { colors, fonts } from "../constants/theme";
export default function Layout() {
  const [config] = useState(() => {
    try {
      return { value: readConfig(), error: "" };
    } catch (error) {
      return {
        value: null,
        error:
          error instanceof Error ? error.message : "Configuration missing.",
      };
    }
  });
  const [loaded, fontError] = useFonts({
    Anton_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });
  if (!loaded && !fontError) return null;
  if (!config.value)
    return (
      <SafeAreaProvider>
        <View
          style={{ flex: 1, paddingTop: 70, backgroundColor: colors.ink }}
        >
          <Feedback title="Set up your connection" message={config.error} />
        </View>
      </SafeAreaProvider>
    );
  return (
    <SafeAreaProvider>
      <ApiProvider config={config.value}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerTintColor: colors.white,
            headerStyle: { backgroundColor: colors.ink },
            headerTitleStyle: { fontFamily: fonts.bold, color: colors.white },
            contentStyle: { backgroundColor: colors.ink },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/login" options={{ title: "Sign in" }} />
          <Stack.Screen
            name="(auth)/register"
            options={{ title: "Join the club" }}
          />
        </Stack>
      </ApiProvider>
    </SafeAreaProvider>
  );
}
