import { useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { useEvents } from "./queries";
import { eventDate, statusLabel } from "./format";
const filters = [
  {
    label: "All events",
    value: "PUBLISHED,REGISTRATION_OPEN,REGISTRATION_CLOSED,COMPLETED",
  },
  { label: "Open for entry", value: "REGISTRATION_OPEN" },
  { label: "Past races", value: "COMPLETED" },
];
export default function EventListScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState(filters[0].value);
  const events = useEvents(filter);
  const rows = [
    ...new Map(
      (events.data?.pages.flatMap((page) => page.events) ?? []).map((event) => [
        event.id,
        event,
      ]),
    ).values(),
  ];
  return (
    <View
      style={{ flex: 1, backgroundColor: colors.white, paddingTop: insets.top }}
    >
      <OfflineNotice />
      <FlatList
        data={rows}
        keyExtractor={(event) => event.id}
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshing={events.isRefetching && !events.isFetchingNextPage}
        onRefresh={() => {
          void events.refetch();
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.wordmark}>
              <Copy style={{ fontFamily: fonts.bold, fontSize: 18 }}>
                UNITY RUNN CLUB
              </Copy>
              <Copy style={{ fontSize: 11, color: colors.muted }}>
                PHNOM PENH, KH
              </Copy>
            </View>
            <Eyebrow>Community miles. Race days.</Eyebrow>
            <Heading large>FIND YOUR{"\n"}NEXT START.</Heading>
            <Copy style={{ color: colors.muted }}>
              Good company. A reason to get out and run.
            </Copy>
            <View style={styles.filters}>
              {filters.map((item) => (
                <Pressable
                  key={item.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === item.value }}
                  onPress={() => setFilter(item.value)}
                  style={[
                    styles.chip,
                    filter === item.value && { backgroundColor: colors.ink },
                  ]}
                >
                  <Copy
                    style={{
                      color: filter === item.value ? colors.white : colors.ink,
                      fontSize: 12,
                      fontFamily: fonts.bold,
                    }}
                  >
                    {item.label}
                  </Copy>
                </Pressable>
              ))}
            </View>
            {rows.length > 0 && (
              <Eyebrow>{events.data?.pages[0]?.total} events</Eyebrow>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${eventDate(item.event_date)}, ${statusLabel[item.status]}`}
            onPress={() =>
              router.push({
                pathname: "/events/[slug]",
                params: { slug: item.slug },
              })
            }
            style={({ pressed }) => [
              styles.card,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View>
              <EventImage
                path={item.cover_image}
                label={item.name}
                style={{ borderRadius: 20 }}
              />
              <View style={styles.date}>
                <Copy style={{ fontFamily: fonts.bold, fontSize: 13 }}>
                  {eventDate(item.event_date, true)}
                </Copy>
              </View>
            </View>
            <View style={{ gap: 8, paddingTop: 16 }}>
              <Copy
                style={{
                  color:
                    item.status === "REGISTRATION_OPEN"
                      ? colors.blue
                      : colors.muted,
                  fontFamily: fonts.bold,
                  fontSize: 11,
                  letterSpacing: 0.6,
                }}
              >
                {statusLabel[item.status]?.toUpperCase()}
              </Copy>
              <Heading>{item.name}</Heading>
              <Copy style={{ color: colors.muted }}>
                {item.location || "Location to be announced"} ↗
              </Copy>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          events.isPending && events.fetchStatus !== "paused" ? (
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
          ) : (
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
          )
        }
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
const styles = StyleSheet.create({
  header: { padding: 24, gap: 14 },
  wordmark: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    flexWrap: "wrap",
    gap: 8,
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 8,
  },
  chip: {
    borderRadius: 24,
    backgroundColor: colors.canvas,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  card: { marginHorizontal: 24, marginBottom: 34 },
  date: {
    position: "absolute",
    top: 16,
    left: 16,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: colors.lime,
  },
});
