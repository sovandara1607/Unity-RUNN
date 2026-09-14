import {
  useId,
  useRef,
  useState,
  type PropsWithChildren,
  type Ref,
} from "react";
import {
  InputAccessoryView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../constants/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DatePickerControl from "./DatePickerControl";
import { formatDateValue, parseDateValue } from "./dateValue";

export function DateField({
  value = "",
  onChange,
  onBlur,
  error,
  disabled = false,
}: {
  value?: string;
  onChange(value: string): void;
  onBlur?(): void;
  error?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(new Date(2000, 0, 1, 12));
  const insets = useSafeAreaInsets();
  const date = parseDateValue(value);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const close = () => {
    setOpen(false);
    onBlur?.();
  };
  return (
    <View style={styles.field}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Date of birth"
        accessibilityValue={{
          text: date
            ? date.toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : "Not selected",
        }}
        accessibilityHint={error || "Opens the date picker"}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          setDraft(
            date && date.getFullYear() >= 1900 && date <= today
              ? date
              : new Date(2000, 0, 1, 12),
          );
          setOpen(true);
        }}
        style={[
          styles.inputShell,
          Boolean(error) && styles.invalid,
          open && styles.focused,
          disabled && styles.disabled,
        ]}
      >
        <View style={styles.inputContent}>
          <Text style={styles.label}>Date of birth</Text>
          <Text style={[styles.dateText, !date && { color: colors.muted }]}>
            {date
              ? date.toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "Select your date of birth"}
          </Text>
        </View>
        <View style={styles.reveal}>
          <Ionicons name="calendar-outline" size={22} color={colors.muted} />
        </View>
      </Pressable>
      {error && (
        <Text
          accessibilityRole="alert"
          style={[styles.help, { color: colors.error }]}
        >
          {error}
        </Text>
      )}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={close}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Cancel date selection"
            onPress={close}
          />
          <View
            accessibilityViewIsModal
            style={[
              styles.dateSheet,
              { paddingBottom: Math.max(insets.bottom, 20) },
            ]}
          >
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  Date of birth
                </Text>
                <Text style={styles.help}>
                  Choose your day, month, and year.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel date selection"
                onPress={close}
                style={styles.reveal}
              >
                <Ionicons name="close" size={24} color={colors.white} />
              </Pressable>
            </View>
            {open && (
              <DatePickerControl
                value={draft}
                maximumDate={today}
                onChange={setDraft}
              />
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onChange(formatDateValue(draft));
                close();
              }}
              style={styles.confirmDate}
            >
              <Text style={styles.confirmDateText}>Use this date</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export type TextFieldProps = Omit<TextInputProps, "style"> & {
  label: string;
  hint?: string;
  error?: string;
  ref?: Ref<TextInput>;
};

export function TextField({
  label,
  hint,
  error,
  ref,
  editable = true,
  secureTextEntry = false,
  onFocus,
  onBlur,
  ...props
}: TextFieldProps) {
  const input = useRef<TextInput>(null);
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const message = error || hint;
  const accessory =
    Platform.OS === "ios" &&
    ["phone-pad", "number-pad", "decimal-pad"].includes(
      props.keyboardType || "",
    );

  return (
    <View style={styles.field}>
      <View
        style={[
          styles.inputShell,
          focused && styles.focused,
          Boolean(error) && styles.invalid,
          !editable && styles.disabled,
        ]}
      >
        <View style={styles.inputContent}>
          <Text
            nativeID={`${id}-label`}
            onPress={() => {
              if (editable) input.current?.focus();
            }}
            style={[
              styles.label,
              focused && { color: colors.lime },
              Boolean(error) && { color: colors.error },
            ]}
          >
            {label}
          </Text>
          <TextInput
            {...props}
            ref={(node) => {
              input.current = node;
              if (typeof ref === "function") ref(node);
              else if (ref) ref.current = node;
            }}
            accessibilityLabel={label}
            accessibilityHint={message}
            aria-invalid={Boolean(error)}
            editable={editable}
            autoCorrect={props.autoCorrect ?? false}
            autoCapitalize={props.autoCapitalize ?? "none"}
            placeholderTextColor={colors.muted}
            selectionColor={colors.lime}
            cursorColor={colors.lime}
            keyboardAppearance="dark"
            secureTextEntry={secureTextEntry && !revealed}
            inputAccessoryViewID={accessory ? `${id}-keyboard` : undefined}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            style={styles.input}
          />
        </View>
        {secureTextEntry && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            accessibilityState={{ disabled: !editable }}
            disabled={!editable}
            onPress={() => setRevealed((value) => !value)}
            style={styles.reveal}
          >
            <Ionicons
              name={revealed ? "eye-off-outline" : "eye-outline"}
              size={22}
              color={colors.muted}
            />
          </Pressable>
        )}
      </View>
      {Boolean(message) && (
        <View style={styles.helpRow}>
          {Boolean(error) && (
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={colors.error}
            />
          )}
          <Text
            accessibilityRole={error ? "alert" : undefined}
            accessibilityLiveRegion="polite"
            style={[styles.help, Boolean(error) && { color: colors.error }]}
          >
            {message}
          </Text>
        </View>
      )}
      {accessory && (
        <InputAccessoryView nativeID={`${id}-keyboard`}>
          <View style={styles.keyboardBar}>
            <Pressable
              accessibilityRole="button"
              onPress={Keyboard.dismiss}
              style={styles.done}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </View>
  );
}

export function FormSection({
  title,
  description,
  children,
}: PropsWithChildren<{
  title: string;
  description?: string;
}>) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {title}
        </Text>
        {description && <Text style={styles.help}>{description}</Text>}
      </View>
      <View style={styles.fields}>{children}</View>
    </View>
  );
}

export function FormNotice({
  children,
  success = false,
}: PropsWithChildren<{ success?: boolean }>) {
  return (
    <View
      style={[
        styles.notice,
        { borderLeftColor: success ? colors.lime : colors.error },
      ]}
    >
      <Ionicons
        name={success ? "checkmark-circle-outline" : "alert-circle-outline"}
        size={20}
        color={success ? colors.lime : colors.error}
      />
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={styles.noticeText}
      >
        {children}
      </Text>
    </View>
  );
}

export function ChipGroup({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.choices, disabled && styles.disabled]}>
      <Text style={styles.choiceLabel}>{label}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={styles.choiceRow}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.choice,
                selected && styles.choiceSelected,
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text
                style={[styles.choiceText, selected && { color: colors.ink }]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const formLayout = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 48,
    gap: 30,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  intro: { gap: 12 },
  title: { fontSize: 42, lineHeight: 48 },
});

