import { useMemo, useState } from "react";
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
import { useActiveLiveActivities, useFollowLive, useMyRegistrations, useUnfollowLive } from "./queries";
import { LiveActivityError } from "../../services/liveActivity/types";
import type { LiveActivityRecord, Registration } from "../../services/api/types";

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  PENDING: { bg: colors.lime, fg: colors.ink, label: "Payment due" },
  CONFIRMED: { bg: colors.blue, fg: colors.white, label: "Confirmed" },
  CANCELLED: { bg: colors.canvas, fg: colors.muted, label: "Cancelled" },
  REFUNDED: { bg: colors.canvas, fg: colors.muted, label: "Refunded" },
};

export default function WalletScreen() {
  const state = useSession();
  const query = useMyRegistrations();
  // A registered-but-not-followed CONFIRMED entry is the common case, so this
  // is fetched once for the whole list rather than per-card -- see
  // useActiveLiveActivities's own staleTime for why re-render churn isn't a
  // concern.
  const liveActivities = useActiveLiveActivities();
  const insets = useSafeAreaInsets();

  const groups = useMemo(() => {
    const all = query.data || [];
    return {
      active: all.filter((r) => r.status === "PENDING" || r.status === "CONFIRMED"),
      closed: all.filter((r) => r.status === "CANCELLED" || r.status === "REFUNDED"),
    };
  }, [query.data]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, paddingTop: insets.top }}>
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
          // Native tab bar floats over the content on iOS -- 120pt clears it
          // with room to spare, so the last card is never trapped underneath.
          contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 120 }}
        >
          <Eyebrow>Unity Runn Club</Eyebrow>
          <Heading large>YOUR RACE{"\n"}WALLET.</Heading>
          {groups.active.length === 0 && groups.closed.length === 0 && (
            <Copy style={{ color: colors.muted, marginTop: 8 }}>
              No entries yet. Find a race on the Events tab and claim your place.
            </Copy>
          )}
          {groups.active.map((entry) => (
            <RegistrationCard
              key={entry.id}
              entry={entry}
              liveActivity={liveActivities.data?.find((a) => a.event_id === entry.event_id)}
            />
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

function RegistrationCard({
  entry,
  liveActivity,
}: {
  entry: Registration;
  liveActivity?: LiveActivityRecord;
}) {
  const badge = STATUS_STYLE[entry.status] || STATUS_STYLE.PENDING;
  // CONFIRMED is the one entry with a real artifact behind it (the QR ticket
  // staff scan on race day) -- it gets a raised card and its own affordance.
  // PENDING is the one entry that needs the runner to act right now -- it
  // gets a lime nudge instead of blending into the list. CANCELLED/REFUNDED
  // are archival: same shape, lower weight, no affordance to chase.
  const isConfirmed = entry.status === "CONFIRMED";
  const isPending = entry.status === "PENDING";
  const followLive = useFollowLive();
  const unfollowLive = useUnfollowLive();
  const [followError, setFollowError] = useState("");
  const onUnfollowLive = () => {
    if (!liveActivity) return;
    setFollowError("");
    unfollowLive.mutate(
      { id: liveActivity.id, activityId: liveActivity.activity_id },
      {
        onError: (error) => {
          setFollowError(
            error instanceof LiveActivityError ? error.message : "Could not stop following.",
          );
        },
      },
    );
  };
  const onFollowLive = () => {
    if (!entry.event) return;
    setFollowError("");
    followLive.mutate(
      {
        registrationId: entry.id,
        data: {
          eventId: entry.event_id,
          eventName: entry.event_name || entry.event.name,
          location: entry.event.location,
          raceDistance: entry.category?.distance,
          startTime: entry.event.start_time,
          status: "upcoming",
          bibNumber: entry.registration_number,
        },
      },
      {
        onError: (error) => {
          // "unsupported_device" is the expected, honest failure mode today
          // (see nativeBridge.ts) -- surfaced plainly rather than hidden,
          // per the brief's "handle errors gracefully" without pretending
          // the feature works. The rest of the wallet stays fully usable.
          setFollowError(
            error instanceof LiveActivityError
              ? error.message
              : "Could not start Follow Live.",
          );
        },
      },
    );
  };
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/registrations/${entry.id}`)}
      style={{
        borderWidth: 1,
        borderColor: isConfirmed ? colors.blue : colors.line,
        backgroundColor: isConfirmed ? colors.canvas : undefined,
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
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: isConfirmed || isPending ? 4 : 0,
        }}
      >
        <Copy
          style={{
            fontFamily: fonts.bold,
            fontSize: isConfirmed ? 15 : 12,
            color: isConfirmed ? colors.white : colors.muted,
            letterSpacing: isConfirmed ? 0.5 : 0,
          }}
        >
          {entry.registration_number || entry.id.slice(0, 8)}
        </Copy>
        {isConfirmed && (
          <Copy style={{ color: colors.blueText, fontFamily: fonts.bold, fontSize: 12 }}>
            View ticket →
          </Copy>
        )}
        {isPending && (
          <Copy style={{ color: colors.lime, fontFamily: fonts.bold, fontSize: 12 }}>
            Finish payment →
          </Copy>
        )}
      </View>
      {!isConfirmed && !isPending && entry.category && (
        <Copy style={{ fontSize: 12, color: colors.muted }}>
          {money(entry.category.price_cents, entry.category.currency)}
        </Copy>
      )}
      {isConfirmed && (
        <View style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 10, marginTop: 2 }}>
          {!liveActivity ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Follow Live"
              disabled={followLive.isPending}
              // Stops the tap from also triggering the card's own onPress
              // (navigate to registration detail) -- see RN's responder
              // chain: the innermost Pressable under the touch claims it.
              onPress={onFollowLive}
              style={({ pressed }) => ({
                minHeight: 40,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.lime,
                alignItems: "center",
                justifyContent: "center",
                opacity: followLive.isPending ? 0.5 : pressed ? 0.7 : 1,
              })}
            >
              <Copy style={{ color: colors.lime, fontFamily: fonts.bold, fontSize: 13 }}>
                {followLive.isPending ? "Starting…" : "Follow Live on Lock Screen →"}
              </Copy>
            </Pressable>
          ) : (
            <View
              style={{
                minHeight: 32,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Copy
                style={{
                  fontFamily: fonts.bold,
                  fontSize: 12,
                  color: liveActivity.race_status === "LIVE" ? colors.lime : colors.muted,
                }}
              >
                {FOLLOW_LIVE_STATE_LABEL[liveActivity.race_status]}
              </Copy>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop following this race"
                disabled={unfollowLive.isPending}
                // Same responder-chain reasoning as the Follow Live button
                // above: this must claim the tap before the card's own
                // onPress does.
                onPress={onUnfollowLive}
                hitSlop={8}
                style={({ pressed }) => ({
                  opacity: unfollowLive.isPending ? 0.5 : pressed ? 0.6 : 1,
                })}
              >
                <Copy style={{ color: colors.muted, fontSize: 11, textDecorationLine: "underline" }}>
                  {unfollowLive.isPending ? "Stopping…" : "Not watching? Stop following"}
                </Copy>
              </Pressable>
            </View>
          )}
          {Boolean(followError) && (
            <Copy accessibilityRole="alert" style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>
              {followError}
            </Copy>
          )}
        </View>
      )}
    </Pressable>
  );
}
// Every RaceLiveActivityStatus mapped to its Race Wallet button label (item
// 9's Follow Live / Following / Live Now / Finished states). UPCOMING,
// CHECK_IN, and STARTING all read as "Following" here -- the wallet doesn't
// need the Dynamic Island's finer-grained states, only "are they following
// or not, and is it live right now."
const FOLLOW_LIVE_STATE_LABEL: Record<string, string> = {
  UPCOMING: "Following this race",
  CHECK_IN: "Following this race",
  STARTING: "About to start — following",
  LIVE: "You're live now",
  FINISHED: "Finished — nice work",
  CANCELLED: "Cancelled",
};
