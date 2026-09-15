import { HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  activityBackgroundTint,
  background,
  font,
  foregroundStyle,
  frame,
  layoutPriority,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  padding,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";
import type { SFSymbol } from "sf-symbols-typescript";

export type RaceActivityStatus =
  "upcoming" | "check_in" | "starting" | "live" | "finished" | "cancelled";

export type RaceActivityProps = {
  eventName: string;
  location: string;
  raceDistance?: string;
  startTime: string;
  status: RaceActivityStatus;
  bibNumber?: string;
  gate?: string;
  elapsedSeconds?: number;
  elapsedStartedAt?: number;
  distanceKm?: number;
  pace?: string;
  finishTime?: string;
};

const RaceLiveActivityLayout = (
  props: RaceActivityProps,
  environment: LiveActivityEnvironment,
) => {
  "widget";
  // Everything the layout needs -- brand colors, status metadata, the timer
  // and badge helpers -- is declared INSIDE this function on purpose. Code
  // marked `'widget'` gets stringified and evaluated standalone in the
  // Widget Extension's own isolated JS runtime (see nativeBridge.ios.ts's
  // comment on the two-process split): only this function's own AST is
  // captured, so a module-level const or helper declared outside it (an
  // earlier version of this file had STATUS_META and ElapsedTimer up top)
  // is invisible at that eval site and silently fails to resolve --
  // Dynamic Island regions just render empty rather than throwing somewhere
  // visible. Nested declarations, by contrast, travel with the function.
  const INK = "#0c0c0c";
  const LIME = "#d9ff00";
  const BLUE_TEXT = "#7c93ff";
  const MUTED = "#a8a29e";

  const STATUS_META: Record<
    RaceActivityStatus,
    { label: string; icon: SFSymbol; tint: string }
  > = {
    upcoming: { label: "Upcoming", icon: "calendar", tint: LIME },
    check_in: { label: "Check-in", icon: "checkmark.circle.fill", tint: LIME },
    starting: { label: "Starting soon", icon: "hourglass", tint: LIME },
    live: { label: "Live", icon: "figure.run", tint: LIME },
    finished: { label: "Finished", icon: "flag.checkered", tint: BLUE_TEXT },
    cancelled: { label: "Cancelled", icon: "xmark.circle.fill", tint: MUTED },
  };

  /** A `Text` that counts up on-device via SwiftUI's own timer rendering --
   * no JS re-render, no per-second update() call, matching this codebase's
   * "update on domain events, not on a clock" rule (see
   * raceLiveActivity.service.ts's doc comment on item 12/14). Only valid
   * while status is "live". */
  function ElapsedTimer({
    elapsedSeconds,
    size,
    compact = false,
  }: {
    elapsedSeconds: number;
    size: number;
    compact?: boolean;
  }) {
    const start = new Date(props.elapsedStartedAt ?? Date.now() - elapsedSeconds * 1000);
    const farFuture = new Date(start.getTime() + 1000 * 60 * 60 * 24);
    return (
      <Text
        timerInterval={{ lower: start, upper: farFuture }}
        countsDown={false}
        modifiers={[
          font({ weight: "bold", design: "rounded", size }),
          monospacedDigit(),
          foregroundStyle(compact ? accent : INK),
          lineLimit(1),
          minimumScaleFactor(0.8),
          frame({
            minWidth: 0,
            maxWidth: compact ? 52 : 88,
            alignment: "trailing",
          }),
          layoutPriority(1),
        ]}
      />
    );
  }

  // Expo UI applies Text modifiers twice; keep badge padding/background on a stack.
  function Badge({ children }: { children: string }) {
    return (
      <HStack
        spacing={0}
        modifiers={[
          padding({ horizontal: 10, vertical: 5 }),
          background(accent, shapes.capsule()),
          frame({ maxWidth: 104, alignment: "trailing" }),
        ]}
      >
        <Text
          modifiers={[
            font({ weight: "bold", size: 12 }),
            foregroundStyle(INK),
            lineLimit(1),
            minimumScaleFactor(0.85),
          ]}
        >
          {children}
        </Text>
      </HStack>
    );
  }

  const meta = STATUS_META[props.status];
  const accent = environment.isLuminanceReduced ? "#ffffff" : meta.tint;
  const isLive = props.status === "live" && props.elapsedSeconds !== undefined;
  const isFinished = props.status === "finished" && Boolean(props.finishTime);
  const secondary = props.raceDistance
    ? `${props.location} · ${props.raceDistance}`
    : props.location;
  const badgeText = props.gate
    ? `Gate ${props.gate}`
    : (props.raceDistance ?? meta.label);
  const raceDetail = props.bibNumber ? `Bib ${props.bibNumber}` : secondary;
  const compactLabel = {
    upcoming: "Soon",
    check_in: "Check-in",
    starting: "Soon",
    live: "Live",
    finished: "Done",
    cancelled: "Ended",
  }[props.status];

  const statusRow = (
    <HStack spacing={6}>
      <Image systemName="circle.fill" color={accent} size={8} />
      <Text
        modifiers={[
          font({ weight: "bold", size: 11 }),
          foregroundStyle(accent),
          lineLimit(1),
          minimumScaleFactor(0.85),
        ]}
      >
        {meta.label.toUpperCase()}
      </Text>
    </HStack>
  );

  // The accent strip prioritizes race status and the live clock.
  const bottomBanner = (
    <HStack
      spacing={8}
      modifiers={[
        padding({ horizontal: 12, vertical: 8 }),
        background(accent, shapes.roundedRectangle({ cornerRadius: 12 })),
      ]}
    >
      <Image systemName={meta.icon} color={INK} size={16} />
      <VStack alignment="leading" spacing={1}>
        <Text
          modifiers={[
            font({ weight: "bold", size: 13 }),
            foregroundStyle(INK),
            lineLimit(1),
            minimumScaleFactor(0.85),
          ]}
        >
          {isLive ? "Live now" : isFinished ? "Finished" : meta.label}
        </Text>
        <Text
          modifiers={[
            font({ size: 11 }),
            foregroundStyle(INK),
            lineLimit(1),
            minimumScaleFactor(0.85),
          ]}
        >
          {isLive
            ? props.pace
              ? `${props.pace}/km pace`
              : raceDetail
            : isFinished
              ? `Finished in ${props.finishTime}`
              : raceDetail}
        </Text>
      </VStack>
      <Spacer />
      {isLive && (
        <ElapsedTimer elapsedSeconds={props.elapsedSeconds!} size={16} />
      )}
    </HStack>
  );

  // Full-width details live below the sensor, never in its narrow center region.
  const eventDetails = (
    <VStack alignment="leading" spacing={2}>
      <Text
        modifiers={[
          font({ weight: "bold", size: 16 }),
          foregroundStyle("#ffffff"),
          lineLimit(2),
          minimumScaleFactor(0.85),
        ]}
      >
        {props.eventName}
      </Text>
      <Text
        modifiers={[font({ size: 12 }), foregroundStyle(MUTED), lineLimit(1)]}
      >
        {secondary}
      </Text>
    </VStack>
  );

  return {
    banner: (
      <VStack
        alignment="leading"
        spacing={8}
        modifiers={[
          padding({ horizontal: 12, vertical: 10 }),
          activityBackgroundTint(INK),
        ]}
      >
        <HStack spacing={8}>
          {statusRow}
          <Spacer />
          <Badge>{badgeText}</Badge>
        </HStack>
        {eventDetails}
        {bottomBanner}
      </VStack>
    ),
    compactLeading: <Image systemName={meta.icon} color={accent} size={16} />,
    compactTrailing: isLive ? (
      <ElapsedTimer elapsedSeconds={props.elapsedSeconds!} size={12} compact />
    ) : (
      <Text
        modifiers={[
          font({ weight: "semibold", size: 12 }),
          foregroundStyle(accent),
          lineLimit(1),
          minimumScaleFactor(0.8),
          frame({ maxWidth: 52 }),
        ]}
      >
        {compactLabel}
      </Text>
    ),
    minimal: <Image systemName={meta.icon} color={accent} size={16} />,
    expandedLeading: (
      <HStack modifiers={[padding({ leading: 8, top: 2 })]}>
        <Image systemName={meta.icon} color={accent} size={20} />
      </HStack>
    ),
    expandedTrailing: (
      <HStack modifiers={[padding({ trailing: 8, top: 2 })]}>
        <Badge>{badgeText}</Badge>
      </HStack>
    ),
    expandedBottom: (
      <VStack
        alignment="leading"
        spacing={6}
        // Reserve space outside the backgrounds for the Island's curved edges.
        modifiers={[padding({ horizontal: 8, top: 2, bottom: 8 })]}
      >
        {eventDetails}
        {bottomBanner}
      </VStack>
    ),
  };
};

export default createLiveActivity<RaceActivityProps>(
  "RaceLiveActivity",
  RaceLiveActivityLayout,
);
