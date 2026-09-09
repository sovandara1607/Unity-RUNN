import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import {
  Copy,
  Eyebrow,
  Feedback,
  Heading,
  LoadingCards,
  OfflineNotice,
} from "../../components/ui";
import { colors, fonts } from "../../constants/theme";
import { useSession } from "../../services/api/provider";
import { eventDate, money } from "../events/format";
import { useMyRegistrations } from "./queries";
import type { Registration } from "../../services/api/types";

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  PENDING: { bg: colors.lime, fg: colors.ink, label: "Payment due" },
  CONFIRMED: { bg: colors.ink, fg: colors.white, label: "Confirmed" },
  CANCELLED: { bg: colors.line, fg: colors.muted, label: "Cancelled" },
  REFUNDED: { bg: colors.line, fg: colors.muted, label: "Refunded" },
};

export default function WalletScreen() {
  const state = useSession();
  const query = useMyRegistrations();
  const insets = useSafeAreaInsets();

  const groups = useMemo(() => {
    const all = query.data || [];
    return {
      active: all.filter((r) => r.status === "PENDING" || r.status === "CONFIRMED"),
      closed: all.filter((r) => r.status === "CANCELLED" || r.status === "REFUNDED"),
    };
  }, [query.data]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.white, paddingTop: insets.top }}>
      <Stack.Screen options={{ title: "Race wallet" }} />
      <OfflineNotice />
      {state.status !== "authenticated" ? (
        <Feedback
          title="Your race wallet"
          message="Sign in to see your entries and race-day tickets."
          action="Sign in"
          onAction={() => router.push("/(auth)/login")}
        />
      ) : query.isLoading ? (
        <LoadingCards />
      ) : query.isError ? (
        <Feedback
          title="Could not load your entries"
          message={query.error.message}
          action="Try again"
          onAction={() => {
            void query.refetch();
          }}
        />
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => {
                void query.refetch();
              }}
            />
          }
          contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 60 }}
        >
          <Eyebrow>Unity Runn Club</Eyebrow>
          <Heading large>YOUR RACE{"\n"}WALLET.</Heading>
          {groups.active.length === 0 && groups.closed.length === 0 && (
            <Copy style={{ color: colors.muted, marginTop: 8 }}>
              No entries yet. Find a race on the Events tab and claim your place.
            </Copy>
          )}
          {groups.active.map((entry) => (
            <RegistrationCard key={entry.id} entry={entry} />
          ))}
          {groups.closed.length > 0 && (
            <>
              <Copy style={{ fontFamily: fonts.bold, marginTop: 20, color: colors.muted }}>
                Past &amp; cancelled
              </Copy>
              {groups.closed.map((entry) => (
                <RegistrationCard key={entry.id} entry={entry} />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function RegistrationCard({ entry }: { entry: Registration }) {
  const badge = STATUS_STYLE[entry.status] || STATUS_STYLE.PENDING;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/registrations/${entry.id}`)}
      style={{
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 18,
        padding: 18,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
        <Copy style={{ fontFamily: fonts.bold, flex: 1 }} numberOfLines={2}>
          {entry.event_name || entry.event?.name || "Race entry"}
        </Copy>
        <View
          style={{
            backgroundColor: badge.bg,
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 4,
            alignSelf: "flex-start",
          }}
        >
          <Copy style={{ color: badge.fg, fontSize: 10, fontFamily: fonts.bold }}>
            {badge.label}
          </Copy>
        </View>
      </View>
      <Copy style={{ color: colors.muted, fontSize: 13 }}>
        {entry.category_name || entry.category?.name || "Entry"}
        {entry.event?.event_date ? ` · ${eventDate(entry.event.event_date, true)}` : ""}
      </Copy>
      <Copy style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.muted }}>
        {entry.registration_number || entry.id.slice(0, 8)}
      </Copy>
      {entry.category && (
        <Copy style={{ fontSize: 12, color: colors.muted }}>
          {money(entry.category.price_cents, entry.category.currency)}
        </Copy>
      )}
    </Pressable>
  );
}
