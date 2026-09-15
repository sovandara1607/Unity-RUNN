import { useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
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
import { memberSinceLabel } from "../events/format";
import type { Me } from "../../services/api/types";

// A real, useful signal (a club staffer/admin's own account looks different
// from a runner's) rather than decoration -- omitted entirely for the
// ordinary USER role rather than showing an empty/default badge.
const ROLE_LABEL: Record<string, string> = {
  STAFF: "Staff",
  ADMIN: "Admin",
  SUPER_ADMIN: "Super Admin",
};

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
        paddingVertical: 16,
        paddingHorizontal: 18,
        minHeight: 44,
        opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
      })}
    >
      <Copy style={{ fontFamily: fonts.bold }}>{title}</Copy>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

/** A real photo when one exists (avatar_url), an honest initial otherwise --
 * never a generated/stock face. avatar_url isn't set from anywhere in this
 * app today, so this always shows the initial in practice, but the field is
 * real (Profile.avatar_url) and may be populated from the web/admin side. */
function Avatar({ name, uri }: { name: string; uri?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <View
      style={{
        width: 64,
        height: 64,
        borderRadius: 32,
        overflow: "hidden",
        backgroundColor: colors.lime,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: 64, height: 64 }} resizeMode="cover" />
      ) : (
        <Copy style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink }}>
          {initial}
        </Copy>
      )}
    </View>
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
  const fullName = profile.data?.profile?.full_name;
  const roleLabel = state.user?.role ? ROLE_LABEL[state.user.role] : undefined;
  return (
    <View
      style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.ink }}
    >
      <OfflineNotice />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }}>
        <Eyebrow>Unity Runn Club</Eyebrow>
        {state.status === "authenticated" ? (
          <Heading large numberOfLines={2} style={{ marginTop: 4 }}>
            {fullName ? fullName.toUpperCase() : "YOUR PROFILE."}
          </Heading>
        ) : (
          <Heading large style={{ marginTop: 4 }}>
            {"YOUR RUN\nSTARTS HERE."}
          </Heading>
        )}
        {state.status === "loading" ? (
          <View style={{ marginTop: 20 }}>
            <Feedback title="Restoring your session" message="Just a moment." />
          </View>
        ) : state.status === "unavailable" ? (
          <View style={{ marginTop: 20, gap: 12 }}>
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
          </View>
        ) : state.status === "authenticated" ? (
          <View style={{ marginTop: 20, gap: 16 }}>
            <View
              style={{
                backgroundColor: colors.canvas,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.line,
                padding: 18,
                flexDirection: "row",
                gap: 14,
                alignItems: "center",
              }}
            >
              <Avatar name={fullName || state.user?.email || "?"} uri={profile.data?.profile?.avatar_url} />
              <View style={{ flex: 1, gap: 4 }}>
                <Copy style={{ fontFamily: fonts.bold }} numberOfLines={1}>
                  {state.user?.email}
                </Copy>
                {profile.data?.profile?.created_at && (
                  <Copy style={{ color: colors.muted, fontSize: 12 }}>
                    {memberSinceLabel(profile.data.profile.created_at)}
                  </Copy>
                )}
                {roleLabel && (
                  <View
                    style={{
                      alignSelf: "flex-start",
                      backgroundColor: colors.blue,
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      marginTop: 2,
                    }}
                  >
                    <Copy style={{ color: colors.white, fontSize: 10, fontFamily: fonts.bold }}>
                      {roleLabel}
                    </Copy>
                  </View>
                )}
              </View>
            </View>

            {/* Only real, present fields -- a blank "Phone: -" row would be
                worse than no row at all. */}
            {(profile.data?.profile?.phone || profile.data?.profile?.tshirt_size) && (
              <View
                style={{
                  backgroundColor: colors.canvas,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.line,
                  padding: 16,
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 20,
                }}
              >
                {profile.data?.profile?.phone && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="call-outline" size={15} color={colors.muted} />
                    <Copy style={{ fontSize: 13 }}>{profile.data.profile.phone}</Copy>
                  </View>
                )}
                {profile.data?.profile?.tshirt_size && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="shirt-outline" size={15} color={colors.muted} />
                    <Copy style={{ fontSize: 13 }}>Shirt {profile.data.profile.tshirt_size}</Copy>
                  </View>
                )}
              </View>
            )}

            {profile.isError && (
              <View style={{ gap: 10 }}>
                <Copy accessibilityRole="alert">{profile.error.message}</Copy>
                <Button
                  secondary
                  title="Reload account"
                  onPress={() => {
                    void profile.refetch();
                  }}
                />
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              onPress={() => router.navigate("/(tabs)/wallet")}
              style={({ pressed }) => ({
                backgroundColor: colors.canvas,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.line,
                padding: 20,
                gap: 12,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="ticket-outline" size={20} color={colors.lime} />
                <Heading style={{ fontSize: 20, lineHeight: 24 }}>Race wallet</Heading>
              </View>
              <Copy style={{ color: colors.muted, fontSize: 13 }}>
                Your entries and race-day tickets, in one place.
              </Copy>
              <View
                style={{
                  backgroundColor: colors.lime,
                  borderRadius: 999,
                  minHeight: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 4,
                }}
              >
                <Copy style={{ color: colors.ink, fontFamily: fonts.bold, fontSize: 13 }}>
                  Open wallet →
                </Copy>
              </View>
            </Pressable>

            <View
              style={{
                backgroundColor: colors.canvas,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.line,
                overflow: "hidden",
              }}
            >
              <NavRow title="Edit profile" onPress={() => router.push("/profile/edit")} />
              <View style={{ height: 1, backgroundColor: colors.line, marginHorizontal: 18 }} />
              <NavRow title="Explore events" onPress={() => router.navigate("/(tabs)")} />
              <View style={{ height: 1, backgroundColor: colors.line, marginHorizontal: 18 }} />
              <NavRow
                title={busy ? "Signing out…" : "Sign out"}
                disabled={busy}
                onPress={() => {
                  void logout();
                }}
              />
            </View>
          </View>
        ) : (
          <View style={{ marginTop: 20, gap: 12 }}>
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
          </View>
        )}
        {Boolean(message) && (
          <Copy accessibilityRole="alert" style={{ marginTop: 12 }}>
            {message}
          </Copy>
        )}
      </ScrollView>
    </View>
  );
}
