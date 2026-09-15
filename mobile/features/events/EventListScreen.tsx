import { useEffect, useMemo, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
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
  Heading,
  LoadingCards,
  OfflineNotice,
} from "../../components/ui";
import { cardEntering } from "../../components/motion";
import { useApi } from "../../services/api/provider";
import { useEvent, useEvents, useSiteConfig } from "./queries";
import {
  assetUrl,
  daysUntil,
  eventDate,
  eventDateShort,
  eventDayParts,
  eventMonthKey,
  eventMonthLabel,
  statusLabel,
} from "./format";
import { SCRIM_BANDS, SCRIM_HEIGHT } from "./scrim";
import type { HeroSlide, RunEvent, SiteConfig } from "../../services/api/types";

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

/** The soonest ahead-of-today event by real date, not "row 0 of whatever
 * page loaded first" -- an event without a parseable date, or one that has
 * already started, is never a candidate. */
function pickNextUp(rows: RunEvent[]): RunEvent | null {
  let best: { event: RunEvent; days: number } | null = null;
  for (const event of rows) {
    const days = daysUntil(event.event_date);
    if (days === null || days < 0) continue;
    if (!best || days < best.days) best = { event, days };
  }
  return best?.event ?? null;
}

type TimelineItem =
  | { type: "month"; key: string; label: string; count: number }
  | { type: "event"; key: string; event: RunEvent; marginTop: number }
  | { type: "interstitial"; key: string; slide: HeroSlide; terse: boolean };

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86400000);
}

/** Groups rows by month, computes each row's extra top margin from the real
 * day-gap to the previous race (the screen's signature device -- a busy
 * month reads visibly denser than a quiet one), and weaves in up to two
 * real, varied club photos. Ahead and Past are both just "a list of rows in
 * date order" to this function; only the caller decides sort direction and
 * whether photos are eligible (never in Past -- an archive of what already
 * happened shouldn't still be selling you on joining). */
function buildTimeline(
  rows: RunEvent[],
  ascending: boolean,
  heroSlides: HeroSlide[],
): TimelineItem[] {
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

  const slideCount = heroSlides.length;
  const doy = dayOfYear(new Date());
  const slide1 = slideCount > 0 ? heroSlides[doy % slideCount] : null;
  const slide2 = slideCount >= 2 ? heroSlides[(doy % slideCount) + 1 === slideCount ? 0 : (doy % slideCount) + 1] : null;

  const items: TimelineItem[] = [];
  let previousDate: string | null = null;

  monthOrder.forEach((monthKey, monthIndex) => {
    const eventsInMonth = monthBuckets.get(monthKey)!;
    items.push({
      type: "month",
      key: `month-${monthKey}`,
      label: eventMonthLabel(eventsInMonth[0].event_date),
      count: eventsInMonth.length,
    });
    for (const event of eventsInMonth) {
      const gapDays =
        previousDate !== null
          ? Math.abs(
              (Date.parse(`${event.event_date.slice(0, 10)}T00:00:00Z`) -
                Date.parse(`${previousDate.slice(0, 10)}T00:00:00Z`)) /
                86400000,
            )
          : 3;
      const extra = Math.min(Math.max(Math.round((gapDays - 3) * 2), 0), 48);
      items.push({ type: "event", key: event.id, event, marginTop: 14 + extra });
      previousDate = event.event_date;
    }
    if (monthIndex === 0 && slide1) {
      items.push({ type: "interstitial", key: "interstitial-1", slide: slide1, terse: false });
    }
    if (monthIndex === 2 && monthOrder.length >= 4 && slide2) {
      items.push({ type: "interstitial", key: "interstitial-2", slide: slide2, terse: true });
    }
  });

  return items;
}

