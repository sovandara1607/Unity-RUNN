function origin(value: string | undefined, label: string): string {
  if (!value)
    throw new Error(`Set ${label} in mobile/.env.local. See mobile/README.md.`);
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      `${label} must be an HTTP(S) origin without a path or credentials.`,
    );
  if (!__DEV__ && url.protocol !== "https:")
    throw new Error(`${label} must use HTTPS in release builds.`);
  return url.origin;
}
export function readConfig() {
  return {
    apiOrigin: origin(process.env.EXPO_PUBLIC_API_URL, "EXPO_PUBLIC_API_URL"),
    webOrigin: origin(process.env.EXPO_PUBLIC_WEB_URL, "EXPO_PUBLIC_WEB_URL"),
  };
}
