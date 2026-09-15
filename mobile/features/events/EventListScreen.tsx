import { useEffect, useMemo, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
import { colors, fonts } from "../../constants/theme";
import {
  Button,
  Copy,
  Eyebrow,
  Feedback,
  LoadingCards,
  OfflineNotice,
} from "../../components/ui";
import { cardEntering } from "../../components/motion";
import { useApi } from "../../services/api/provider";
import { useEvents, useSiteConfig } from "./queries";
import {
  assetUrl,
  eventDate,
  eventDateShort,
  eventMonthKey,
  eventMonthLabel,
  statusLabel,
} from "./format";
import type { RunEvent } from "../../services/api/types";

// "Ahead" excludes COMPLETED on purpose -- a countdown to a race that
// already happened would be nonsensical, not just imprecise.
const AHEAD_STATUSES = "PUBLISHED,REGISTRATION_OPEN,REGISTRATION_CLOSED";
const PAST_STATUSES = "COMPLETED";

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress(): void;
}) {
  const progress = useSharedValue(selected ? 1 : 0);
  // Reanimated warns on writing `.value` directly during render (it can run
  // twice under strict mode and desyncs from committed state) -- an effect
  // is the correct place to react to `selected` changing.
  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, { duration: 160 });
  }, [selected, progress]);
  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.canvas, colors.lime]),
  }));
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [colors.white, colors.ink]),
  }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={4}
    >
      <Animated.View style={[styles.chip, style]}>
        <Animated.Text style={[{ fontSize: 12, fontFamily: fonts.bold }, textStyle]}>
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

/** An underline tab -- the Season toggle's "when" axis (Ahead/Past), kept
 * distinct from FilterChip's filled-pill "is it open" axis so the two
 * questions read as two different kinds of control, not three flat chips
 * conflating both. */
function SeasonTab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress(): void;
}) {
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, { duration: 160 });
  }, [selected, progress]);
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [colors.muted, colors.white]),
  }));
  const underlineStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={8}
      style={{ marginRight: 24, paddingVertical: 10 }}
    >
      <Animated.Text style={[{ fontFamily: fonts.bold, fontSize: 13 }, textStyle]}>
        {label}
      </Animated.Text>
      <Animated.View
        style={[
          { height: 3, borderRadius: 2, backgroundColor: colors.lime, marginTop: 6 },
          underlineStyle,
        ]}
      />
    </Pressable>
  );
}

type TimelineItem =
  | { type: "month"; key: string; label: string; count: number }
  | { type: "event"; key: string; event: RunEvent; marginTop: number };

// Month headings separate groups; card spacing stays independent of race dates.
function buildTimeline(rows: RunEvent[], ascending: boolean): TimelineItem[] {
  const sorted = [...rows].sort((a, b) => {
    const cmp = a.event_date.localeCompare(b.event_date);
    return ascending ? cmp : -cmp;
  });

  const monthOrder: string[] = [];
  const monthBuckets = new Map<string, RunEvent[]>();
  for (const event of sorted) {
    const key = eventMonthKey(event.event_date);
    if (!monthBuckets.has(key)) {
      monthBuckets.set(key, []);
      monthOrder.push(key);
    }
    monthBuckets.get(key)!.push(event);
  }

  const items: TimelineItem[] = [];

  monthOrder.forEach((monthKey) => {
    const eventsInMonth = monthBuckets.get(monthKey)!;
    items.push({
      type: "month",
      key: `month-${monthKey}`,
      label: eventMonthLabel(eventsInMonth[0].event_date),
      count: eventsInMonth.length,
    });
    eventsInMonth.forEach((event, index) => {
      items.push({ type: "event", key: event.id, event, marginTop: index === 0 ? 12 : 16 });
    });
  });

  return items;
}

