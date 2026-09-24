import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useQuery } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  ChipGroup,
  Copy,
  Eyebrow,
  Feedback,
  Heading,
  LoadingCards,
  OfflineNotice,
  TextField,
  DateField,
  FormSection,
  FormNotice,
  formLayout,
} from "../../components/ui";
import { colors, fonts } from "../../constants/theme";
import { useApi, useSession } from "../../services/api/provider";
import type { Me, PaymentCheckout } from "../../services/api/types";
import { useEvent, useCategoryAvailability } from "./queries";
import {
  useMyRegistrations,
  useRegisterForEvent,
} from "../registrations/queries";
import { BankQRPayment } from "../payment/BakongPayment";
import { ApiError } from "../../services/api/client";
import {
  money,
  registrationDeadlineClosed,
  registrationDeadlineLabel,
} from "./format";

const schema = z.object({
  full_name: z.string().trim().min(1, "Enter your full name."),
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
  phone: z.string().trim().min(1, "Enter your phone number."),
  date_of_birth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose your date of birth."),
  emergency_contact_name: z
    .string()
    .trim()
    .min(1, "Add an emergency contact name."),
  emergency_contact_phone: z
    .string()
    .trim()
    .min(1, "Add an emergency contact phone number."),
});
type Values = z.infer<typeof schema>;

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];
const SHIRT_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL"].map((size) => ({
  value: size,
  label: size,
}));

