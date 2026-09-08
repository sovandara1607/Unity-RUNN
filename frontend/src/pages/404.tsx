import { ErrorScreen } from "../components/site/ErrorScreen";

export default function NotFoundPage() {
  return (
    <ErrorScreen
      code="404"
      title="Wrong turn"
      message="This page is not on the course. The race you are looking for may have been renamed or archived. The calendar has everything that is still running."
    />
  );
}