export default function EventListScreen() {
  const insets = useSafeAreaInsets();
  const [season, setSeason] = useState<"ahead" | "past">("ahead");
  const [openOnly, setOpenOnly] = useState(false);

  const activeStatuses =
    season === "past" ? PAST_STATUSES : openOnly ? "REGISTRATION_OPEN" : AHEAD_STATUSES;
  const listEvents = useEvents(activeStatuses);
  const siteConfig = useSiteConfig();

  const listRows = useMemo(
    () => [
      ...new Map(
        (listEvents.data?.pages.flatMap((page) => page.events ?? []) ?? []).map((event) => [
          event.id,
          event,
        ]),
      ).values(),
    ],
    [listEvents.data],
  );

  const timelineItems = useMemo(
    () => buildTimeline(listRows, season === "ahead"),
    [listRows, season],
  );

  const pastTotal = listEvents.data?.pages[0]?.total ?? listRows.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, paddingTop: insets.top }}>
      <OfflineNotice />
      <FlatList
        data={timelineItems}
        keyExtractor={(item) => item.key}
        // Native tab bar floats over the content on iOS -- 120pt clears it
        // with room to spare, so the last row is never trapped underneath.
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshing={listEvents.isRefetching && !listEvents.isFetchingNextPage}
        onRefresh={() => {
          void listEvents.refetch();
        }}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={styles.wordmark}>
                <Copy style={{ fontFamily: fonts.bold, fontSize: 16 }}>
                  {siteConfig.data?.club_name ?? "UNITY RUNN CLUB"}
                </Copy>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  {siteConfig.data?.location_label ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="location-outline" size={13} color={colors.muted} />
                      <Copy style={{ fontSize: 12, color: colors.muted }}>
                        {siteConfig.data.location_label}
                      </Copy>
                    </View>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Your account"
                    onPress={() => router.navigate("/(tabs)/account")}
                    hitSlop={8}
                  >
                    <Ionicons name="person-circle-outline" size={26} color={colors.white} />
                  </Pressable>
                </View>
              </View>
            </View>

            {/* The featured "next up" hero card was removed -- the timeline
                below (loading/error/empty states handled by listEvents,
                further down) is now the only presentation of ahead events.
                This label is the one piece that wasn't already covered by
                that block: a section header specifically for the Past tab. */}
            {season === "past" && (
              // header's own paddingBottom is 0 (by design, for the Ahead
              // case where the tabs row supplies its own marginTop right
              // after it) -- this block sat directly against the wordmark
              // row with no gap of its own. Same bug class as Race Detail's
              // button-to-section spacing, just found here on review.
              <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
                <Eyebrow>Completed races</Eyebrow>
                <Copy style={{ color: colors.muted, marginTop: 4 }}>
                  {pastTotal} {pastTotal === 1 ? "race" : "races"} finished so far.
                </Copy>
              </View>
            )}

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                rowGap: 12,
                marginTop: 24,
                paddingHorizontal: 24,
                minHeight: 44,
              }}
            >
              <View style={{ flexDirection: "row" }}>
                <SeasonTab
                  label="Ahead"
                  selected={season === "ahead"}
                  onPress={() => {
                    setSeason("ahead");
                    setOpenOnly(false);
                  }}
                />
                <SeasonTab
                  label="Past"
                  selected={season === "past"}
                  onPress={() => {
                    setSeason("past");
                    setOpenOnly(false);
                  }}
                />
              </View>
              {season === "ahead" && (
                <FilterChip
                  label="Open for entry only"
                  selected={openOnly}
                  onPress={() => setOpenOnly((value) => !value)}
                />
              )}
            </View>

            {listEvents.isError && (
              <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
                <Feedback
                  title="Let’s try that again"
                  message={listEvents.error.message}
                  action="Reload events"
                  onAction={() => {
                    void listEvents.refetch();
                  }}
                />
              </View>
            )}
            {listEvents.isPending && listEvents.fetchStatus !== "paused" && (
              <View style={{ marginTop: 4 }}>
                <LoadingCards />
              </View>
            )}
            {!listEvents.isPending && !listEvents.isError && timelineItems.length === 0 && (
              <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
                <Feedback
                  title={
                    season === "past"
                      ? "No finished races yet"
                      : openOnly
                        ? "Nothing open for entry right now"
                        : "Nothing else on the calendar"
                  }
                  message={
                    season === "past"
                      ? "Completed races will land here after race day."
                      : openOnly
                        ? "Check back soon, or browse everything ahead."
                        : "Check back soon for more races."
                  }
                  action={openOnly ? "Show everything ahead" : undefined}
                  onAction={openOnly ? () => setOpenOnly(false) : undefined}
                />
              </View>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={cardEntering(index)}>
            {item.type === "month" ? (
              <MonthHeader label={item.label} count={item.count} />
            ) : (
              <TimelineRow event={item.event} marginTop={item.marginTop} />
            )}
          </Animated.View>
        )}
        ListFooterComponent={
          listRows.length > 0 ? (
            <View style={{ padding: 24, gap: 12 }}>
              {listEvents.hasNextPage && (
                <Button
                  title="Load more events"
                  busy={listEvents.isFetchingNextPage}
                  secondary
                  onPress={() => {
                    void listEvents.fetchNextPage();
                  }}
                />
              )}
            </View>
          ) : null
        }
      />
    </View>
  );
}

