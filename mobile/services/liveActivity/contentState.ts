import type { RaceActivityProps } from "../../widgets/RaceLiveActivity";
import type { NativeStartInput, NativeUpdateInput } from "./nativeBridge.types";
import { z } from "zod";

const savedContentSchema = z.object({
  eventName: z.string(),
  location: z.string(),
  raceDistance: z.string().optional(),
  startTime: z.string(),
  status: z.enum(["upcoming", "check_in", "starting", "live", "finished", "cancelled"]),
  bibNumber: z.string().optional(),
  gate: z.string().optional(),
  elapsedSeconds: z.number().optional(),
  elapsedStartedAt: z.number().optional(),
  distanceKm: z.number().optional(),
  pace: z.string().optional(),
  finishTime: z.string().optional(),
});

export function parseSavedContent(value: string | null): RaceActivityProps | undefined {
  if (!value) return undefined;
  try {
    const result = savedContentSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function initialContent(input: NativeStartInput, now = Date.now()): RaceActivityProps {
  const { eventId: _, ...props } = input;
  return {
    ...props,
    ...(input.elapsedSeconds !== undefined
      ? { elapsedStartedAt: now - input.elapsedSeconds * 1000 }
      : {}),
  };
}

export function updatedContent(
  previous: RaceActivityProps,
  input: NativeUpdateInput,
  now = Date.now(),
): RaceActivityProps {
  return {
    ...previous,
    ...(input.raceStatus !== undefined ? { status: input.raceStatus } : {}),
    ...(input.distanceKm !== undefined ? { distanceKm: input.distanceKm } : {}),
    ...(input.elapsedSeconds !== undefined
      ? { elapsedSeconds: input.elapsedSeconds, elapsedStartedAt: now - input.elapsedSeconds * 1000 }
      : {}),
    ...(input.pace !== undefined ? { pace: input.pace } : {}),
    ...(input.finishTime !== undefined ? { finishTime: input.finishTime } : {}),
  };
}
