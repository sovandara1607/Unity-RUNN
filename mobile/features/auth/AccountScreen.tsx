import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  Copy,
  Eyebrow,
  Feedback,
  Heading,
  OfflineNotice,
} from "../../components/ui";
import { colors } from "../../constants/theme";
import { useApi, useSession } from "../../services/api/provider";
import type { Me } from "../../services/api/types";
export default function AccountScreen() {
  const { session } = useApi();
  const state = useSession();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const profile = useQuery({
    queryKey: ["me", state.user?.id],
    enabled: state.status === "authenticated",
    queryFn: ({ signal }) => session.request<Me>("/api/v1/me/", { signal }),
  });
  const logout = async () => {
    setBusy(true);
    setMessage("");
    try {
      await session.logout();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not sign out.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View
      style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.white }}
    >
      <OfflineNotice />
      <ScrollView contentContainerStyle={{ padding: 26, gap: 24 }}>
        <Eyebrow>Unity Runn Club</Eyebrow>
        <Heading large>{"YOUR RUN\nSTARTS HERE."}</Heading>
        {state.status === "loading" ? (
          <Feedback title="Restoring your session" message="Just a moment." />
        ) : state.status === "unavailable" ? (
          <>
            <Copy>{state.message}</Copy>
            <Button
              title="Try reconnecting"
              onPress={() => {
                void session.restore();
              }}
            />
            <Button
              title="Sign out on this device"
              secondary
              busy={busy}
              onPress={() => {
                void logout();
              }}
            />
          </>
        ) : state.status === "authenticated" ? (
          <>
            <Heading>
              {profile.data?.profile?.full_name
                ? `Hi, ${profile.data.profile.full_name}`
                : "You’re signed in"}
            </Heading>
            <Copy>{state.user?.email}</Copy>
            {profile.isError && (
              <>
                <Copy accessibilityRole="alert">{profile.error.message}</Copy>
                <Button
                  secondary
                  title="Reload account"
                  onPress={() => {
                    void profile.refetch();
                  }}
                />
              </>
            )}
            <Copy style={{ color: colors.muted }}>
              Find your next event and get to know the route, the distance, and
              the crew.
            </Copy>
            <Button
              title="My race wallet"
              onPress={() => router.navigate("/(tabs)/wallet")}
            />
            <Button
              title="Edit profile"
              secondary
              onPress={() => router.push("/profile/edit")}
            />
            <Button
              title="Explore events"
              secondary
              onPress={() => router.navigate("/(tabs)")}
            />
            <Button
              title="Sign out"
              secondary
              busy={busy}
              onPress={() => {
                void logout();
              }}
            />
          </>
        ) : (
          <>
            <Copy style={{ color: colors.muted }}>
              A few miles feel different when you run them together. Sign in or
              join the club.
            </Copy>
            <Button
              title="Sign in"
              onPress={() => router.push("/(auth)/login")}
            />
            <Button
              title="Create account"
              secondary
              onPress={() => router.push("/(auth)/register")}
            />
          </>
        )}
        {Boolean(message) && <Copy accessibilityRole="alert">{message}</Copy>}
      </ScrollView>
    </View>
  );
}
