import { useState, type PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
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
}: PropsWithChildren<{ large?: boolean }>) {
  return (
    <Text
      accessibilityRole="header"
      style={[styles.heading, large && { fontSize: 52, lineHeight: 59 }]}
    >
      {children}
    </Text>
  );
}
export function Eyebrow({ children }: PropsWithChildren) {
  return <Copy style={styles.eyebrow}>{children}</Copy>;
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
        <Copy style={{ fontFamily: fonts.bold, textAlign: "center" }}>
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
    <Copy accessibilityRole="alert" style={styles.offline}>
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
          <Text
            style={{
              fontFamily: fonts.display,
              fontSize: 48,
              color: colors.white,
            }}
          >
            UNITY RUNN
          </Text>
          <Copy style={{ color: colors.white }}>Phnom Penh · Run together</Copy>
        </View>
      )}
    </View>
  );
}
export function TextField({
  label,
  error,
  hint,
  style,
  ...props
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <Copy style={{ fontFamily: fonts.bold }}>{label}</Copy>
        {hint && <Copy style={{ fontSize: 11, color: colors.muted }}>{hint}</Copy>}
      </View>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[
          {
            minHeight: 54,
            borderWidth: 1,
            borderColor: error ? colors.error : colors.line,
            borderRadius: 14,
            padding: 15,
            backgroundColor: colors.canvas,
            fontFamily: fonts.body,
            fontSize: 16,
            color: colors.ink,
          },
          style,
        ]}
      />
      {Boolean(error) && (
        <Copy accessibilityRole="alert" style={{ color: colors.error, fontSize: 13 }}>
          {error}
        </Copy>
      )}
    </View>
  );
}
export function ChipGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange(value: string): void;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Copy style={{ fontFamily: fonts.bold }}>{label}</Copy>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? colors.ink : colors.line,
                backgroundColor: selected ? colors.ink : colors.white,
              }}
            >
              <Copy
                style={{
                  fontFamily: fonts.bold,
                  fontSize: 13,
                  color: selected ? colors.white : colors.ink,
                }}
              >
                {option.label}
              </Copy>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
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
              backgroundColor: colors.line,
              borderRadius: 20,
            }}
          />
          <View
            style={{
              height: 25,
              width: "75%",
              backgroundColor: colors.line,
              borderRadius: 5,
            }}
          />
          <View
            style={{
              height: 16,
              width: "50%",
              backgroundColor: colors.line,
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
    color: colors.ink,
  },
  heading: {
    fontFamily: fonts.display,
    fontSize: 29,
    lineHeight: 36,
    color: colors.ink,
  },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.muted,
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
  image: { height: 250, overflow: "hidden", backgroundColor: colors.blue },
  imageFallback: { flex: 1, justifyContent: "flex-end", padding: 24 },
});
