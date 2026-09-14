import { useState, type PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { colors, fonts } from "../constants/theme";
import { useApi, useOnline } from "../services/api/provider";
import { assetUrl } from "../features/events/format";
export function Copy({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.copy, style]} />;
}
export function Heading({
  children,
  large = false,
  style,
  numberOfLines,
}: PropsWithChildren<{
  large?: boolean;
  style?: TextProps["style"];
  numberOfLines?: TextProps["numberOfLines"];
}>) {
  return (
    <Text
      accessibilityRole="header"
      style={[styles.heading, large && { fontSize: 52, lineHeight: 59 }, style]}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}
export function Eyebrow({
  children,
  style,
}: PropsWithChildren<{ style?: TextProps["style"] }>) {
  return <Copy style={[styles.eyebrow, style]}>{children}</Copy>;
}
export function Button({
  title,
  onPress,
  busy = false,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress(): void;
  busy?: boolean;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: busy || disabled, busy }}
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        { opacity: busy || disabled ? 0.55 : pressed ? 0.75 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <Copy
          style={{
            fontFamily: fonts.bold,
            textAlign: "center",
            color: secondary ? colors.white : colors.ink,
          }}
        >
          {title}
        </Copy>
      )}
    </Pressable>
  );
}
export function Feedback({
  title,
  message,
  action,
  onAction,
}: {
  title: string;
  message?: string;
  action?: string;
  onAction?(): void;
}) {
  return (
    <View style={styles.feedback}>
      <Heading>{title}</Heading>
      {message && <Copy>{message}</Copy>}
      {action && onAction && <Button title={action} onPress={onAction} />}
    </View>
  );
}
export function OfflineNotice() {
  const online = useOnline();
  return online ? null : (
    <Copy
      accessibilityRole="alert"
      style={[styles.offline, { color: colors.ink }]}
    >
      You’re offline. Reconnect to get the latest event details.
    </Copy>
  );
}
export function Section({
  title,
  children,
}: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.section}>
      <Heading>{title}</Heading>
      {children}
    </View>
  );
}
export function EventImage({
  path,
  label,
  style,
}: {
  path: string;
  label: string;
  style?: ViewStyle;
}) {
  const { apiOrigin, webOrigin } = useApi();
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const uri = assetUrl(path, apiOrigin, webOrigin);
  return (
    <View style={[styles.image, style]}>
      {uri && path !== failedPath ? (
        <Image
          source={{ uri }}
          accessibilityLabel={label}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailedPath(path)}
        />
      ) : (
        <View style={styles.imageFallback}>
          <View
            style={{
              width: 36,
              height: 4,
              backgroundColor: colors.lime,
              marginBottom: 12,
            }}
          />
          <Text
            style={{
              fontFamily: fonts.display,
              fontSize: 48,
              color: colors.white,
            }}
          >
            UNITY RUN
          </Text>
          <Copy style={{ color: colors.white }}>Phnom Penh · Run together</Copy>
        </View>
      )}
    </View>
  );
}
export {
  TextField,
  DateField,
  ChipGroup,
  FormSection,
  FormNotice,
  formLayout,
} from "./forms";
export type { TextFieldProps } from "./forms";
export function LoadingCards() {
  return (
    <View
      accessibilityLabel="Loading events"
      accessibilityRole="progressbar"
      style={{ gap: 24, padding: 24 }}
    >
      {[0, 1].map((i) => (
        <View key={i} style={{ gap: 12 }}>
          <View
            style={{
              height: 235,
              backgroundColor: colors.canvas,
              borderRadius: 20,
            }}
          />
          <View
            style={{
              height: 25,
              width: "75%",
              backgroundColor: colors.canvas,
              borderRadius: 5,
            }}
          />
          <View
            style={{
              height: 16,
              width: "50%",
              backgroundColor: colors.canvas,
              borderRadius: 5,
            }}
          />
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  copy: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
    color: colors.white,
  },
  heading: {
    fontFamily: fonts.display,
    fontSize: 29,
    lineHeight: 36,
    color: colors.white,
  },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.lime,
    textTransform: "uppercase",
  },
  button: {
    backgroundColor: colors.lime,
    minHeight: 54,
    paddingHorizontal: 24,
    paddingVertical: 15,
    borderRadius: 16,
    justifyContent: "center",
  },
  secondary: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
  },
  feedback: { padding: 26, gap: 18 },
  section: {
    paddingVertical: 24,
    gap: 16,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  offline: { backgroundColor: colors.lime, padding: 14, fontSize: 13 },
  // Was `colors.blue` -- a full-bleed blue field reads as a second brand
  // color competing with lime. The fallback now sits on the same dark
  // surface as everything else; blue stays reserved for small,
  // event-specific accents (status text, a filled badge), never a field.
  image: { height: 250, overflow: "hidden", backgroundColor: colors.canvas },
  imageFallback: { flex: 1, justifyContent: "flex-end", padding: 24 },
});
