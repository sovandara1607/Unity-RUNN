import { HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  activityBackgroundTint,
  background,
  font,
  foregroundStyle,
  padding,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";
import type { SFSymbol } from "sf-symbols-typescript";

export type RaceActivityStatus =
  | "upcoming"
  | "check_in"
  | "starting"
  | "live"
  | "finished"
  | "cancelled";

export type RaceActivityProps = {
  eventName: string;
  location: string;
  raceDistance?: string;
  startTime: string;
  status: RaceActivityStatus;
  bibNumber?: string;
  gate?: string;
  elapsedSeconds?: number;
  distanceKm?: number;
  pace?: string;
  finishTime?: string;
};

const RaceLiveActivityLayout = (props: RaceActivityProps, environment: LiveActivityEnvironment) => {
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

  const STATUS_META: Record<RaceActivityStatus, { label: string; icon: SFSymbol; tint: string }> = {
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
  function ElapsedTimer({ elapsedSeconds, size }: { elapsedSeconds: number; size: number }) {
    const start = new Date(Date.now() - elapsedSeconds * 1000);
    const farFuture = new Date(start.getTime() + 1000 * 60 * 60 * 24);
    return (
      <Text
        timerInterval={{ lower: start, upper: farFuture }}
        countsDown={false}
        modifiers={[font({ weight: "bold", design: "rounded", size }), foregroundStyle(INK)]}
      />
    );
  }

  /** A small pill badge -- the "A10" gate-style chip from the reference
   * design this layout follows: solid accent fill, dark text, capsule
   * shape. Used for bib/gate/distance callouts. */
  function Badge({ children }: { children: string }) {
    return (
      <Text
        modifiers={[
          font({ weight: "bold", size: 12 }),
          foregroundStyle(INK),
          padding({ horizontal: 9, vertical: 4 }),
          background(accent, shapes.capsule()),
        ]}
      >
        {children}
      </Text>
    );
  }

  const meta = STATUS_META[props.status];
  const accent = environment.isLuminanceReduced ? "#ffffff" : meta.tint;
  const isLive = props.status === "live" && props.elapsedSeconds !== undefined;
  const isFinished = props.status === "finished" && Boolean(props.finishTime);
  const secondary = props.raceDistance ? `${props.location} · ${props.raceDistance}` : props.location;
  const badgeText = props.gate ? `Gate ${props.gate}` : (props.raceDistance ?? meta.label);

  // The colored status row -- a small dot + label, mirroring the
  // reference's green "On Time" row.
  const statusRow = (
    <HStack spacing={6}>
      <Image systemName="circle.fill" color={accent} size={8} />
      <Text modifiers={[font({ weight: "bold", size: 11 }), foregroundStyle(accent)]}>
        {meta.label.toUpperCase()}
      </Text>
    </HStack>
  );

  // The full-width accent banner at the bottom -- the reference's orange
  // "Gate A10 · Departs in 45m" bar. Icon + two-line text, right-aligned
  // live timer when the race is actually running.
  const bottomBanner = (
    <HStack spacing={10} modifiers={[padding({ horizontal: 14, vertical: 10 }), background(accent, shapes.roundedRectangle({ cornerRadius: 14 }))]}>
      <Image systemName={meta.icon} color={INK} size={16} />
      <VStack alignment="leading" spacing={1}>
        <Text modifiers={[font({ weight: "bold", size: 13 }), foregroundStyle(INK)]}>
          {isLive ? "Live now" : isFinished ? "Finished" : meta.label}
        </Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(INK)]}>
          {isLive
            ? props.pace
              ? `${props.pace}/km pace`
              : secondary
            : isFinished
              ? `Finished in ${props.finishTime}`
              : secondary}
        </Text>
      </VStack>
      <Spacer />
      {isLive && <ElapsedTimer elapsedSeconds={props.elapsedSeconds!} size={16} />}
    </HStack>
  );

  return {
    banner: (
      <VStack alignment="leading" spacing={10} modifiers={[padding({ all: 16 }), activityBackgroundTint(INK)]}>
        <HStack>
          {statusRow}
          <Spacer />
          <Badge>{badgeText}</Badge>
        </HStack>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ weight: "bold", size: 18 })]}>{props.eventName}</Text>
          <Text modifiers={[font({ size: 13 }), foregroundStyle(MUTED)]}>{secondary}</Text>
        </VStack>
        {bottomBanner}
      </VStack>
    ),
    compactLeading: <Image systemName="circle.fill" color={accent} size={10} />,
    compactTrailing: isLive ? (
      <ElapsedTimer elapsedSeconds={props.elapsedSeconds!} size={13} />
    ) : (
      <Badge>{badgeText}</Badge>
    ),
    minimal: <Image systemName="circle.fill" color={accent} size={10} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={3}>
        <Image systemName={meta.icon} color={accent} size={16} />
        {props.bibNumber && (
          <Text modifiers={[font({ weight: "bold", size: 11 }), foregroundStyle(MUTED)]}>
            Bib {props.bibNumber}
          </Text>
        )}
      </VStack>
    ),
    expandedTrailing: <Badge>{badgeText}</Badge>,
    expandedCenter: (
      <VStack alignment="leading" spacing={3}>
        <Text modifiers={[font({ weight: "bold", size: 15 })]}>{props.eventName}</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(MUTED)]}>{secondary}</Text>
      </VStack>
    ),
    expandedBottom: <VStack modifiers={[padding({ top: 6 })]}>{bottomBanner}</VStack>,
  };
};

export default createLiveActivity<RaceActivityProps>("RaceLiveActivity", RaceLiveActivityLayout);