const styles = StyleSheet.create({
  dateText: {
    color: colors.white,
    fontFamily: fonts.medium,
    fontSize: 17,
    lineHeight: 27,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  dateSheet: {
    backgroundColor: colors.canvas,
    padding: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 12,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  confirmDate: {
    minHeight: 54,
    padding: 16,
    backgroundColor: colors.lime,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDateText: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  field: { gap: 8 },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 80,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    paddingLeft: 17,
    paddingRight: 10,
  },
  inputContent: { flex: 1, minWidth: 0, paddingVertical: 12, gap: 5 },
  label: {
    color: colors.muted,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 17,
  },
  input: {
    fontFamily: fonts.medium,
    fontSize: 17,
    color: colors.white,
    padding: 0,
    minHeight: 27,
    textAlignVertical: "center",
  },
  focused: { borderColor: colors.lime },
  invalid: { borderColor: colors.error },
  disabled: { opacity: 0.55 },
  reveal: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  helpRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 3,
    alignItems: "flex-start",
  },
  help: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    flexShrink: 1,
  },
  section: { gap: 18 },
  sectionHeader: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 22,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    color: colors.white,
    fontSize: 20,
    lineHeight: 27,
  },
  fields: { gap: 14 },
  choices: { gap: 10, paddingVertical: 5 },
  choiceLabel: {
    fontFamily: fonts.medium,
    color: colors.white,
    fontSize: 14,
    lineHeight: 20,
  },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    flexGrow: 1,
    minWidth: 48,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.canvas,
  },
  choiceSelected: { backgroundColor: colors.lime, borderColor: colors.lime },
  choiceText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.white,
  },
  notice: {
    flexDirection: "row",
    gap: 10,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 3,
    backgroundColor: colors.canvas,
  },
  noticeText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.white,
  },
  keyboardBar: {
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderColor: colors.line,
    alignItems: "flex-end",
  },
  done: { minHeight: 44, paddingHorizontal: 22, justifyContent: "center" },
  doneText: { fontFamily: fonts.bold, color: colors.lime, fontSize: 16 },
});
