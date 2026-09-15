import { Easing, withDelay, withTiming } from "react-native-reanimated";

/** A single custom entering animation (scale 0.97 -> 1, fade in) shared by
 * every list/card item across the app, staggered by position. Fast (220ms)
 * and eased out, not a floaty spring -- matches a sports-brand feel rather
 * than a soft consumer-app one. Extracted from EventListScreen so the Race
 * Wallet redesign reuses the exact same primitive instead of a near-copy. */
export function cardEntering(index: number) {
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
