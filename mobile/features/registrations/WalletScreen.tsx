import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import QRCode from "react-native-qrcode-svg";
import {
  Copy,
  Eyebrow,
  Feedback,
  Heading,
  LoadingCards,
  OfflineNotice,
} from "../../components/ui";
import { cardEntering } from "../../components/motion";
import { colors, fonts } from "../../constants/theme";
import { useSession } from "../../services/api/provider";
import { eventDate, memberSinceLabel, money } from "../events/format";
import { useActiveLiveActivities, useFollowLive, useMyRegistrations, useUnfollowLive } from "./queries";
import { LiveActivityError } from "../../services/liveActivity/types";
import type { LiveActivityRecord, Registration } from "../../services/api/types";

// Every RaceLiveActivityStatus mapped to its Race Wallet button label -- the
// wallet doesn't need the Dynamic Island's finer-grained states, only "are
// they following or not, and is it live right now."
const FOLLOW_LIVE_STATE_LABEL: Record<string, string> = {
  UPCOMING: "Following this race",
  CHECK_IN: "Following this race",
  STARTING: "About to start, following",
  LIVE: "You're live now",
  FINISHED: "Finished, nice work",
  CANCELLED: "Cancelled",
};

const STATUS_WORD: Record<string, string> = {
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

type WalletHeaderStats = {
  /** Ready to render as-is, already uppercased (Anton has no real lowercase
   * treatment elsewhere in the app either). */
  headlineName: string;
  /** Ready to render as-is -- built with format.ts's memberSinceLabel(). */
  memberSince: string;
  /** e.g. "3 distances raced". Null omits the clause entirely rather than
   * showing a false "0 distances". */
  distancesRacedLabel: string | null;
};

// Derives the header's identity stats from the runner's own registrations.
// Only ever called with a non-empty array (see the call site).
function computeWalletHeaderStats(registrations: Registration[]): WalletHeaderStats {
  let newest = registrations[0];
  let oldest = registrations[0];
  for (const entry of registrations) {
    if (entry.created_at > newest.created_at) newest = entry;
    if (entry.created_at < oldest.created_at) oldest = entry;
  }
  const distances = new Set(
    registrations
      .filter((entry) => entry.status === "CONFIRMED")
      .map((entry) => entry.category?.distance || entry.category_name)
      .filter((value): value is string => Boolean(value)),
  );
  return {
    headlineName: newest.full_name.toUpperCase(),
    memberSince: memberSinceLabel(oldest.created_at),
    distancesRacedLabel:
      distances.size > 0 ? `${distances.size} distance${distances.size === 1 ? "" : "s"} raced` : null,
  };
}

/** The one looping motion this screen allows, per the antislop brief: a real
 * LIVE race_status, nowhere else. Opacity only, no scale/glow -- a fact
 * being restated, not an attention grab. */
function LiveDot() {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.35, { duration: 700 }), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      style={[
        { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.lime, marginRight: 6 },
        style,
      ]}
    />
  );
}

function YearDivider({ year }: { year: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 20, marginBottom: 14 }}>
      <Copy style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.muted }}>{year}</Copy>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line, marginLeft: 10 }} />
    </View>
  );
}

function WalletHeader({ stats }: { stats: WalletHeaderStats | null }) {
  const metaLine = stats
    ? [stats.memberSince, stats.distancesRacedLabel].filter(Boolean).join(" · ")
    : "";
  return (
    <View>
      <Eyebrow>Unity Runn Club</Eyebrow>
      <Animated.View entering={FadeInDown.duration(320).easing(Easing.out(Easing.quad))}>
        <Heading numberOfLines={2} style={{ fontSize: 44, lineHeight: 50, marginTop: 4 }}>
          {stats ? stats.headlineName : "YOUR RUNNING RECORD."}
        </Heading>
      </Animated.View>
      {Boolean(metaLine) && (
        <Copy style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.muted, marginTop: 6 }}>
          {metaLine}
        </Copy>
      )}
      <View style={{ height: 1, backgroundColor: colors.line, marginTop: 20, marginBottom: 20 }} />
    </View>
  );
}

/** The exact Follow Live / Following / Stop following behavior fixed earlier
 * this session (the {id, activityId} LiveActivityRef split), now living
 * inside the ticket stub's main zone instead of a boxed footer panel. */
