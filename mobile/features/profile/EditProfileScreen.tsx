import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router, Stack } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  ChipGroup,
  Copy,
  Feedback,
  Heading,
  Eyebrow,
  DateField,
  FormSection,
  FormNotice,
  formLayout,
  LoadingCards,
  TextField,
} from "../../components/ui";
import { colors } from "../../constants/theme";
import { useApi, useSession } from "../../services/api/provider";
import type { Me, UpdateProfileRequest } from "../../services/api/types";

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];
const SHIRT_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL"].map((size) => ({
  value: size,
  label: size,
}));

export default function EditProfileScreen() {
  const { session } = useApi();
  const headerHeight = useHeaderHeight();
  const state = useSession();
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ["me", state.user?.id],
    enabled: state.status === "authenticated",
    queryFn: ({ signal }) => session.request<Me>("/api/v1/me/", { signal }),
  });

  const [values, setValues] = useState({
    full_name: "",
    phone: "",
    date_of_birth: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
  });
  const [gender, setGender] = useState("OTHER");
  const [tshirtSize, setTshirtSize] = useState("M");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const p = profile.data?.profile;
    if (!p) return;
    setValues({
      full_name: p.full_name || "",
      phone: p.phone || "",
      date_of_birth: p.date_of_birth?.slice(0, 10) || "",
      emergency_contact_name: p.emergency_contact_name || "",
      emergency_contact_phone: p.emergency_contact_phone || "",
    });
    setGender(p.gender || "OTHER");
    setTshirtSize(p.tshirt_size || "M");
  }, [profile.data]);

  const save = useMutation({
    mutationFn: (data: UpdateProfileRequest) =>
      session.request<Me["profile"]>("/api/v1/me/", {
        method: "PATCH",
        body: data,
      }),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  if (state.status === "loading" || profile.isLoading) return <LoadingCards />;
  if (state.status !== "authenticated") {
    return (
      <Feedback
        title="Sign in required"
        message="Sign in to edit your runner profile."
        action="Sign in"
        onAction={() => router.push("/(auth)/login")}
      />
    );
  }

  if (profile.isError)
    return (
      <Feedback
        title="Profile unavailable"
        message={profile.error.message}
        action="Try again"
        onAction={() => {
          void profile.refetch();
        }}
      />
    );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.ink }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={headerHeight}
    >
      <Stack.Screen options={{ title: "Edit profile" }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={formLayout.content}
      >
        <View style={formLayout.intro}>
          <Eyebrow>Your runner account</Eyebrow>
          <Heading style={formLayout.title}>
            READY FOR YOUR{"\n"}NEXT START LINE.
          </Heading>
          <Copy style={{ color: colors.muted }}>
            Save your details once. We’ll fill them in when you enter a race.
          </Copy>
        </View>
        <FormSection
          title="Personal details"
          description="Your name and contact details for race day."
        >
          <TextField
            label="Full name"
            value={values.full_name}
            placeholder="Your full name"
            onChangeText={(v) => setValues((c) => ({ ...c, full_name: v }))}
            autoCapitalize="words"
            autoComplete="name"
            editable={!save.isPending}
          />
          <TextField
            label="Phone number"
            value={values.phone}
            placeholder="+855"
            onChangeText={(v) => setValues((c) => ({ ...c, phone: v }))}
            keyboardType="phone-pad"
            autoComplete="tel"
            editable={!save.isPending}
          />
          <DateField
            value={values.date_of_birth}
            onChange={(v) => setValues((c) => ({ ...c, date_of_birth: v }))}
            disabled={save.isPending}
          />
          <ChipGroup
            label="Gender"
            options={GENDER_OPTIONS}
            value={gender}
            onChange={setGender}
            disabled={save.isPending}
          />
        </FormSection>
        <FormSection
          title="Race shirt"
          description="Your usual size. You can change it for each race."
        >
          <ChipGroup
            label="Unisex shirt size"
            options={SHIRT_OPTIONS}
            value={tshirtSize}
            onChange={setTshirtSize}
            disabled={save.isPending}
          />
        </FormSection>
        <FormSection
          title="Emergency contact"
          description="Someone we can reach if you need help on race day."
        >
          <TextField
            label="Contact’s full name"
            value={values.emergency_contact_name}
            placeholder="Their full name"
            onChangeText={(v) =>
              setValues((c) => ({ ...c, emergency_contact_name: v }))
            }
            autoCapitalize="words"
            editable={!save.isPending}
          />
          <TextField
            label="Contact’s phone number"
            value={values.emergency_contact_phone}
            placeholder="+855"
            onChangeText={(v) =>
              setValues((c) => ({ ...c, emergency_contact_phone: v }))
            }
            keyboardType="phone-pad"
            editable={!save.isPending}
          />
        </FormSection>
        {save.isError && (
          <FormNotice>
            {save.error instanceof Error
              ? save.error.message
              : "Could not save your profile."}
          </FormNotice>
        )}
        {saved && !save.isPending && (
          <FormNotice success>Your runner profile is saved.</FormNotice>
        )}
        <Button
          title="Save profile"
          busy={save.isPending}
          onPress={() => {
            setSaved(false);
            save.mutate({
              full_name: values.full_name.trim(),
              phone: values.phone.trim(),
              date_of_birth: values.date_of_birth.trim() || undefined,
              gender,
              tshirt_size: tshirtSize,
              emergency_contact_name: values.emergency_contact_name.trim(),
              emergency_contact_phone: values.emergency_contact_phone.trim(),
            });
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
