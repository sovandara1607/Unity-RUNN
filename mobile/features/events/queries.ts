import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { useApi } from "../../services/api/provider";
import type {
  Availability,
  EventDetail,
  EventPage,
  SiteConfig,
} from "../../services/api/types";
export function useEvents(statuses: string) {
  const { request } = useApi();
  return useInfiniteQuery({
    queryKey: ["events", statuses],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      request<EventPage>(
        `/api/v1/events/?limit=20&offset=${pageParam}&statuses=${encodeURIComponent(statuses)}`,
        { signal },
      ),
    getNextPageParam: (page) => {
      const count = page.events?.length ?? 0;
      return page.offset + count < page.total && count > 0
        ? page.offset + count
        : undefined;
    },
  });
}
/** Same public GET /api/v1/site-config the web homepage carousel reads (see
 * frontend/src/components/ClubCarousel.tsx) -- admin-managed hero imagery and
 * copy, not mobile-only content. Rarely changes, so a long staleTime avoids
 * refetching it every time the Events screen remounts. */
export function useSiteConfig() {
  const { request } = useApi();
  return useQuery({
    queryKey: ["site-config"],
    staleTime: 5 * 60 * 1000,
    queryFn: ({ signal }) => request<SiteConfig>("/api/v1/site-config", { signal }),
  });
}
export function useEvent(slug: string) {
  const { request } = useApi();
  return useQuery({
    queryKey: ["event", slug],
    enabled: Boolean(slug),
    queryFn: ({ signal }) =>
      request<EventDetail>(`/api/v1/events/${encodeURIComponent(slug)}`, {
        signal,
      }),
  });
}
/** Live capacity per category, refreshed every 30s while the register screen is open. */
export function useCategoryAvailability(
  eventId: string | undefined,
  categoryIds: string[],
) {
  const { request } = useApi();
  const results = useQueries({
    queries: categoryIds.map((categoryId) => ({
      queryKey: ["availability", eventId, categoryId],
      enabled: Boolean(eventId),
      refetchInterval: 30000,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        request<Availability>(
          `/api/v1/events/${eventId}/categories/${categoryId}/availability`,
          { signal },
        ),
    })),
  });
  const availability: Record<string, Availability> = {};
  categoryIds.forEach((categoryId, index) => {
    const data = results[index]?.data;
    if (data) availability[categoryId] = data;
  });
  return availability;
}
