import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { colors, fonts } from "../../constants/theme";
import { Copy, Eyebrow } from "../../components/ui";
import { useApi } from "../../services/api/provider";
import { assetUrl } from "./format";
import { useSiteConfig } from "./queries";
const { width: SCREEN_WIDTH } = Dimensions.get("window");
// Shorter than the first pass (400 -> 300): this sits above a screen whose
// whole point is a smaller hero than before. A full-height photo carousel
// would just reintroduce the "hero eats the screen" problem one section down.
const SLIDE_HEIGHT = 300;
const AUTO_ADVANCE_MS = 6500;
// Stacked bands approximate a gradient without a library dependency. The
// solid zone has to be tall enough for the ENTIRE caption block, including
// `Copy`'s shared lineHeight:23 which the title/description below override
// explicitly -- an earlier version left that implicit, underestimated the
// real text height by ~25pt, and the title landed partly in the faded zone:
// legible in theory (verified against 0.85 opacity) but not in practice,
// because that opacity wasn't actually behind it. Confirmed by screenshot,
// not just recomputed on paper this time.
const SCRIM_BANDS = [
  { height: 35, opacity: 0 },
  { height: 25, opacity: 0.4 },
  { height: 150, opacity: 0.88 },
];
const SCRIM_HEIGHT = SCRIM_BANDS.reduce((sum, b) => sum + b.height, 0);
/** Mirrors the web homepage hero (frontend/src/components/ClubCarousel.tsx):
 * same GET /api/v1/site-config source, same auto-advance interval, same
 * pause-on-interaction and reduced-motion behavior. Not a mobile-only
 * carousel invented separately from the real one. */
export function HeroCarousel() {
  const { apiOrigin, webOrigin } = useApi();
  const query = useSiteConfig();
  const slides = query.data?.hero_slides ?? [];
  const [active, setActive] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const listRef = useRef<FlatList>(null);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (reducedMotion || interacting || slides.length < 2) return;
    const timer = setInterval(() => {
      setActive((current) => {
        const next = (current + 1) % slides.length;
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [reducedMotion, interacting, slides.length]);
  if (query.isPending || slides.length === 0) return null;
  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActive(Math.max(0, Math.min(index, slides.length - 1)));
  };
  return (
    <View style={{ height: SLIDE_HEIGHT }}>
      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(slide, index) => `${slide.image_url}-${index}`}
        onScrollBeginDrag={() => setInteracting(true)}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        renderItem={({ item }) => {
          const uri = assetUrl(item.image_url, apiOrigin, webOrigin);
          return (
            <View style={{ width: SCREEN_WIDTH, height: SLIDE_HEIGHT }}>
              {uri && (
                <Image
                  source={{ uri }}
                  accessibilityLabel={item.alt}
                  style={{ position: "absolute", width: SCREEN_WIDTH, height: SLIDE_HEIGHT }}
                  resizeMode="cover"
                />
              )}
              <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: SCRIM_HEIGHT }}>
                {SCRIM_BANDS.map((band, i) => (
                  <View
                    key={i}
                    style={{
                      height: band.height,
                      backgroundColor: `rgba(12,12,12,${band.opacity})`,
                    }}
                  />
                ))}
              </View>
              <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 18, gap: 4 }}>
                <Eyebrow style={{ lineHeight: 14 }}>{item.eyebrow}</Eyebrow>
                <Copy
                  style={{
                    fontFamily: fonts.display,
                    fontSize: 22,
                    lineHeight: 25,
                    letterSpacing: 0.3,
                  }}
                >
                  {item.title}
                </Copy>
                <Copy
                  style={{ color: colors.muted, fontSize: 12.5, lineHeight: 17 }}
                  numberOfLines={2}
                >
                  {item.copy}
                </Copy>
              </View>
            </View>
          );
        }}
      />
      {slides.length > 1 && (
        <View
          style={{
            position: "absolute",
            bottom: 16,
            right: 18,
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
          }}
        >
          <View style={{ flexDirection: "row", gap: 6 }}>
            {slides.map((slide, index) => (
              <Pressable
                key={`${slide.image_url}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`Show slide ${index + 1}: ${slide.title}`}
                accessibilityState={{ selected: index === active }}
                hitSlop={8}
                onPress={() => {
                  setActive(index);
                  listRef.current?.scrollToIndex({ index, animated: true });
                }}
                style={{
                  width: index === active ? 20 : 6,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: index === active ? colors.lime : "rgba(255,255,255,0.4)",
                }}
              />
            ))}
          </View>
          <Copy style={{ fontSize: 10, fontFamily: fonts.bold, color: colors.muted, letterSpacing: 0.5 }}>
            {String(active + 1).padStart(2, "0")}/{String(slides.length).padStart(2, "0")}
          </Copy>
        </View>
      )}
    </View>
  );
}
