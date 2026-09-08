import { ErrorScreen } from "../components/site/ErrorScreen";

export default function ServerErrorPage() {
  return (
    <ErrorScreen
      code="500"
      title="Something broke"
      message="That is on us, not on you. Nothing you submitted was lost. Try again in a moment, or head back to the calendar."
    />
  );
}
