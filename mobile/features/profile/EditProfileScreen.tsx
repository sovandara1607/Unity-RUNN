import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { router, Stack } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  ChipGroup,
  Copy,
  Feedback,
  Heading,
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
      session.request<Me["profile"]>("/api/v1/me/", { method: "PATCH", body: data }),
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.white }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen options={{ title: "Edit profile" }} />
      <ScrollView contentContainerStyle={{ padding: 26, gap: 20, paddingBottom: 60 }}>
        <Heading large>YOUR{"\n"}RUNNER PROFILE.</Heading>
        <Copy style={{ color: colors.muted }}>
          Kept up to date, this fills in future race entries automatically.
        </Copy>

        <TextField
          label="Full name"
          value={values.full_name}
          onChangeText={(v) => setValues((c) => ({ ...c, full_name: v }))}
          autoCapitalize="words"
        />
        <TextField
          label="Phone"
          value={values.phone}
          onChangeText={(v) => setValues((c) => ({ ...c, phone: v }))}
          keyboardType="phone-pad"
        />
        <TextField
          label="Date of birth"
          hint="YYYY-MM-DD"
          value={values.date_of_birth}
          onChangeText={(v) => setValues((c) => ({ ...c, date_of_birth: v }))}
          placeholder="1998-04-21"
        />
        <ChipGroup label="Gender" options={GENDER_OPTIONS} value={gender} onChange={setGender} />
        <ChipGroup
          label="Usual race shirt size"
          options={SHIRT_OPTIONS}
          value={tshirtSize}
          onChange={setTshirtSize}
        />
        <TextField
          label="Emergency contact name"
          value={values.emergency_contact_name}
          onChangeText={(v) => setValues((c) => ({ ...c, emergency_contact_name: v }))}
        />
        <TextField
          label="Emergency contact phone"
          value={values.emergency_contact_phone}
          onChangeText={(v) => setValues((c) => ({ ...c, emergency_contact_phone: v }))}
          keyboardType="phone-pad"
        />

        {save.isError && (
          <Copy accessibilityRole="alert" style={{ color: colors.error }}>
            {save.error instanceof Error ? save.error.message : "Could not save your profile."}
          </Copy>
        )}
        {saved && !save.isPending && (
          <Copy style={{ color: colors.muted }}>Saved.</Copy>
        )}
        <Button
          title={save.isPending ? "Saving" : "Save profile"}
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