function LiveFollowRow({
  entry,
  liveActivity,
}: {
  entry: Registration;
  liveActivity?: LiveActivityRecord;
}) {
  const followLive = useFollowLive();
  const unfollowLive = useUnfollowLive();
  const [followError, setFollowError] = useState("");

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
          // (see nativeBridge.ts) -- surfaced plainly rather than hidden.
          setFollowError(
            error instanceof LiveActivityError ? error.message : "Could not start Follow Live.",
          );
        },
      },
    );
  };
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

  return (
    <View style={{ marginTop: 8 }}>
      {!liveActivity ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Follow Live"
          disabled={followLive.isPending}
          // Claims the tap before the card's own onPress (navigate to the
          // registration detail) -- RN's responder chain resolves to the
          // deepest Pressable under the touch regardless of what its parent is.
          onPress={onFollowLive}
          hitSlop={6}
          style={({ pressed }) => ({ opacity: followLive.isPending ? 0.5 : pressed ? 0.7 : 1 })}
        >
          <Copy style={{ color: colors.lime, fontFamily: fonts.bold, fontSize: 12 }}>
            {followLive.isPending ? "Starting…" : "Follow Live on Lock Screen →"}
          </Copy>
        </Pressable>
      ) : (
        // Stacked, not side-by-side -- the zone is only 72% of the card's
        // width, and "About to start, following" + "Not watching? Stop
        // following" together don't reliably fit one row without either
        // clipping or losing the gap between them (confirmed by screenshot,
        // not just reasoned about: a same-row layout rendered the two
        // strings glued together with no visible space).
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {liveActivity.race_status === "LIVE" && <LiveDot />}
            <Copy
              style={{
                fontFamily: fonts.bold,
                fontSize: 12,
                color: liveActivity.race_status === "LIVE" ? colors.lime : colors.muted,
              }}
            >
              {FOLLOW_LIVE_STATE_LABEL[liveActivity.race_status]}
            </Copy>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop following this race"
            disabled={unfollowLive.isPending}
            onPress={onUnfollowLive}
            hitSlop={8}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
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
        <Copy accessibilityRole="alert" style={{ color: colors.error, fontSize: 11, marginTop: 4 }}>
          {followError}
        </Copy>
      )}
    </View>
  );
}

/** The one entry with a real artifact behind it (the race-day QR ticket) --
 * a two-zone card with its own dedicated typographic zone for
 * registration_number, the way a real kit tag would carry a bib number. */
