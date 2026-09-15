import { useState } from "react";
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
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
import { useApi } from "../../services/api/provider";
import { useEvent } from "./queries";
import { eventDate, eventTime, money, statusLabel } from "./format";
export default function EventDetailScreen() {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const query = useEvent(slug ?? "");
  const { webOrigin } = useApi();
  const [openFAQ, setOpenFAQ] = useState<string | null>(null);
  const [linkError, setLinkError] = useState("");
  const event = query.data;
  const onShare = () => {
    if (!event) return;
    const url = `${webOrigin}/events/${event.slug}`;
    void Share.share({ message: `${event.name} · Unity Runn Club\n${url}`, url });
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <Stack.Screen
        options={{
          title: "Race details",
          headerBackTitle: "Events",
          headerRight: () =>
            event ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share this race"
                onPress={onShare}
                hitSlop={10}
              >
                <Ionicons name="share-outline" size={22} color={colors.white} />
              </Pressable>
            ) : null,
        }}
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
          <View style={{ height: 280 }}>
            {/* Photo, then the name in a plain text block below it -- not
                overlaid on a scrim. The overlay treatment this replaced
                needed the subject framed low enough in the shot for the
                scrim to sit behind the text; Events home's NextUpCard hit
                that exact problem (confirmed by screenshot: a real cover
                photo cropped mostly-sky at the top), and got the same fix.
                One photo-card language for the whole app now: photo + a
                corner status pill, text below. */}
            <EventImage
              path={event.cover_image}
              label={event.name}
              style={{ height: 280 }}
            />
            <View
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                backgroundColor: event.status === "REGISTRATION_OPEN" ? colors.blue : "rgba(23,23,23,0.85)",
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <Copy style={{ color: colors.white, fontSize: 12, fontFamily: fonts.bold }}>
                {statusLabel[event.status]}
              </Copy>
            </View>
          </View>
          <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>
            {/* One line, not a wrap -- a long real event name (e.g.
                "Riverside Sunset 5K") otherwise breaks mid-title at this
                size. adjustsFontSizeToFit scales the glyph down to fit,
                same technique already used for the Events home numeral. */}
            {/* Deliberate rhythm, not a flat stack of same-size gaps: the
                name/chips/meta row are one tight cluster (what, at what
                distance, when, where -- all facts about the same race, 12px
                apart), then a clear break before the CTA (24px -- this is
                the one decision the screen exists for, not another fact),
                then a bigger break after it (28px) before the reading
                content below, so "act now" and "read later" don't blur
                together the way a single uniform gap would. */}
            <Heading
              large
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
              style={{ marginBottom: 12 }}
            >
              {event.name}
            </Heading>
            {Boolean(event.categories?.length) && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {Array.from(new Set(event.categories.map((c) => c.distance))).map((distance) => (
                  <View
                    key={distance}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.line,
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                    }}
                  >
                    <Copy style={{ fontSize: 12, fontFamily: fonts.bold }}>{distance}</Copy>
                  </View>
                ))}
              </View>
            )}
            <View style={{ gap: 8, marginBottom: 24 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="calendar-outline" size={16} color={colors.muted} />
                <Copy style={{ color: colors.muted, fontSize: 13 }}>
                  {eventDate(event.event_date)} · {eventTime(event.start_time)} (Cambodia time)
                </Copy>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="location-outline" size={16} color={colors.muted} />
                <Copy style={{ color: colors.muted, fontSize: 13 }}>
                  {event.location || "Location to be announced"}
                </Copy>
              </View>
            </View>
            {event.status === "REGISTRATION_OPEN" &&
              Boolean(event.categories?.some((c) => c.status === "OPEN")) && (
                <View style={{ marginBottom: 28 }}>
                  <Button
                    title="Claim your place"
                    onPress={() => router.push(`/events/${event.slug}/register`)}
                  />
                </View>
              )}
            {query.isError && (
              <Copy
                accessibilityRole="alert"
                style={{ color: colors.error, marginBottom: 20 }}
              >
                Could not refresh. Showing the last loaded details.
              </Copy>
            )}
            {/* noTopBorder: Section's usual top hairline sat directly against
                whatever came right before it -- the "Claim your place"
                button when registration is open, or (as reported: a
                screenshot of exactly this) the plain meta rows with no
                button in between for a completed race, where the line
                landed close enough to read as a stray artifact rather than
                a deliberate divider. The header block above already has
                real visual weight (photo, headline, chips), so this first
                section doesn't need its own separator; the ones between
                About/Schedule/Meet-us-here further down still do the real
                job of separating otherwise-identical text blocks. */}
            <Section title="About the run" noTopBorder>
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
              {event.latitude != null && event.longitude != null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open location in Maps"
                  onPress={() => {
                    setLinkError("");
                    void Linking.openURL(
                      `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`,
                    ).catch(() =>
                      setLinkError("Could not open Maps. Please try again."),
                    );
                  }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    backgroundColor: colors.canvas,
                    borderRadius: 16,
                    padding: 16,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: colors.ink,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="location" size={20} color={colors.lime} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Copy style={{ fontFamily: fonts.bold }}>
                      {event.location || "Meeting point to be announced"}
                    </Copy>
                    <Copy style={{ color: colors.blueText, fontSize: 12, marginTop: 2 }}>
                      Open in Maps →
                    </Copy>
                  </View>
                </Pressable>
              ) : (
                <Copy>{event.location || "Meeting point to be announced"}</Copy>
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
