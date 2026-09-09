import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { TokenStorage } from "../auth/session";
// Scope sessions to the configured backend. Never share staging and production tokens.
export function tokenStorage(origin: string): TokenStorage {
  const key = `unity.refresh.${origin.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const options = {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };
  let previewToken: string | null = null;
  // Web is a development preview only; no localStorage or AsyncStorage secrets.
  if (Platform.OS === "web")
    return {
      get: async () => previewToken,
      set: async (value) => {
        previewToken = value;
      },
      remove: async () => {
        previewToken = null;
      },
    };
  return {
    get: () => SecureStore.getItemAsync(key, options),
    set: (token) => SecureStore.setItemAsync(key, token, options),
    remove: () => SecureStore.deleteItemAsync(key, options),
  };
}