export default function RegisterScreen() {
  const headerHeight = useHeaderHeight();
  const inputs = useRef<Partial<Record<keyof Values, TextInput | null>>>({});
  const params = useLocalSearchParams<{ slug: string; category?: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const { session } = useApi();
  const state = useSession();
  const eventQuery = useEvent(slug ?? "");
  const event = eventQuery.data;
  const mine = useMyRegistrations();
  const register = useRegisterForEvent(event?.id);
  const [category, setCategory] = useState(
    Array.isArray(params.category) ? params.category[0] : params.category || "",
  );
  const [gender, setGender] = useState("OTHER");
  const [tshirtSize, setTshirtSize] = useState("M");
  const [submitError, setSubmitError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [payment, setPayment] = useState<PaymentCheckout | null>(null);

  const profile = useQuery({
    queryKey: ["me", state.user?.id],
    enabled: state.status === "authenticated",
    queryFn: ({ signal }) => session.request<Me>("/api/v1/me/", { signal }),
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      full_name: "",
      email: "",
      phone: "",
      date_of_birth: "",
      emergency_contact_name: "",
      emergency_contact_phone: "",
    },
  });

  useEffect(() => {
    if (!profile.data) return;
    const p = profile.data.profile;
    reset({
      full_name: p?.full_name || profile.data.name || "",
      email: profile.data.email || "",
      phone: p?.phone || "",
      date_of_birth: p?.date_of_birth?.slice(0, 10) || "",
      emergency_contact_name: p?.emergency_contact_name || "",
      emergency_contact_phone: p?.emergency_contact_phone || "",
    });
    if (p?.gender) setGender(p.gender);
    if (p?.tshirt_size) setTshirtSize(p.tshirt_size);
    // Only when the profile first loads — the runner may then edit any field for this race.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data]);

  const openCategories = useMemo(
    () => event?.categories?.filter((c) => c.status === "OPEN") || [],
    [event],
  );
  const availability = useCategoryAvailability(
    event?.id,
    openCategories.map((c) => c.id),
  );
  const selected = openCategories.find((c) => c.id === category) || null;
  const canRegister =
    event?.status === "REGISTRATION_OPEN" && openCategories.length > 0;

  // A category can fill up or hit its own cutoff (registration_deadline) while the runner is
  // still filling out the form -- catch that here instead of letting them submit into a
  // confusing "registration is not open" error after finishing every field.
  useEffect(() => {
    if (!category) return;
    const stillOpen = openCategories.find((c) => c.id === category);
    const unavailable =
      !stillOpen ||
      availability[category]?.available === 0 ||
      registrationDeadlineClosed(stillOpen.registration_deadline);
    if (unavailable) {
      setCategory("");
      setSubmitError(
        `${stillOpen?.name || "That entry"} just filled up while you were entering your details. Choose another distance to continue.`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, openCategories]);

  const existingEntry = (mine.data || []).find(
    (r) =>
      r.event_id === event?.id &&
      (r.status === "PENDING" || r.status === "CONFIRMED"),
  );

  const submit = handleSubmit(async (values) => {
    if (!event) return;
    if (!category) {
      setSubmitError("Choose an entry category to continue.");
      return;
    }
    setSubmitError("");
    const payload = {
      event_category_id: category,
      full_name: values.full_name,
      email: values.email,
      phone: values.phone,
      gender,
      date_of_birth: values.date_of_birth,
      emergency_contact_name: values.emergency_contact_name,
      emergency_contact_phone: values.emergency_contact_phone,
      tshirt_size: tshirtSize,
    };
    // The category is briefly locked per in-flight checkout (see registrations.Locker,
    // 5s TTL) -- a "busy" 429 means someone else is mid-checkout for the same category, not
    // that this entry failed, so retry a couple of times before bothering the runner with it.
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const result = await register.mutateAsync(payload);
        setRetrying(false);
        if (result.payment?.status === "PENDING") {
          setPayment(result.payment);
          return;
        }
        router.replace("/(tabs)/account");
        return;
      } catch (caught) {
        const busy = caught instanceof ApiError && caught.code === "busy";
        if (busy && attempt < attempts) {
          setRetrying(true);
          await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
          continue;
        }
        setRetrying(false);
        setSubmitError(
          caught instanceof Error
            ? caught.message
            : "Registration could not be completed.",
        );
        return;
      }
    }
  });

  if (state.status === "loading" || eventQuery.isLoading)
    return <LoadingCards />;
  if (state.status !== "authenticated") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink, paddingTop: 60 }}>
        <Stack.Screen options={{ title: "Sign in required" }} />
        <Feedback
          title="Sign in to enter"
          message="Create an account or sign in to claim your place."
          action="Sign in"
          onAction={() => router.push("/(auth)/login")}
        />
      </View>
    );
  }
  if (eventQuery.isError || !event) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink, paddingTop: 60 }}>
        <Stack.Screen options={{ title: "Registration" }} />
        <Feedback
          title="This entry isn't ready"
          message="The event could not be loaded. Go back and choose another run."
        />
      </View>
    );
  }
  if (existingEntry) {
    const pending = existingEntry.status === "PENDING";
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink, paddingTop: 60 }}>
        <Stack.Screen options={{ title: "Already entered" }} />
        <View style={{ padding: 26, gap: 18 }}>
          <Eyebrow>{pending ? "Payment outstanding" : "You are in"}</Eyebrow>
          <Heading large>
            {pending ? "Finish your entry." : "Already entered."}
          </Heading>
          <Copy style={{ color: colors.muted }}>
            {pending
              ? `You have an unpaid place for ${event.name}. Finish the payment from your race wallet.`
              : `Your place for ${event.name} is confirmed. Find your ticket in your race wallet.`}
          </Copy>
          <Copy style={{ fontFamily: fonts.bold, color: colors.muted }}>
            {existingEntry.registration_number || existingEntry.id.slice(0, 8)}
          </Copy>
          <Button
            title={pending ? "Finish payment" : "View my ticket"}
            onPress={() => router.push("/(tabs)/account")}
          />
        </View>
      </View>
    );
  }
  if (!canRegister) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink, paddingTop: 60 }}>
        <Stack.Screen options={{ title: "Registration closed" }} />
        <Feedback
          title="Start line unavailable"
          message={
            event.status === "REGISTRATION_CLOSED"
              ? "Registration has closed for this event."
              : "This event is not currently accepting entries."
          }
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.ink }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={headerHeight}
    >
      <Stack.Screen options={{ title: "Claim your place" }} />
      {payment && (
        <BankQRPayment
          checkout={payment}
          eventName={event.name}
          onPaid={() => {
            setPayment(null);
            router.replace("/(tabs)/account");
          }}
          onClose={() => {
            setPayment(null);
            router.replace("/(tabs)/account");
          }}
        />
      )}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={formLayout.content}
      >
        <View style={formLayout.intro}>
          <Eyebrow>{event.name}</Eyebrow>
          <Heading style={formLayout.title}>
            YOUR PLACE ON{"\n"}THE START LINE.
          </Heading>
          <Copy style={{ color: colors.muted }}>
            Choose your distance and check your runner details. All fields are
            required.
          </Copy>
        </View>
        <FormSection title="Choose your entry">
          {openCategories.map((item) => {
            const isSelected = item.id === category;
            const full = availability[item.id]?.available === 0;
            const deadlineClosed = registrationDeadlineClosed(
              item.registration_deadline,
            );
            const unavailable = full || deadlineClosed;
            const status = full
              ? "Full"
              : deadlineClosed
                ? "Entry closed"
                : registrationDeadlineLabel(item.registration_deadline);
            return (
              <Pressable
                key={item.id}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: isSelected,
                  disabled: unavailable || isSubmitting,
                }}
                disabled={unavailable || isSubmitting}
                onPress={() => {
                  setCategory(item.id);
                  setSubmitError("");
                }}
                style={({ pressed }) => ({
                  padding: 18,
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: isSelected ? colors.lime : colors.line,
                  backgroundColor: colors.canvas,
                  gap: 10,
                  opacity: unavailable ? 0.5 : pressed ? 0.75 : 1,
                })}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 1.5,
                      borderColor: isSelected ? colors.lime : colors.muted,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isSelected && (
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: colors.lime,
                        }}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Copy style={{ fontFamily: fonts.bold, fontSize: 18 }}>
                      {item.distance}
                    </Copy>
                    <Copy style={{ color: colors.muted, fontSize: 13 }}>
                      {item.name}
                    </Copy>
                  </View>
                  <Copy
                    style={{
                      fontFamily: fonts.bold,
                      color: isSelected ? colors.lime : colors.white,
                    }}
                  >
                    {money(item.price_cents, item.currency)}
                  </Copy>
                </View>
                {status && (
                  <Copy style={{ color: colors.muted, fontSize: 12 }}>
                    {status}
                  </Copy>
                )}
              </Pressable>
            );
          })}
        </FormSection>

        <FormSection
          title="Runner details"
          description="Your confirmation and race updates go to this email address."
        >
          {(
            [
              ["full_name", "Full name", "Your full name"],
              ["email", "Email address", "you@example.com"],
              ["phone", "Phone number", "+855"],
            ] as const
          ).map(([name, label, placeholder]) => (
            <Controller
              key={name}
              control={control}
              name={name}
              render={({ field: { value, onChange, onBlur, ref } }) => (
                <TextField
                  ref={(node) => {
                    ref(node);
                    inputs.current[name] = node;
                  }}
                  label={label}
                  placeholder={placeholder}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors[name]?.message}
                  editable={!isSubmitting}
                  autoCapitalize={name === "full_name" ? "words" : "none"}
                  autoComplete={
                    name === "full_name"
                      ? "name"
                      : name === "email"
                        ? "email"
                        : "tel"
                  }
                  keyboardType={
                    name === "email"
                      ? "email-address"
                      : name === "phone"
                        ? "phone-pad"
                        : "default"
                  }
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() =>
                    inputs.current[
                      name === "full_name" ? "email" : "phone"
                    ]?.focus()
                  }
                />
              )}
            />
          ))}
          <Controller
            control={control}
            name="date_of_birth"
            render={({ field: { value, onChange, onBlur } }) => (
              <DateField
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                error={errors.date_of_birth?.message}
                disabled={isSubmitting}
              />
            )}
          />
          <ChipGroup
            label="Gender"
            options={GENDER_OPTIONS}
            value={gender}
            onChange={setGender}
            disabled={isSubmitting}
          />
        </FormSection>

        <FormSection
          title="Race shirt"
          description="Choose your size for this event."
        >
          <ChipGroup
            label="Unisex shirt size"
            options={SHIRT_OPTIONS}
            value={tshirtSize}
            onChange={setTshirtSize}
            disabled={isSubmitting}
          />
        </FormSection>

        <FormSection
          title="Emergency contact"
          description="Someone we can reach if you need help on race day."
        >
          {(
            [
              [
                "emergency_contact_name",
                "Contact’s full name",
                "Their full name",
              ],
              ["emergency_contact_phone", "Contact’s phone number", "+855"],
            ] as const
          ).map(([name, label, placeholder]) => (
            <Controller
              key={name}
              control={control}
              name={name}
              render={({ field: { value, onChange, onBlur, ref } }) => (
                <TextField
                  ref={(node) => {
                    ref(node);
                    inputs.current[name] = node;
                  }}
                  label={label}
                  placeholder={placeholder}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors[name]?.message}
                  editable={!isSubmitting}
                  autoCapitalize={
                    name === "emergency_contact_name" ? "words" : "none"
                  }
                  keyboardType={
                    name === "emergency_contact_phone" ? "phone-pad" : "default"
                  }
                  returnKeyType={
                    name === "emergency_contact_name" ? "next" : "done"
                  }
                  onSubmitEditing={() => {
                    if (name === "emergency_contact_name")
                      inputs.current.emergency_contact_phone?.focus();
                  }}
                />
              )}
            />
          ))}
        </FormSection>

        <View
          style={{
            gap: 18,
            paddingTop: 22,
            borderTopWidth: 1,
            borderTopColor: colors.line,
          }}
        >
          {Boolean(submitError) && <FormNotice>{submitError}</FormNotice>}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <View style={{ flex: 1 }}>
              <Copy style={{ fontFamily: fonts.bold }}>Total due</Copy>
              <Copy style={{ color: colors.muted, fontSize: 13 }}>
                {selected ? selected.name : "Choose an entry above"}
              </Copy>
            </View>
            <Copy
              style={{ fontSize: 26, lineHeight: 32, fontFamily: fonts.bold }}
            >
              {selected ? money(selected.price_cents, selected.currency) : "—"}
            </Copy>
          </View>
          <Button
            title={retrying ? "Retrying" : "Claim my place"}
            busy={isSubmitting || register.isPending}
            disabled={!category}
            onPress={() => {
              void submit();
            }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