function TicketStub({
  entry,
  index,
  liveActivity,
}: {
  entry: Registration;
  index: number;
  liveActivity?: LiveActivityRecord;
}) {
  const qrValue = entry.registration_number || entry.id;
  return (
    <Animated.View entering={cardEntering(index)} style={{ marginBottom: 14 }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/registrations/${entry.id}`)}
        style={{
          flexDirection: "row",
          backgroundColor: colors.canvas,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 18,
          minHeight: 132,
          overflow: "hidden",
        }}
      >
        <View style={{ flex: 0.72, padding: 16, gap: 6, justifyContent: "center" }}>
          <Copy style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.white }} numberOfLines={2}>
            {entry.event_name || entry.event?.name || "Race entry"}
          </Copy>
          <Copy style={{ fontSize: 13, color: colors.muted }}>
            {entry.category_name || entry.category?.name || "Entry"}
            {entry.event?.event_date ? ` · ${eventDate(entry.event.event_date, true)}` : ""}
          </Copy>
          <Copy style={{ fontSize: 12, color: colors.muted }}>
            {entry.full_name}
            {entry.tshirt_size ? ` · Shirt ${entry.tshirt_size}` : ""}
          </Copy>
          <LiveFollowRow entry={entry} liveActivity={liveActivity} />
        </View>
        <View style={{ width: 1, backgroundColor: colors.line }} />
        <View style={{ flex: 0.28, padding: 12, alignItems: "center", justifyContent: "center", gap: 6 }}>
          {Boolean(entry.checked_in_at) && (
            <View
              style={{
                backgroundColor: colors.blue,
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Copy style={{ color: colors.white, fontSize: 9, fontFamily: fonts.bold }}>
                CHECKED IN
              </Copy>
            </View>
          )}
          <Copy
            style={{
              fontFamily: fonts.bold,
              fontSize: 15,
              color: colors.white,
              letterSpacing: 0.5,
              textAlign: "center",
            }}
          >
            {entry.registration_number || entry.id.slice(0, 8)}
          </Copy>
          <Copy style={{ fontSize: 10, color: colors.muted }}>BIB NO.</Copy>
          <View style={{ backgroundColor: colors.white, borderRadius: 6, padding: 4 }}>
            <QRCode value={qrValue} size={40} color={colors.ink} />
          </View>
          <Copy style={{ color: colors.blueText, fontFamily: fonts.bold, fontSize: 11 }}>
            View ticket →
          </Copy>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** A closed attempt stays genuinely in the record (a logbook doesn't tear
 * out a page) but nothing here is actionable, so it's a plain row, not
 * another card -- the same registration_number that's hero-sized on a
 * CONFIRMED stub is a footnote here, on purpose. */
function LedgerLine({ entry, index }: { entry: Registration; index: number }) {
  const statusWord = STATUS_WORD[entry.status] || entry.status;
  return (
    <Animated.View entering={cardEntering(index)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${statusWord}: ${entry.event_name || entry.event?.name || "Race entry"}`}
        onPress={() => router.push(`/registrations/${entry.id}`)}
        style={({ pressed }) => ({
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderColor: colors.line,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Copy style={{ fontFamily: fonts.body, fontSize: 14, color: colors.white }}>
          {entry.event_name || entry.event?.name || "Race entry"}
          <Copy style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.muted }}>
            {" · "}
            {statusWord}
          </Copy>
        </Copy>
        <Copy style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
          {entry.registration_number || entry.id.slice(0, 8)}
          {" · "}
          {entry.category_name || entry.category?.name || "Entry"}
        </Copy>
      </Pressable>
    </Animated.View>
  );
}

/** An unpaid entry is transient and urgent, not part of the record yet --
 * pulled fully out of the chronological list (rather than color-coded
 * inside the same card shape) so a PENDING entry cannot be mistaken for a
 * logged one. */
function PaymentStripRow({ entry, index }: { entry: Registration; index: number }) {
  return (
    <Animated.View entering={cardEntering(index)}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/registrations/${entry.id}`)}
        style={({ pressed }) => ({
          backgroundColor: colors.lime,
          minHeight: 64,
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Copy style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.ink }} numberOfLines={1}>
            {entry.event_name || entry.event?.name || "Race entry"}
          </Copy>
          <Copy style={{ fontSize: 12, color: colors.ink }}>
            {entry.category_name || entry.category?.name || "Entry"}
            {entry.category
              ? ` · ${money(entry.category.price_cents, entry.category.currency)}`
              : ""}
          </Copy>
        </View>
        <Copy style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.ink }}>
          Finish payment →
        </Copy>
      </Pressable>
    </Animated.View>
  );
}

export default function WalletScreen() {
  const state = useSession();
  const query = useMyRegistrations();
  // A registered-but-not-followed CONFIRMED entry is the common case, so this
  // is fetched once for the whole list rather than per-card -- see
  // useActiveLiveActivities's own staleTime for why re-render churn isn't a
  // concern.
  const liveActivities = useActiveLiveActivities();
  const insets = useSafeAreaInsets();

  const registrations = query.data || [];
  const pending = useMemo(
    () => registrations.filter((r) => r.status === "PENDING"),
    [registrations],
  );
  // One real chronological record instead of the old two-bucket split --
  // most-recent first. PENDING never appears here a second time; it exists
  // only in the strip above until it resolves.
  const record = useMemo(
    () =>
      registrations
        .filter((r) => r.status === "CONFIRMED" || r.status === "CANCELLED" || r.status === "REFUNDED")
        .slice()
        .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)),
    [registrations],
  );
  const headerStats = useMemo(
    () => (registrations.length > 0 ? computeWalletHeaderStats(registrations) : null),
    [registrations],
  );
  // A year divider only earns its place when the data actually spans more
  // than one year -- with a fresh club's data this renders zero dividers,
  // which is correct, not a missing feature.
  const showYearDividers = useMemo(() => {
    const years = new Set(record.map((r) => new Date(r.created_at).getFullYear()));
    return years.size > 1;
  }, [record]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, paddingTop: insets.top }}>
      <Stack.Screen options={{ title: "Race wallet" }} />
      <OfflineNotice />
      {state.status !== "authenticated" ? (
        <Feedback
          title="Your running record"
          message="Sign in to see your entries and race history."
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
          contentContainerStyle={{ padding: 24, paddingBottom: 120 }}
        >
          <WalletHeader stats={headerStats} />
          {registrations.length === 0 ? (
            <Feedback
              title="Nothing logged yet"
              message="Your first entry starts your record. Find a race on the Events tab."
              action="Browse races"
              onAction={() => router.push("/(tabs)")}
            />
          ) : (
            <>
              {pending.length > 0 && (
                <View style={{ gap: 10, marginBottom: 28 }}>
                  <Eyebrow>Payment due</Eyebrow>
                  {pending.map((entry, i) => (
                    <PaymentStripRow key={entry.id} entry={entry} index={i} />
                  ))}
                </View>
              )}
              {record.length > 0 && (
                <View>
                  <Eyebrow style={{ color: colors.muted, marginBottom: 14 }}>Your record</Eyebrow>
                  {record.map((entry, i) => {
                    const year = new Date(entry.created_at).getFullYear();
                    const prevYear = i > 0 ? new Date(record[i - 1].created_at).getFullYear() : null;
                    const rowIndex = pending.length + i;
                    return (
                      <View key={entry.id}>
                        {showYearDividers && year !== prevYear && <YearDivider year={year} />}
                        {entry.status === "CONFIRMED" ? (
                          <TicketStub
                            entry={entry}
                            index={rowIndex}
                            liveActivity={liveActivities.data?.find((a) => a.event_id === entry.event_id)}
                          />
                        ) : (
                          <LedgerLine entry={entry} index={rowIndex} />
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
