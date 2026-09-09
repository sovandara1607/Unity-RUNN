import { router } from "expo-router";
import { Feedback } from "../components/ui";
export default function NotFound() {
  return (
    <Feedback
      title="Let’s get you back on track"
      message="This page is not available."
      action="Explore events"
      onAction={() => router.replace("/(tabs)")}
    />
  );
}
