import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Copy,
  Eyebrow,
  FormNotice,
  Heading,
  TextField,
  formLayout,
} from "../../components/ui";
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
  const headerHeight = useHeaderHeight();
  const inputs = useRef<Partial<Record<keyof Values, TextInput | null>>>({});
  const [error, setError] = useState("");
  const isRegister = mode === "register";
  const {
    control,
    handleSubmit,
    setError: setFieldError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { email: "", password: "", full_name: "" },
  });

  const submit = handleSubmit(async (values) => {
    setError("");
    if (isRegister && !values.full_name?.trim()) {
      setFieldError("full_name", { message: "Enter your full name." });
      setFocus("full_name");
      return;
    }
    if (isRegister && values.password.length < 8) {
      setFieldError("password", { message: "Use at least 8 characters." });
      setFocus("password");
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
      style={{ flex: 1, backgroundColor: colors.ink }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={headerHeight}
    >
      <Stack.Screen
        options={{ title: isRegister ? "Create account" : "Sign in" }}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={formLayout.content}
      >
        <View style={formLayout.intro}>
          <Eyebrow>Unity Runn Club</Eyebrow>
          <Heading style={formLayout.title}>
            {isRegister
              ? "YOUR NEXT RUN\nSTARTS HERE."
              : "BACK FOR\nANOTHER RUN."}
          </Heading>
          <Copy style={{ color: colors.muted }}>
            {isRegister
              ? "One account for your race entries and tickets."
              : "Sign in to your entries, tickets, and runner profile."}
          </Copy>
        </View>

        <View style={{ gap: 14 }}>
          {(isRegister
            ? (["full_name", "email", "password"] as const)
            : (["email", "password"] as const)
          ).map((name) => (
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
                  label={
                    name === "full_name"
                      ? "Full name"
                      : name === "email"
                        ? "Email address"
                        : "Password"
                  }
                  placeholder={
                    name === "full_name"
                      ? "Your full name"
                      : name === "email"
                        ? "you@example.com"
                        : isRegister
                          ? "Create a password"
                          : "Enter your password"
                  }
                  hint={
                    name === "password" && isRegister
                      ? "Use at least 8 characters."
                      : undefined
                  }
                  error={errors[name]?.message}
                  editable={!isSubmitting}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize={name === "full_name" ? "words" : "none"}
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
                  submitBehavior={
                    name === "password" ? "blurAndSubmit" : "submit"
                  }
                  onSubmitEditing={() => {
                    if (name === "password") {
                      if (!isSubmitting) void submit();
                    } else
                      inputs.current[
                        name === "full_name" ? "email" : "password"
                      ]?.focus();
                  }}
                />
              )}
            />
          ))}
        </View>

        <View style={{ gap: 14 }}>
          {Boolean(error) && <FormNotice>{error}</FormNotice>}
          <Button
            title={isRegister ? "Create account" : "Sign in"}
            busy={isSubmitting}
            onPress={() => {
              void submit();
            }}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              paddingVertical: 4,
            }}
          >
            <View
              style={{ flex: 1, height: 1, backgroundColor: colors.line }}
            />
            <Copy style={{ color: colors.muted, fontSize: 12 }}>
              or continue with
            </Copy>
            <View
              style={{ flex: 1, height: 1, backgroundColor: colors.line }}
            />
          </View>
          <GoogleSignInButton disabled={isSubmitting} />
        </View>

        <View style={{ alignItems: "center", gap: 2 }}>
          <Copy style={{ color: colors.muted, fontSize: 14 }}>
            {isRegister
              ? "Already part of the club?"
              : "New to Unity Runn Club?"}
          </Copy>
          <Pressable
            accessibilityRole="link"
            disabled={isSubmitting}
            onPress={() =>
              router.replace(isRegister ? "/(auth)/login" : "/(auth)/register")
            }
            style={({ pressed }) => ({
              minHeight: 44,
              paddingHorizontal: 16,
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Copy style={{ fontFamily: fonts.bold, color: colors.lime }}>
              {isRegister ? "Sign in" : "Create an account"}
            </Copy>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
