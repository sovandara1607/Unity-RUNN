import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { useApi } from "../../services/api/provider";
import type {
  Availability,
  EventDetail,
  EventPage,
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
    getNextPageParam: (page) =>
      page.offset + page.events.length < page.total && page.events.length > 0
        ? page.offset + page.events.length
        : undefined,
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
