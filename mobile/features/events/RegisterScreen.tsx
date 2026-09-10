import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
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
} from "../../components/ui";
import { colors, fonts } from "../../constants/theme";
import { useApi, useSession } from "../../services/api/provider";
import type { Me, PaymentCheckout } from "../../services/api/types";
import { useEvent, useCategoryAvailability } from "./queries";
import { useMyRegistrations, useRegisterForEvent } from "../registrations/queries";
import { BakongPayment } from "../payment/BakongPayment";
import { ApiError } from "../../services/api/client";
import { money, registrationDeadlineClosed, registrationDeadlineLabel } from "./format";

const schema = z.object({
  full_name: z.string().trim().min(1, "Enter your full name."),
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
  phone: z.string().trim().min(1, "Enter your phone number."),
  date_of_birth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD."),
  emergency_contact_name: z.string().trim().min(1, "Add an emergency contact name."),
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
  const canRegister = event?.status === "REGISTRATION_OPEN" && openCategories.length > 0;

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
      r.event_id === event?.id && (r.status === "PENDING" || r.status === "CONFIRMED"),
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
          caught instanceof Error ? caught.message : "Registration could not be completed.",
        );
        return;
      }
    }
  });

  if (state.status === "loading" || eventQuery.isLoading) return <LoadingCards />;
  if (state.status !== "authenticated") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.white, paddingTop: 60 }}>
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
      <View style={{ flex: 1, backgroundColor: colors.white, paddingTop: 60 }}>
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
      <View style={{ flex: 1, backgroundColor: colors.white, paddingTop: 60 }}>
        <Stack.Screen options={{ title: "Already entered" }} />
        <View style={{ padding: 26, gap: 18 }}>
          <Eyebrow>{pending ? "Payment outstanding" : "You are in"}</Eyebrow>
          <Heading large>{pending ? "Finish your entry." : "Already entered."}</Heading>
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
      <View style={{ flex: 1, backgroundColor: colors.white, paddingTop: 60 }}>
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
      style={{ flex: 1, backgroundColor: colors.white }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen options={{ title: "Claim your place" }} />
      {payment && (
        <BakongPayment
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
        contentContainerStyle={{ padding: 26, gap: 24, paddingBottom: 50 }}
      >
        <Eyebrow>Registration open · {event.name}</Eyebrow>
        <Heading large>CLAIM YOUR{"\n"}START LINE.</Heading>

        <View style={{ gap: 12 }}>
          <Copy style={{ fontFamily: fonts.bold }}>01 · Choose your entry</Copy>
          <View style={{ gap: 10 }}>
            {openCategories.map((item) => {
              const isSelected = item.id === category;
              const itemAvailability = availability[item.id];
              const full = itemAvailability?.available === 0;
              const deadlineClosed = registrationDeadlineClosed(item.registration_deadline);
              const unavailable = full || deadlineClosed;
              const deadlineLabel = registrationDeadlineLabel(item.registration_deadline);
              const status = full
                ? " · Full"
                : deadlineClosed
                  ? " · Cutoff passed"
                  : deadlineLabel
                    ? ` · ${deadlineLabel}`
                    : "";
              return (
                <Button
                  key={item.id}
                  disabled={unavailable}
                  secondary={!isSelected}
                  title={`${item.distance} · ${item.name} — ${money(item.price_cents, item.currency)}${status}`}
                  onPress={() => {
                    setCategory(item.id);
                    setSubmitError("");
                  }}
                />
              );
            })}
          </View>
        </View>

        <View style={{ gap: 18 }}>
          <Copy style={{ fontFamily: fonts.bold }}>02 · Runner details</Copy>
          {(
            [
              ["full_name", "Full name", "name" as const],
              ["email", "Email", "email" as const],
              ["phone", "Phone", "tel" as const],
              ["date_of_birth", "Date of birth (YYYY-MM-DD)", "off" as const],
            ] as const
          ).map(([name, label]) => (
            <Controller
              key={name}
              control={control}
              name={name}
              render={({ field: { value, onChange, onBlur } }) => (
                <TextField
                  label={label}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors[name]?.message}
                  autoCapitalize={name === "full_name" ? "words" : "none"}
                  keyboardType={
                    name === "email"
                      ? "email-address"
                      : name === "phone"
                        ? "phone-pad"
                        : "default"
                  }
                  placeholder={name === "date_of_birth" ? "1998-04-21" : undefined}
                />
              )}
            />
          ))}
          <ChipGroup
            label="Gender"
            options={GENDER_OPTIONS}
            value={gender}
            onChange={setGender}
          />
          <ChipGroup
            label="Race shirt (unisex sizing)"
            options={SHIRT_OPTIONS}
            value={tshirtSize}
            onChange={setTshirtSize}
          />
        </View>

        <View style={{ gap: 18 }}>
          <Copy style={{ fontFamily: fonts.bold }}>03 · Safety contact</Copy>
          {(
            [
              ["emergency_contact_name", "Contact name"],
              ["emergency_contact_phone", "Contact phone"],
            ] as const
          ).map(([name, label]) => (
            <Controller
              key={name}
              control={control}
              name={name}
              render={({ field: { value, onChange, onBlur } }) => (
                <TextField
                  label={label}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors[name]?.message}
                  keyboardType={name === "emergency_contact_phone" ? "phone-pad" : "default"}
                />
              )}
            />
          ))}
        </View>

        {Boolean(submitError) && (
          <Copy accessibilityRole="alert" style={{ color: colors.error }}>
            {submitError}
          </Copy>
        )}

        <View
          style={{
            backgroundColor: colors.canvas,
            borderRadius: 16,
            padding: 18,
            gap: 6,
          }}
        >
          <Copy style={{ color: colors.muted, fontSize: 11, fontFamily: fonts.bold }}>
            Total due
          </Copy>
          <Copy style={{ fontSize: 24, fontFamily: fonts.bold }}>
            {selected ? money(selected.price_cents, selected.currency) : "Choose an entry"}
          </Copy>
        </View>

        <Button
          title={
            !(isSubmitting || register.isPending)
              ? "Claim my place"
              : retrying
                ? "Retrying"
                : "Claiming"
          }
          busy={isSubmitting || register.isPending}
          disabled={!category}
          onPress={() => {
            void submit();
          }}
        />
        <OfflineNotice />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
