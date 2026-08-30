import { useCallback, useEffect, useMemo, useState } from "react";
import type { Availability } from "../types";
import { api } from "./api";

export function useCategoryAvailability(eventId: string | undefined, categoryIds: string[]) {
  const categoryKey = categoryIds.join(",");
  const stableCategoryIds = useMemo(() => categoryKey ? categoryKey.split(",") : [], [categoryKey]);
  const [availability, setAvailability] = useState<Record<string, Availability>>({});

  const refresh = useCallback(async () => {
    if (!eventId || stableCategoryIds.length === 0) return;
    const results = await Promise.allSettled(
      stableCategoryIds.map(async (categoryId) => [categoryId, await api.getCategoryAvailability(eventId, categoryId)] as const)
    );
    const next: Record<string, Availability> = {};
    for (const result of results) {
      if (result.status === "fulfilled") next[result.value[0]] = result.value[1];
    }
    if (Object.keys(next).length > 0) setAvailability((current) => ({ ...current, ...next }));
  }, [eventId, stableCategoryIds]);

  useEffect(() => {
    let active = true;
    const load = () => { if (active) void refresh(); };
    load();
    const interval = window.setInterval(load, 30_000);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", load);
    };
  }, [refresh]);

  return { availability, refresh };
}
