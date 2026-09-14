import { useState } from "react";
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import {
  Button,
  Copy,
  EventImage,
  Eyebrow,
  Feedback,
  Heading,
  LoadingCards,
  OfflineNotice,
  Section,
} from "../../components/ui";
import { colors, fonts } from "../../constants/theme";
import { useEvent } from "./queries";
import { eventDate, eventTime, money, statusLabel } from "./format";
export default function EventDetailScreen() {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const query = useEvent(slug ?? "");
  const [openFAQ, setOpenFAQ] = useState<string | null>(null);
  const [linkError, setLinkError] = useState("");
  const event = query.data;
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <Stack.Screen
        options={{ title: "Race details", headerBackTitle: "Events" }}
      />
      <OfflineNotice />
      {!event ? (
        query.isError ? (
          <Feedback
            title="Event unavailable"
            message={query.error.message}
            action="Try again"
            onAction={() => {
              void query.refetch();
            }}
          />
        ) : query.fetchStatus === "paused" ? (
          <Feedback
            title="You’re offline"
            message="Reconnect to load this event."
          />
        ) : !slug ? (
          <Feedback
            title="Event unavailable"
            message="Choose an event from the Events tab."
          />
        ) : (
          <LoadingCards />
        )
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
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <EventImage
            path={event.cover_image}
            label={event.name}
            style={{ height: 340 }}
          />
          <View style={{ paddingHorizontal: 24, paddingTop: 24 }}>
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: colors.lime,
                borderRadius: 7,
                paddingHorizontal: 10,
                paddingVertical: 5,
                marginBottom: 14,
              }}
            >
              <Eyebrow style={{ color: colors.ink }}>{statusLabel[event.status]}</Eyebrow>
            </View>
            <Heading large>{event.name}</Heading>
            <Copy style={{ marginTop: 14, fontFamily: fonts.bold }}>
              {eventDate(event.event_date)}
            </Copy>
            <Copy>{eventTime(event.start_time)} · Cambodia time</Copy>
            <Copy style={{ color: colors.muted, marginTop: 4, marginBottom: 24 }}>
              {event.location || "Location to be announced"}
            </Copy>
            {event.status === "REGISTRATION_OPEN" &&
              Boolean(event.categories?.some((c) => c.status === "OPEN")) && (
                <Button
                  title="Claim your place"
                  onPress={() => router.push(`/events/${event.slug}/register`)}
                />
              )}
            {query.isError && (
              <Copy accessibilityRole="alert" style={{ color: colors.error }}>
                Could not refresh. Showing the last loaded details.
              </Copy>
            )}
            <Section title="About the run">
              <Copy>
                {event.description ||
                  "The crew is getting the details ready. Check back closer to race day."}
              </Copy>
            </Section>
            {/* This is the one decision the whole screen exists to support, so it
                does not sit inside the same heading+divider shell as the reference
                sections below (About, Schedule, Rules, FAQ) -- it gets its own
                weight only while there's actually something to decide. */}
            <View style={{ paddingTop: 28, gap: 14 }}>
              <View style={{ gap: 4 }}>
                <Eyebrow>Pick your distance</Eyebrow>
                <Heading style={{ fontSize: 24, lineHeight: 28 }}>
                  {event.status === "REGISTRATION_OPEN"
                    ? "Choose your entry"
                    : "Distances"}
                </Heading>
              </View>
              {event.categories?.length ? (
                event.categories.map((category) => (
                  <Pressable
                    key={category.id}
                    disabled={category.status !== "OPEN" || event.status !== "REGISTRATION_OPEN"}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push(
                        `/events/${event.slug}/register?category=${category.id}`,
                      )
                    }
                    style={{
                      backgroundColor: colors.canvas,
                      borderRadius: 16,
                      padding: 18,
                      gap: 8,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <Copy style={{ fontFamily: fonts.bold, flex: 1 }}>
                        {category.name}
                      </Copy>
                      <Copy style={{ fontFamily: fonts.bold }}>
                        {money(category.price_cents, category.currency)}
                      </Copy>
                    </View>
                    <Copy>
                      {category.distance} ·{" "}
                      {category.status === "OPEN"
                        ? "Open category"
                        : category.status.replaceAll("_", " ").toLowerCase()}
                    </Copy>
                    {category.registration_deadline && (
                      <Copy style={{ fontSize: 12, color: colors.muted }}>
                        Entry deadline:{" "}
                        {new Intl.DateTimeFormat("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Phnom_Penh",
                        }).format(
                          new Date(category.registration_deadline),
                        )}{" "}
                        (Cambodia)
                      </Copy>
                    )}
                  </Pressable>
                ))
              ) : (
                <Copy>Distances will be announced soon.</Copy>
              )}
            </View>
            <Section title="Race-day schedule">
              {event.schedule?.length ? (
                event.schedule.map((item) => (
                  <View key={item.id} style={{ flexDirection: "row", gap: 18 }}>
                    <Copy
                      style={{
                        color: colors.blueText,
                        fontFamily: fonts.bold,
                        minWidth: 48,
                      }}
                    >
                      {eventTime(item.time)}
                    </Copy>
                    <View style={{ flex: 1 }}>
                      <Copy style={{ fontFamily: fonts.bold }}>
                        {item.title}
                      </Copy>
                      {Boolean(item.description) && (
                        <Copy style={{ color: colors.muted }}>
                          {item.description}
                        </Copy>
                      )}
                    </View>
                  </View>
                ))
              ) : (
                <Copy>The race-day schedule is on its way.</Copy>
              )}
            </Section>
            {Boolean(event.rules?.length) && (
              <Section title="Before you run">
                {event.rules.map((rule) => (
                  <Copy key={rule.id}>• {rule.rule}</Copy>
                ))}
              </Section>
            )}
            {Boolean(event.faqs?.length) && (
              <Section title="Good to know">
                {event.faqs.map((faq) => (
                  <View key={faq.id}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: openFAQ === faq.id }}
                      onPress={() =>
                        setOpenFAQ(openFAQ === faq.id ? null : faq.id)
                      }
                      style={{ paddingVertical: 14 }}
                    >
                      <Copy style={{ fontFamily: fonts.bold }}>
                        {openFAQ === faq.id ? "−" : "+"} {faq.question}
                      </Copy>
                    </Pressable>
                    {openFAQ === faq.id && (
                      <Copy style={{ color: colors.muted, paddingBottom: 12 }}>
                        {faq.answer}
                      </Copy>
                    )}
                  </View>
                ))}
              </Section>
            )}
            <Section title="Meet us here">
              <Copy>{event.location || "Meeting point to be announced"}</Copy>
              {event.latitude != null && event.longitude != null && (
                <Button
                  secondary
                  title="Open location in Maps"
                  onPress={() => {
                    setLinkError("");
                    void Linking.openURL(
                      `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`,
                    ).catch(() =>
                      setLinkError("Could not open Maps. Please try again."),
                    );
                  }}
                />
              )}
              {Boolean(linkError) && (
                <Copy accessibilityRole="alert">{linkError}</Copy>
              )}
            </Section>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
