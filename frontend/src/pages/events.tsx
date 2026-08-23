import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function loadEvents() {
      try {
        // TODO: call API /events
        setEvents([
          { id: "1", slug: "unity-founders-run-2025", title: "Unity Founders Run 2025", description: "A charity run for Unity founders", status: "REGISTRATION_OPEN", capacity: 100, price_cents: 5000, starts_at: "2025-12-01", ends_at: "2025-12-31" },
        ]);
      } catch (e: any) {
        setError(e.message || "Failed to load events");
      } finally {
        setLoading(false);
      }
    }
    loadEvents();
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading events...</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Events</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <div key={event.id} className="border rounded-lg p-6 hover:shadow-md transition-shadow">
              <h2 className="text-xl font-semibold mb-2">{event.title}</h2>
              <p className="text-sm text-zinc-600 mb-4 line-clamp-2">
                {event.description}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <span className="text-sm text-zinc-500">
                  {event.starts_at} - {event.ends_at}
                </span>
                {event.status === "REGISTRATION_OPEN" && (
                  <a
                    href={`/register/${event.slug}`}
                    className="ml-auto rounded bg-primary px-4 py-2 text-white text-sm"
                  >
                    Register
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}