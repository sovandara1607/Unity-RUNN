import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Copy, Eyebrow, Heading } from "../../components/ui";
import { colors, fonts } from "../../constants/theme";
import { useApi } from "../../services/api/provider";
import { GoogleSignInButton } from "./GoogleSignInButton";
const schema = z.object({
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
  password: z.string().min(1, "Enter your password."),
  full_name: z.string().optional(),
});
type Values = z.infer<typeof schema>;
export default function AuthScreen({ mode }: { mode: "login" | "register" }) {
  const { session } = useApi();
  const [error, setError] = useState("");
  const isRegister = mode === "register";
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError: setFieldError,
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", full_name: "" },
  });
  const submit = handleSubmit(async (values) => {
    setError("");
    if (isRegister && !values.full_name?.trim()) {
      setFieldError("full_name", { message: "Enter your full name." });
      return;
    }
    if (isRegister && values.password.length < 8) {
      setFieldError("password", { message: "Use at least 8 characters." });
      return;
    }
    try {
      await session.authenticate(mode, {
        ...values,
        email: values.email.trim(),
        full_name: isRegister ? values.full_name?.trim() : undefined,
      });
      router.replace("/(tabs)/account");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not sign in. Please try again.",
      );
    }
  });
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.white }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen
        options={{ title: isRegister ? "Join the crew" : "Sign in" }}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 26, gap: 20, paddingBottom: 50 }}
      >
        <Eyebrow>Unity Runn Club · Phnom Penh</Eyebrow>
        <Heading large>
          {isRegister
            ? "YOUR CREW.\nYOUR NEXT RUN."
            : "GOOD TO\nHAVE YOU BACK."}
        </Heading>
        <Copy style={{ color: colors.muted }}>
          {isRegister
            ? "Create your runner account and join the community."
            : "Sign in with your Unity Runn Club account."}
        </Copy>
        {(isRegister
          ? (["full_name", "email", "password"] as const)
          : (["email", "password"] as const)
        ).map((name) => (
          <View key={name} style={{ gap: 8 }}>
            <Copy style={{ fontFamily: fonts.bold }}>
              {name === "full_name"
                ? "Full name"
                : name === "email"
                  ? "Email address"
                  : "Password"}
            </Copy>
            <Controller
              control={control}
              name={name}
              render={({ field: { value, onChange, onBlur } }) => (
                <TextInput
                  accessibilityLabel={
                    name === "full_name"
                      ? "Full name"
                      : name === "email"
                        ? "Email address"
                        : "Password"
                  }
                  editable={!isSubmitting}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize={name === "full_name" ? "words" : "none"}
                  autoCorrect={false}
                  secureTextEntry={name === "password"}
                  keyboardType={name === "email" ? "email-address" : "default"}
                  autoComplete={
                    name === "password"
                      ? isRegister
                        ? "new-password"
                        : "current-password"
                      : name === "email"
                        ? "email"
                        : "name"
                  }
                  returnKeyType={name === "password" ? "go" : "next"}
                  onSubmitEditing={
                    name === "password"
                      ? () => {
                          void submit();
                        }
                      : undefined
                  }
                  style={{
                    minHeight: 56,
                    borderWidth: 1,
                    borderColor: errors[name] ? colors.error : colors.line,
                    borderRadius: 14,
                    padding: 16,
                    backgroundColor: colors.canvas,
                    fontFamily: fonts.body,
                    fontSize: 16,
                    color: colors.ink,
                  }}
                />
              )}
            />
            {errors[name] && (
              <Copy
                accessibilityRole="alert"
                style={{ color: colors.error, fontSize: 13 }}
              >
                {errors[name]?.message}
              </Copy>
            )}
          </View>
        ))}
        {Boolean(error) && (
          <Copy accessibilityRole="alert" style={{ color: colors.error }}>
            {error}
          </Copy>
        )}
        <Button
          title={isRegister ? "Create account" : "Sign in"}
          busy={isSubmitting}
          onPress={() => {
            void submit();
          }}
        />
        <GoogleSignInButton />
        <Button
          secondary
          disabled={isSubmitting}
          title={
            isRegister
              ? "Already a member? Sign in"
              : "New to the club? Create account"
          }
          onPress={() =>
            router.replace(isRegister ? "/(auth)/login" : "/(auth)/register")
          }
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
