import { useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
import { colors, fonts } from "../../constants/theme";
import {
  Button,
  Copy,
  EventImage,
  Eyebrow,
  Feedback,
  Heading,
  LoadingCards,
  OfflineNotice,
} from "../../components/ui";
import { useEvent, useEvents } from "./queries";
import { eventDate, eventDateParts, statusLabel } from "./format";
import { HeroCarousel } from "./HeroCarousel";
import type { RunEvent } from "../../services/api/types";
// "Upcoming" excludes COMPLETED on purpose -- a label promising upcoming races
// showing finished ones would be misleading, not just imprecise.
const filters = [
  { label: "Upcoming", value: "PUBLISHED,REGISTRATION_OPEN,REGISTRATION_CLOSED" },
  { label: "Open for entry", value: "REGISTRATION_OPEN" },
  { label: "Past", value: "COMPLETED" },
];
// A single custom entering animation (scale 0.97 -> 1, fade in) shared by the
// featured card and the compact row cards, staggered by list position. Fast
// (220ms) and eased out, not a floaty spring -- matches a sports-brand feel
// rather than a soft consumer-app one.
function cardEntering(index: number) {
  const delay = Math.min(index, 6) * 40;
  return () => {
    "worklet";
    const timing = { duration: 220, easing: Easing.out(Easing.quad) };
    return {
      initialValues: { opacity: 0, transform: [{ scale: 0.97 }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, timing)),
        transform: [{ scale: withDelay(delay, withTiming(1, timing)) }],
      },
    };
  };
}
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
  progress.value = withTiming(selected ? 1 : 0, { duration: 160 });
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
export default function EventListScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState(filters[0].value);
  const events = useEvents(filter);
  const rows = [
    ...new Map(
      (events.data?.pages.flatMap((page) => page.events ?? []) ?? []).map((event) => [
        event.id,
        event,
      ]),
    ).values(),
  ];
  const [featured, ...rest] = rows;
  // The list endpoint doesn't return categories (see backend events.Handler.List --
  // capacity/pricing is masked there for non-staff callers). One extra detail fetch
  // for just the single featured card is a fair cost for showing its real distances;
  // doing that per-row for the whole list would be an N+1 fan-out, so compact rows
  // below skip distances entirely rather than guess at them.
  const featuredDetail = useEvent(featured?.slug ?? "");
  const featuredDistances = featuredDetail.data?.categories?.map((c) => c.distance) ?? [];
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, paddingTop: insets.top }}>
      <OfflineNotice />
      <FlatList
        data={rest}
        keyExtractor={(event) => event.id}
        // Native tab bar floats over the content on iOS; without real bottom
        // clearance the last row sits under it with no way to scroll past.
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshing={events.isRefetching && !events.isFetchingNextPage}
        onRefresh={() => {
          void events.refetch();
        }}
        ListHeaderComponent={
          <View>
            {/* Same content the web homepage hero reads (GET /api/v1/site-config,
                see HeroCarousel.tsx) -- full-bleed, so it sits outside the
                24px-padded header block below rather than inheriting its margin. */}
            <HeroCarousel />
          <View style={styles.header}>
            <View style={styles.wordmark}>
              <Copy style={{ fontFamily: fonts.bold, fontSize: 16 }}>UNITY RUNN CLUB</Copy>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="location-outline" size={13} color={colors.muted} />
                  <Copy style={{ fontSize: 12, color: colors.muted }}>Phnom Penh</Copy>
                </View>
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
            <Animated.View entering={FadeInDown.duration(320).easing(Easing.out(Easing.quad))}>
              <Eyebrow>Community miles. Race days.</Eyebrow>
              <Heading large style={{ fontSize: 46, lineHeight: 50, marginTop: 6 }}>
                FIND YOUR{"\n"}NEXT RACE.
              </Heading>
              <Copy style={{ color: colors.muted, marginTop: 10 }}>
                Discover races, community runs, and training sessions in Cambodia.
              </Copy>
            </Animated.View>
            <View style={styles.filters}>
              {filters.map((item) => (
                <FilterChip
                  key={item.value}
                  label={item.label}
                  selected={filter === item.value}
                  onPress={() => setFilter(item.value)}
                />
              ))}
            </View>
            {events.isPending && events.fetchStatus !== "paused" ? (
              <LoadingCards />
            ) : events.isError ? (
              <Feedback
                title="Let’s try that again"
                message={events.error.message}
                action="Reload events"
                onAction={() => {
                  void events.refetch();
                }}
              />
            ) : !featured ? (
              <Feedback
                title={
                  events.fetchStatus === "paused"
                    ? "Waiting for a connection"
                    : "More miles are on the way"
                }
                message={
                  events.fetchStatus === "paused"
                    ? "Your events will load when you reconnect."
                    : "There are no events in this view yet. Check another category or come back soon."
                }
              />
            ) : (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 8,
                  }}
                >
                  <Eyebrow>Featured race</Eyebrow>
                  {rest.length > 0 && (
                    <Copy style={{ color: colors.blueText, fontFamily: fonts.bold, fontSize: 12 }}>
                      See all ({rows.length}) →
                    </Copy>
                  )}
                </View>
                <FeaturedCard event={featured} distances={featuredDistances} />
                {rest.length > 0 && <Eyebrow style={{ marginTop: 8 }}>More races</Eyebrow>}
              </>
            )}
          </View>
          </View>
        }
        renderItem={({ item, index }) => <CompactCard event={item} index={index} />}
        ListFooterComponent={
          rows.length > 0 ? (
            <View style={{ padding: 24, gap: 12 }}>
              {events.isError && (
                <Copy accessibilityRole="alert">{events.error.message}</Copy>
              )}
              {events.hasNextPage && (
                <Button
                  title="Load more events"
                  busy={events.isFetchingNextPage}
                  secondary
                  onPress={() => {
                    void events.fetchNextPage();
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
function FeaturedCard({ event, distances }: { event: RunEvent; distances: string[] }) {
  const parts = eventDateParts(event.event_date);
  return (
    <Animated.View entering={cardEntering(0)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${event.name}, ${eventDate(event.event_date)}, ${statusLabel[event.status]}`}
        onPress={() => router.push({ pathname: "/events/[slug]", params: { slug: event.slug } })}
        style={({ pressed }) => [styles.featuredCard, { opacity: pressed ? 0.85 : 1 }]}
      >
        <EventImage path={event.cover_image} label={event.name} style={{ height: 200 }} />
        <View style={{ padding: 18, gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
            {parts && (
              <View style={styles.dateBadge}>
                <Copy style={{ fontSize: 10, fontFamily: fonts.bold, color: colors.ink }}>
                  {parts.month}
                </Copy>
                <Copy style={{ fontSize: 20, fontFamily: fonts.bold, color: colors.ink, lineHeight: 22 }}>
                  {parts.day}
                </Copy>
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Heading style={{ fontSize: 26, lineHeight: 29 }}>{event.name}</Heading>
              <Copy style={{ color: colors.muted, fontSize: 13 }}>
                {event.location || "Location to be announced"}
              </Copy>
            </View>
          </View>
          {distances.length > 0 && (
            <Copy style={{ fontFamily: fonts.bold, fontSize: 13 }}>
              {distances.join("  ·  ")}
            </Copy>
          )}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 4,
            }}
          >
            <Copy
              style={{
                color: event.status === "REGISTRATION_OPEN" ? colors.blueText : colors.muted,
                fontFamily: fonts.bold,
                fontSize: 12,
              }}
            >
              {statusLabel[event.status]}
            </Copy>
            <Copy style={{ color: colors.lime, fontFamily: fonts.bold, fontSize: 13 }}>
              View event →
            </Copy>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
function CompactCard({ event, index }: { event: RunEvent; index: number }) {
  const parts = eventDateParts(event.event_date);
  return (
    <Animated.View entering={cardEntering(index + 1)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${event.name}, ${eventDate(event.event_date)}, ${statusLabel[event.status]}`}
        onPress={() => router.push({ pathname: "/events/[slug]", params: { slug: event.slug } })}
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
      >
        {parts && (
          <View style={styles.rowDateBadge}>
            <Copy style={{ fontSize: 9, fontFamily: fonts.bold, color: colors.muted }}>
              {parts.month}
            </Copy>
            <Copy style={{ fontSize: 16, fontFamily: fonts.bold, lineHeight: 18 }}>
              {parts.day}
            </Copy>
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Copy style={{ fontFamily: fonts.bold }} numberOfLines={1}>
            {event.name}
          </Copy>
          <Copy style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
            {event.location || "Location to be announced"}
          </Copy>
        </View>
        <Copy
          style={{
            color: event.status === "REGISTRATION_OPEN" ? colors.blueText : colors.muted,
            fontFamily: fonts.bold,
            fontSize: 11,
          }}
        >
          {statusLabel[event.status]}
        </Copy>
      </Pressable>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  header: { padding: 24, gap: 16 },
  wordmark: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    flexWrap: "wrap",
    gap: 8,
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 20,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  featuredCard: {
    backgroundColor: colors.canvas,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  dateBadge: {
    backgroundColor: colors.lime,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    minWidth: 46,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 24,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: colors.line,
    minHeight: 44,
  },
  rowDateBadge: {
    width: 44,
    alignItems: "center",
  },
});