export default function EventListScreen() {
  const insets = useSafeAreaInsets();
  const [season, setSeason] = useState<"ahead" | "past">("ahead");
  const [openOnly, setOpenOnly] = useState(false);

  // Next Up is deliberately independent of the toggle below -- it always
  // answers "what's my next race", regardless of what the runner happens to
  // be browsing. React Query dedupes this against the list query below
  // whenever they share the same status string, so Ahead+"all" costs one
  // network call, not two.
  const aheadEvents = useEvents(AHEAD_STATUSES);
  const activeStatuses =
    season === "past" ? PAST_STATUSES : openOnly ? "REGISTRATION_OPEN" : AHEAD_STATUSES;
  const listEvents = useEvents(activeStatuses);
  const siteConfig = useSiteConfig();

  const aheadRows = useMemo(
    () => [
      ...new Map(
        (aheadEvents.data?.pages.flatMap((page) => page.events ?? []) ?? []).map((event) => [
          event.id,
          event,
        ]),
      ).values(),
    ],
    [aheadEvents.data],
  );
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

  const nextUpEvent = useMemo(() => pickNextUp(aheadRows), [aheadRows]);
  // Same N+1-avoidance reasoning the previous FeaturedCard used: the list
  // endpoint doesn't return categories, so only this one hero-weight row
  // gets the extra detail fetch, never the whole timeline.
  const nextUpDetail = useEvent(nextUpEvent?.slug ?? "");
  const nextUpDistances = nextUpDetail.data?.categories?.map((c) => c.distance) ?? [];

  const timelineRows = useMemo(
    () => listRows.filter((event) => event.id !== nextUpEvent?.id),
    [listRows, nextUpEvent],
  );
  const timelineItems = useMemo(
    () =>
      buildTimeline(
        timelineRows,
        season === "ahead",
        season === "ahead" ? (siteConfig.data?.hero_slides ?? []) : [],
      ),
    [timelineRows, season, siteConfig.data],
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

            {aheadEvents.isPending && aheadEvents.fetchStatus !== "paused" ? (
              <View style={{ paddingHorizontal: 24 }}>
                <LoadingCards />
              </View>
            ) : aheadEvents.isError ? (
              <View style={{ paddingHorizontal: 24 }}>
                <Feedback
                  title="Let’s try that again"
                  message={aheadEvents.error.message}
                  action="Reload events"
                  onAction={() => {
                    void aheadEvents.refetch();
                  }}
                />
              </View>
            ) : season === "past" ? (
              <View style={{ paddingHorizontal: 24 }}>
                <Eyebrow>Completed races</Eyebrow>
                <Copy style={{ color: colors.muted, marginTop: 4 }}>
                  {pastTotal} {pastTotal === 1 ? "race" : "races"} finished so far.
                </Copy>
              </View>
            ) : nextUpEvent ? (
              <View style={{ paddingHorizontal: 24 }}>
                <NextUpCard event={nextUpEvent} distances={nextUpDistances} />
              </View>
            ) : (
              <View style={{ paddingHorizontal: 24 }}>
                <Feedback
                  title="Nothing on the calendar yet"
                  message="New races post here as soon as they’re scheduled — check back soon."
                />
              </View>
            )}

            {siteConfig.data ? <MissionStrip config={siteConfig.data} /> : null}

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 28,
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
            ) : item.type === "interstitial" ? (
              <PhotoInterstitial slide={item.slide} terse={item.terse} />
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

function NextUpCard({ event, distances }: { event: RunEvent; distances: string[] }) {
  const days = daysUntil(event.event_date);
  const label = days === 0 ? "TODAY" : days === 1 ? "TOMORROW" : days === null ? "—" : String(days);
  const size = days === 0 ? 34 : days === 1 ? 26 : 96;
  return (
    <Animated.View entering={FadeInDown.duration(260).easing(Easing.out(Easing.quad))}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${event.name}, ${eventDateShort(event.event_date)}, ${statusLabel[event.status]}`}
        onPress={() => router.push({ pathname: "/events/[slug]", params: { slug: event.slug } })}
        style={({ pressed }) => [styles.nextUpCard, { opacity: pressed ? 0.9 : 1 }]}
      >
        <View style={{ flexDirection: "row", gap: 16 }}>
          <View style={{ width: 108, justifyContent: "center" }}>
            <Copy
              style={{
                fontFamily: fonts.display,
                fontSize: size,
                // Anton's tall glyphs clip against a lineHeight tighter than
                // ~1x fontSize -- fine for a pure numeral's round digits,
                // but "TODAY"/"TOMORROW" have ascenders/descenders that were
                // getting cropped at the previous 0.92 ratio.
                lineHeight: days === null || days > 1 ? size * 0.92 : size * 1.05,
                color: colors.lime,
              }}
            >
              {label}
            </Copy>
            {days !== null && days > 1 && (
              <Copy style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.lime }}>
                DAYS
              </Copy>
            )}
            <Copy style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
              {eventDateShort(event.event_date)}
            </Copy>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Eyebrow>Next on the calendar</Eyebrow>
            <Heading style={{ fontSize: 26, lineHeight: 30 }} numberOfLines={2}>
              {event.name}
            </Heading>
            <Copy style={{ color: colors.muted, fontSize: 13 }}>
              {event.location || "Location to be announced"}
            </Copy>
            {event.status === "REGISTRATION_OPEN" ? (
              <View
                style={{
                  alignSelf: "flex-start",
                  backgroundColor: colors.blue,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Copy style={{ color: colors.white, fontSize: 11, fontFamily: fonts.bold }}>
                  {statusLabel[event.status]}
                </Copy>
              </View>
            ) : (
              <Copy style={{ color: colors.muted, fontSize: 12, fontFamily: fonts.bold }}>
                {statusLabel[event.status]}
              </Copy>
            )}
            {distances.length > 0 && (
              <Copy style={{ fontFamily: fonts.bold, fontSize: 13 }}>
                {distances.join("  ·  ")}
              </Copy>
            )}
            <Copy style={{ color: colors.lime, fontFamily: fonts.bold, fontSize: 13, marginTop: 2 }}>
              View race →
            </Copy>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Real, previously-unsurfaced club-voice copy -- mission_text and the
 * three value_messages are authored content the screen never showed before,
 * rendered without manufacturing a three-card grid the backend gives no
 * structure for (they're a plain string array, not three distinct fields). */
function MissionStrip({ config }: { config: SiteConfig }) {
  if (!config.mission_text) return null;
  return (
    <View style={{ paddingHorizontal: 24, marginTop: 32 }}>
      <Eyebrow>{config.mission_eyebrow}</Eyebrow>
      <View style={{ flexDirection: "row", gap: 14, marginTop: 8 }}>
        <View style={{ width: 3, borderRadius: 2, backgroundColor: colors.lime }} />
        <Copy style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 26, flex: 1 }}>
          {config.mission_text}
        </Copy>
      </View>
      {config.mission_supporting_text ? (
        <Copy style={{ color: colors.muted, marginTop: 10 }}>{config.mission_supporting_text}</Copy>
      ) : null}
      {config.value_messages?.length > 0 && (
        <Copy style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 13, marginTop: 16 }}>
          {config.value_messages.join("  ·  ")}
        </Copy>
      )}
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
        marginTop: 28,
        marginBottom: 6,
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

function TimelineRow({ event, marginTop }: { event: RunEvent; marginTop: number }) {
  const parts = eventDayParts(event.event_date);
  const isOpen = event.status === "REGISTRATION_OPEN";
  const isArchived = event.status === "COMPLETED" || event.status === "CANCELLED";
  const isHollow = event.status === "PUBLISHED" || event.status === "REGISTRATION_CLOSED";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.name}, ${eventDate(event.event_date)}, ${statusLabel[event.status]}`}
      onPress={() => router.push({ pathname: "/events/[slug]", params: { slug: event.slug } })}
      style={({ pressed }) => [
        { flexDirection: "row", gap: 14, paddingHorizontal: 24, marginTop, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={{ width: 28, alignItems: "center" }}>
        <View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: colors.line,
          }}
        />
        <View
          style={{
            marginTop: 6,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: isHollow ? "transparent" : isOpen ? colors.lime : colors.muted,
            borderWidth: isHollow ? 1.5 : 0,
            borderColor: colors.muted,
            opacity: isArchived ? 0.6 : 1,
          }}
        />
      </View>
      <View style={{ width: 30, alignItems: "center" }}>
        <Copy style={{ fontFamily: fonts.bold, fontSize: 16 }}>{parts?.day ?? "—"}</Copy>
        <Copy style={{ color: colors.muted, fontSize: 9, fontFamily: fonts.bold }}>
          {parts?.weekday ?? ""}
        </Copy>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Copy style={{ fontFamily: fonts.bold }} numberOfLines={1}>
          {event.name}
        </Copy>
        {/* Wrapped, never truncated -- the club's real Diamond-Island-style
            venue names stay fully readable rather than clipped as filler. */}
        <Copy style={{ color: colors.muted, fontSize: 12 }}>
          {event.location || "Location to be announced"}
        </Copy>
      </View>
      <Copy
        style={{
          color: isOpen ? colors.blueText : colors.muted,
          fontFamily: fonts.bold,
          fontSize: 11,
        }}
      >
        {statusLabel[event.status]}
      </Copy>
    </Pressable>
  );
}

/** A real, still crew photo woven into the timeline -- not an auto-advancing
 * carousel. Two of these ever appear (see buildTimeline), each a different
 * real hero_slide with a different caption length, so the second appearance
 * reads as a smaller, distinct gesture rather than the same block repeated. */
function PhotoInterstitial({ slide, terse }: { slide: HeroSlide; terse: boolean }) {
  const { apiOrigin, webOrigin } = useApi();
  const uri = assetUrl(slide.image_url, apiOrigin, webOrigin);
  return (
    <Animated.View entering={FadeIn.duration(260)} style={{ height: 140, marginTop: 24 }}>
      {uri && (
        <Image
          source={{ uri }}
          accessibilityLabel={slide.alt}
          style={{ position: "absolute", width: "100%", height: 140 }}
          resizeMode="cover"
        />
      )}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: SCRIM_HEIGHT }}>
        {SCRIM_BANDS.map((band, i) => (
          <View
            key={i}
            style={{ height: band.height, backgroundColor: `rgba(12,12,12,${band.opacity})` }}
          />
        ))}
      </View>
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 18, gap: 4 }}>
        {!terse && <Eyebrow style={{ lineHeight: 14 }}>{slide.eyebrow}</Eyebrow>}
        <Copy
          style={{ fontFamily: fonts.display, fontSize: 20, lineHeight: 23 }}
          numberOfLines={terse ? 1 : 2}
        >
          {slide.title}
        </Copy>
        {!terse && (
          <Copy style={{ color: colors.muted, fontSize: 12.5, lineHeight: 17 }} numberOfLines={2}>
            {slide.copy}
          </Copy>
        )}
      </View>
    </Animated.View>
  );
}

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
  nextUpCard: {
    backgroundColor: colors.canvas,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 22,
  },
});
