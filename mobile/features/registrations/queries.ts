import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../services/api/provider";
import type {
  PaymentCheckout,
  PaymentVerificationResult,
  RegisterForEventRequest,
  RegisterForEventResponse,
  Registration,
} from "../../services/api/types";

export function useMyRegistrations() {
  const { session } = useApi();
  return useQuery({
    queryKey: ["registrations", "mine"],
    queryFn: ({ signal }) =>
      session.request<Registration[] | { registrations: Registration[] }>(
        "/api/v1/me/registrations",
        { signal },
      ).then((result) => (Array.isArray(result) ? result : result?.registrations || [])),
  });
}

export function useRegistration(id: string | undefined) {
  const { session } = useApi();
  return useQuery({
    queryKey: ["registration", id],
    enabled: Boolean(id),
    queryFn: ({ signal }) =>
      session.request<Registration>(`/api/v1/registrations/${id}`, { signal }),
  });
}

export function useRegisterForEvent(eventId: string | undefined) {
  const { session } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RegisterForEventRequest) =>
      session.request<RegisterForEventResponse>(
        `/api/v1/events/${eventId}/registrations`,
        { method: "POST", body: data },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["registrations", "mine"] });
    },
  });
}

export function useVerifyPayment(registrationId: string) {
  const { session } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      session.request<PaymentVerificationResult>(
        `/api/v1/registrations/${registrationId}/payment/verify`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["registrations", "mine"] });
      void queryClient.invalidateQueries({ queryKey: ["registration", registrationId] });
    },
  });
}

export function useCancelRegistration() {
  const { session } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registrationId: string) =>
      session.request<void>(`/api/v1/registrations/${registrationId}/cancel`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["registrations", "mine"] });
    },
  });
}

/** Reopen the payment sheet for a PENDING entry (e.g. after leaving and coming back). */
export async function fetchRegistrationPayment(
  session: ReturnType<typeof useApi>["session"],
  registrationId: string,
): Promise<PaymentCheckout> {
  return session.request<PaymentCheckout>(
    `/api/v1/registrations/${registrationId}/payment`,
  );
}
