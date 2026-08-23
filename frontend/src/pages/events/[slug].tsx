import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function EventRegisterPage() {
  const router = useRouter();
  const { slug } = useParams() || {};
  const [event, setEvent] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadEvent() {
      try {
        // TODO: call API /events/${slug}
        setEvent({
          id: "be8e773b-efe9-4b92-a507-3b80c30aff09",
          slug: slug || "unity-founders-run-2025",
          title: "Unity Founders Run 2025",
          description: "A charity run for Unity founders",
          status: "REGISTRATION_OPEN",
          capacity: 100,
          price_cents: 5000,
          starts_at: "2025-12-01",
          ends_at: "2025-12-31",
        });
      } catch (e: any) {
        setError(e.message || "Failed to load event");
      }
    }
    loadEvent();
  }, [slug]);

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-600">Event not found</p>
      </div>
    );
  }

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      // TODO: call API registerForEvent
      router.push("/");
    } catch (e: any) {
      setError(e.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">
          {event.title}
        </h1>
        {error && <p className="text-red-600 mb-4">{error}</p>}
        {loading ? (
          <p className="text-zinc-500">Loading...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                className="w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                className="w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-primary px-4 py-2 text-white font-medium text-sm disabled:opacity-50 transition-opacity"
            >
              {loading ? "Registering..." : "Register"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}