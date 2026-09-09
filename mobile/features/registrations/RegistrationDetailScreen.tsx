import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import {
  Button,
  Copy,
  Eyebrow,
  Feedback,
  Heading,
  LoadingCards,
} from "../../components/ui";
import { colors, fonts } from "../../constants/theme";
import { useApi } from "../../services/api/provider";
import { eventDate, eventTime, money } from "../events/format";
import { BakongPayment } from "../payment/BakongPayment";
import {
  fetchRegistrationPayment,
  useCancelRegistration,
  useRegistration,
} from "./queries";
import type { PaymentCheckout } from "../../services/api/types";

const STATUS_COPY: Record<string, string> = {
  PENDING: "Payment outstanding",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export default function RegistrationDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { session } = useApi();
  const query = useRegistration(id);
  const cancel = useCancelRegistration();
  const [payment, setPayment] = useState<PaymentCheckout | null>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [actionError, setActionError] = useState("");

  const entry = query.data;

  if (query.isLoading) return <LoadingCards />;
  if (query.isError || !entry) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.white, paddingTop: 60 }}>
        <Stack.Screen options={{ title: "Entry" }} />
        <Feedback
          title="Could not load this entry"
          message={query.isError ? query.error.message : "This entry could not be found."}
        />
      </View>
    );
  }

  const reopenPayment = async () => {
    setActionError("");
    setLoadingPayment(true);
    try {
      const checkout = await fetchRegistrationPayment(session, entry.id);
      setPayment(checkout);
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : "Could not reopen this payment.",
      );
    } finally {
      setLoadingPayment(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.white }}
      contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 60 }}
    >
      <Stack.Screen options={{ title: "Your entry" }} />
      {payment && (
        <BakongPayment
          checkout={payment}
          eventName={entry.event_name || entry.event?.name || "Your race"}
          onPaid={() => {
            setPayment(null);
            void query.refetch();
          }}
          onClose={() => setPayment(null)}
        />
      )}
      <Eyebrow>{STATUS_COPY[entry.status] || entry.status}</Eyebrow>
      <Heading large>{entry.event_name || entry.event?.name || "Race entry"}</Heading>
      <Copy style={{ color: colors.muted }}>
        {entry.category_name || entry.category?.name || "Entry"}
        {entry.event?.event_date ? ` · ${eventDate(entry.event.event_date)}` : ""}
        {entry.event?.start_time ? ` · ${eventTime(entry.event.start_time)}` : ""}
      </Copy>

      {entry.status === "CONFIRMED" && (
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.lime,
            borderRadius: 24,
            padding: 24,
            gap: 12,
          }}
        >
          <View style={{ backgroundColor: colors.white, padding: 16, borderRadius: 18 }}>
            <QRCode value={entry.registration_number || entry.id} size={220} color={colors.ink} />
          </View>
          <Copy style={{ fontFamily: fonts.bold }}>
            {entry.registration_number || entry.id.slice(0, 8)}
          </Copy>
          <Copy style={{ fontSize: 12, textAlign: "center" }}>
            Show this at race-day check-in.
          </Copy>
        </View>
      )}

      {entry.status === "PENDING" && (
        <View style={{ gap: 12 }}>
          <Copy style={{ color: colors.muted }}>
            This entry is not confirmed yet. Complete the payment to secure your place.
          </Copy>
          <Button
            title="Finish payment"
            busy={loadingPayment}
            onPress={() => {
              void reopenPayment();
            }}
          />
        </View>
      )}

      <View
        style={{
          borderTopWidth: 1,
          borderColor: colors.line,
          paddingTop: 18,
          gap: 8,
        }}
      >
        <Row label="Runner" value={entry.full_name} />
        <Row label="Email" value={entry.email} />
        <Row label="Phone" value={entry.phone} />
        <Row label="Shirt size" value={entry.tshirt_size} />
        <Row label="Emergency contact" value={entry.emergency_contact_name} />
        <Row label="Emergency phone" value={entry.emergency_contact_phone} />
        {entry.category && (
          <Row
            label="Entry fee"
            value={money(entry.category.price_cents, entry.category.currency)}
          />
        )}
      </View>

      {Boolean(actionError) && (
        <Copy accessibilityRole="alert" style={{ color: colors.error }}>
          {actionError}
        </Copy>
      )}

      {(entry.status === "PENDING" || entry.status === "CONFIRMED") && (
        <Button
          secondary
          title={cancel.isPending ? "Cancelling" : "Cancel this entry"}
          busy={cancel.isPending}
          onPress={() => {
            setActionError("");
            cancel.mutate(entry.id, {
              onSuccess: () => router.back(),
              onError: (caught) =>
                setActionError(
                  caught instanceof Error ? caught.message : "Could not cancel this entry.",
                ),
            });
          }}
        />
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Copy style={{ color: colors.muted, fontSize: 13 }}>{label}</Copy>
      <Copy style={{ fontSize: 13, fontFamily: fonts.bold, flexShrink: 1, textAlign: "right" }}>
        {value}
      </Copy>
    </View>
  );
}