function MonthHeader({ label, count }: { label: string; count: number }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 24,
        marginTop: 24,
      }}
    >
      <Copy style={{ fontFamily: fonts.display, fontSize: 20 }}>{label}</Copy>
      <Copy style={{ color: colors.muted, fontSize: 12 }}>
        · {count} {count === 1 ? "race" : "races"}
      </Copy>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />
    </View>
  );
}

// Plain stacked photo cards, not the connector-and-day-column timeline this
// replaced -- a direct, explicit ask, matching the reference's own list
// exactly: full-width photo, a status pill floating on its corner, name,
// an icon meta row, a circular "go" button. The one thing deliberately not
// copied is the reference's avatar stack + "+127 going" -- there is no real
// public attendee-list data behind that number in this app, and inventing
// one would be exactly the fabricated-count pattern this app's own rules
// forbid. Month headers above each group of these still carry a real,
// derived count ("N races"), which is the honest version of that idea.
function TimelineRow({ event, marginTop }: { event: RunEvent; marginTop: number }) {
  const { apiOrigin, webOrigin } = useApi();
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoUri = assetUrl(event.cover_image, apiOrigin, webOrigin);
  const showPhoto = Boolean(photoUri) && !photoFailed;
  const isOpen = event.status === "REGISTRATION_OPEN";
  return (
    <View style={{ paddingHorizontal: 24, marginTop }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${event.name}, ${eventDate(event.event_date)}, ${statusLabel[event.status]}`}
        onPress={() => router.push({ pathname: "/events/[slug]", params: { slug: event.slug } })}
        style={({ pressed }) => ({
          backgroundColor: colors.canvas,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.line,
          overflow: "hidden",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View style={{ height: 140 }}>
          {showPhoto ? (
            <Image
              source={{ uri: photoUri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="flag-outline" size={26} color={colors.muted} />
            </View>
          )}
          <View
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              backgroundColor: isOpen ? colors.blue : "rgba(23,23,23,0.85)",
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}
          >
            <Copy style={{ color: colors.white, fontSize: 11, fontFamily: fonts.bold }}>
              {statusLabel[event.status]}
            </Copy>
          </View>
        </View>
        <View style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Copy style={{ fontFamily: fonts.bold, fontSize: 16 }} numberOfLines={1}>
              {event.name}
            </Copy>
            <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Ionicons name="calendar-outline" size={13} color={colors.muted} />
                <Copy style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{eventDateShort(event.event_date)}</Copy>
              </View>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 5, maxWidth: "100%", flexShrink: 1 }}>
                <Ionicons name="location-outline" size={13} color={colors.muted} style={{ marginTop: 2 }} />
                <Copy style={{ color: colors.muted, fontSize: 12, lineHeight: 18, flexShrink: 1 }}>
                  {event.location || "Location to be announced"}
                </Copy>
              </View>
            </View>
          </View>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: colors.lime,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-forward" size={18} color={colors.ink} />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

// A drop shadow was tried here and removed -- shadowColor is necessarily
// dark, and on this near-black page background a dark shadow has zero
// contrast against what's behind it, so it rendered as literally nothing
// (confirmed by screenshot, not just reasoned about). Depth on this palette
// comes from surface contrast instead: colors.canvas vs colors.ink (see
// constants/theme.ts) plus the colors.line border every card already has.
const styles = StyleSheet.create({
  header: { padding: 24, paddingBottom: 0 },
  wordmark: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 20,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
});
