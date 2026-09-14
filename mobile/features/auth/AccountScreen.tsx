import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
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
import { colors, fonts } from "../../constants/theme";
import { useApi, useSession } from "../../services/api/provider";
import type { Me } from "../../services/api/types";
// Utility destinations (profile, browse, sign out) are low-frequency next to
// "My race wallet" -- listing them as an equal-weight button stack would give
// "Sign out" the same visual claim as the one thing people actually come back
// for. A plain row list demotes them without hiding them.
function NavRow({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress(): void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 18,
        minHeight: 44,
        borderTopWidth: 1,
        borderColor: colors.line,
        opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
      })}
    >
      <Copy style={{ fontFamily: fonts.bold }}>{title}</Copy>
      <Copy style={{ color: colors.muted, fontSize: 18 }}>›</Copy>
    </Pressable>
  );
}
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
      style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.ink }}
    >
      <OfflineNotice />
      <ScrollView contentContainerStyle={{ padding: 26, gap: 24, paddingBottom: 120 }}>
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
            <Pressable
              accessibilityRole="button"
              onPress={() => router.navigate("/(tabs)/wallet")}
              style={({ pressed }) => ({
                backgroundColor: colors.lime,
                borderRadius: 20,
                padding: 22,
                gap: 6,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Eyebrow style={{ color: colors.ink }}>Race wallet</Eyebrow>
              <Heading style={{ color: colors.ink, fontSize: 26, lineHeight: 30 }}>
                Your entries &amp; race-day tickets
              </Heading>
              <Copy style={{ color: colors.ink }}>Open wallet →</Copy>
            </Pressable>
            <View>
              <NavRow title="Edit profile" onPress={() => router.push("/profile/edit")} />
              <NavRow title="Explore events" onPress={() => router.navigate("/(tabs)")} />
              <NavRow
                title={busy ? "Signing out…" : "Sign out"}
                disabled={busy}
                onPress={() => {
                  void logout();
                }}
              />
            </View>
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
