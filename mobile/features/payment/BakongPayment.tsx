import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { Button, Copy, Eyebrow, Heading } from "../../components/ui";
import { colors, fonts } from "../../constants/theme";
import { useApi } from "../../services/api/provider";
import type { PaymentCheckout } from "../../services/api/types";
import { ApiError } from "../../services/api/client";

type Phase = "waiting" | "processing" | "confirmed" | "failed";

function paymentFailureMessage(code?: string): string | null {
  switch (code) {
    case "payment_expired":
      return "This payment window expired. Your place was released and the QR code can no longer be used.";
    case "payment_mismatch":
      return "The reported payment does not match this entry. Contact support before paying again.";
    case "payment_unavailable":
      return "This payment could not be completed. Do not pay the same QR code again.";
    case "payment_failed":
      return "The organizer could not match this payment. Check the bank reference or contact the race team before paying again.";
    default:
      return null;
  }
}

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function BankQRPayment({
  checkout,
  eventName,
  onPaid,
  onClose,
}: {
  checkout: PaymentCheckout;
  eventName: string;
  onPaid(): void;
  onClose(): void;
}) {
  const { session } = useApi();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const qrSize = Math.min(240, Math.max(176, width - 120));
  const [checking, setChecking] = useState(false);
  const initialPhase: Phase = checkout.status === "PROCESSING"
    ? "processing"
    : checkout.status === "FAILED"
      ? "failed"
      : checkout.status === "SUCCEEDED"
        ? "confirmed"
        : "waiting";
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [failureMessage, setFailureMessage] = useState(
    checkout.status === "FAILED" ? "This payment was not approved. Contact the race team before paying again." : "",
  );
  const [reference, setReference] = useState(checkout.reference || "");
  const [submitError, setSubmitError] = useState("");
  const [failedChecks, setFailedChecks] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [linkError, setLinkError] = useState("");

  const amount = useMemo(
    () =>
      checkout.currency === "USD"
        ? `$${(checkout.amount_cents / 100).toFixed(2)}`
        : `${checkout.amount_cents.toLocaleString()} KHR`,
    [checkout],
  );

  const checkingRef = useRef(false);
  const phaseRef = useRef<Phase>(initialPhase);

  const expiresAt = useMemo(() => {
    if (!checkout.expires_at) return null;
    const parsed = new Date(checkout.expires_at).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }, [checkout.expires_at]);

  const secondsLeft =
    expiresAt === null
      ? null
      : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const urgent = secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 120;
  const lapsed = secondsLeft === 0 && phase === "waiting";

  useEffect(() => {
    if (expiresAt === null || phase !== "waiting") return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [expiresAt, phase]);

  const verify = useCallback(async (requestedByRunner = false) => {
    if (checkingRef.current || phaseRef.current === "confirmed" || phaseRef.current === "failed") return;
    if (requestedByRunner && phaseRef.current === "waiting") {
      phaseRef.current = "processing";
      setPhase("processing");
    }
    checkingRef.current = true;
    setChecking(true);
    try {
      const result = await session.request<{
        registration: { status: string };
        payment: { status: string };
      }>(`/api/v1/registrations/${checkout.registration_id}/payment/verify`, {
        method: "POST",
      });
      if (
        result.registration.status === "CONFIRMED" ||
        result.payment.status === "SUCCEEDED"
      ) {
        phaseRef.current = "confirmed";
        setPhase("confirmed");
        return;
      }
      setFailedChecks(0);
    } catch (caught) {
      const terminalMessage = paymentFailureMessage(
        caught instanceof ApiError ? caught.code : undefined,
      );
      if (terminalMessage) {
        phaseRef.current = "failed";
        setFailureMessage(terminalMessage);
        setPhase("failed");
        return;
      }
      setFailedChecks((count) => count + 1);
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [checkout.registration_id, session]);

  const submitPayment = useCallback(async () => {
    const trimmed = reference.trim();
    if (trimmed.length < 4) {
      setSubmitError("Enter the transaction reference shown by your banking app.");
      return;
    }
    setSubmitError("");
    setChecking(true);
    try {
      await session.request<PaymentCheckout>(
        `/api/v1/registrations/${checkout.registration_id}/payment/submit`,
        { method: "POST", body: { reference: trimmed } },
      );
      phaseRef.current = "processing";
      setPhase("processing");
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "Could not submit this payment for review.");
    } finally {
      setChecking(false);
    }
  }, [checkout.registration_id, reference, session]);

  useEffect(() => {
    if (phase !== "waiting" && phase !== "processing") return;
    const first = setTimeout(() => void verify(false), 2500);
    const interval = setInterval(() => void verify(false), 4000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [verify, phase]);

  const status =
    phase === "confirmed"
      ? "Payment confirmed"
      : phase === "failed"
        ? "Payment failed"
        : lapsed
          ? "Time is up. Making a final payment check"
          : failedChecks > 0
            ? "The payment is still waiting for review. Do not pay twice"
            : phase === "processing"
              ? "Payment is processing"
              : checking
                ? "Checking payment status"
              : "Waiting for payment";

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.ink }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: Math.max(24, insets.top),
          paddingBottom: Math.max(24, insets.bottom),
          paddingHorizontal: 24,
          gap: 20,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Eyebrow>Bank QR · Payment checkout</Eyebrow>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close payment"
          >
            <Copy style={{ fontFamily: fonts.bold }}>Close</Copy>
          </Pressable>
        </View>

        <Heading>{eventName}</Heading>

        <View
          style={{
            alignItems: "center",
            padding: 20,
            backgroundColor: colors.lime,
            borderRadius: 24,
          }}
        >
          <View
            style={{
              backgroundColor: colors.white,
              padding: 16,
              borderRadius: 18,
              opacity: phase === "waiting" || phase === "processing" ? 1 : 0.3,
            }}
          >
            {checkout.qr_string ? (
              <QRCode
                value={checkout.qr_string}
                size={qrSize}
                color={colors.ink}
              />
            ) : (
              <View style={{ width: qrSize, height: qrSize }} />
            )}
          </View>
          <Copy style={{ marginTop: 14, fontFamily: fonts.bold, fontSize: 12, color: colors.ink }}>
            {phase === "waiting"
              ? "Scan with your banking app"
              : phase === "processing"
                ? "Payment submitted for checking"
              : phase === "confirmed"
                ? "Paid. No need to scan"
                : "This code is no longer valid"}
          </Copy>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: colors.line,
            paddingVertical: 14,
          }}
        >
          <Copy
            style={{
              color: colors.muted,
              fontFamily: fonts.bold,
              fontSize: 12,
            }}
          >
            Total due
          </Copy>
          <Copy style={{ fontFamily: fonts.bold, fontSize: 20 }}>{amount}</Copy>
        </View>

        {secondsLeft !== null && phase === "waiting" && (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: urgent || lapsed ? colors.error : colors.canvas,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <Copy
              style={{
                fontFamily: fonts.bold,
                fontSize: 11,
                color: colors.white,
              }}
            >
              {lapsed ? "Hold this code" : "Time to pay"}
            </Copy>
            <Copy
              style={{
                fontFamily: fonts.bold,
                fontSize: 20,
                color: colors.white,
              }}
            >
              {formatCountdown(secondsLeft)}
            </Copy>
          </View>
        )}

        {checkout.deep_link && phase === "waiting" && (
          <Button
            title="Open banking app"
            onPress={() => {
              setLinkError("");
              void Linking.openURL(checkout.deep_link!).catch(() =>
                setLinkError("Could not open your banking app."),
              );
            }}
          />
        )}
        {Boolean(linkError) && (
          <Copy accessibilityRole="alert" style={{ color: colors.error }}>
            {linkError}
          </Copy>
        )}

        {phase === "waiting" && (
          <View style={{ gap: 8 }}>
            <Copy style={{ color: colors.muted, fontSize: 12 }}>
              After paying, enter the transaction reference from your banking app.
            </Copy>
            <TextInput
              value={reference}
              onChangeText={(value) => { setReference(value); setSubmitError(""); }}
              placeholder="Bank transaction reference"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              accessibilityLabel="Bank transaction reference"
              style={{
                minHeight: 48,
                borderWidth: 1,
                borderColor: submitError ? colors.error : colors.line,
                borderRadius: 12,
                paddingHorizontal: 14,
                color: colors.white,
                fontFamily: fonts.bold,
              }}
            />
            {Boolean(submitError) && (
              <Copy accessibilityRole="alert" style={{ color: colors.error, fontSize: 12 }}>
                {submitError}
              </Copy>
            )}
            <Button title="Submit payment for review" busy={checking} onPress={() => void submitPayment()} />
          </View>
        )}
        {phase === "confirmed" && (
          <Button title="View my ticket" onPress={onPaid} />
        )}
        {phase === "failed" && (
          <Button secondary title="Close payment" onPress={onClose} />
        )}

        <View
          accessibilityLiveRegion="polite"
          accessibilityRole={phase === "failed" ? "alert" : undefined}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: colors.canvas,
            borderRadius: 14,
            padding: 14,
          }}
        >
          {checking && <ActivityIndicator size="small" color={colors.white} />}
          <Copy style={{ flex: 1 }}>{status}</Copy>
          {phase === "processing" && (
            <Pressable onPress={() => void verify(true)} disabled={checking}>
              <Copy
                style={{
                  fontFamily: fonts.bold,
                  textDecorationLine: "underline",
                  opacity: checking ? 0.4 : 1,
                }}
              >
                Check again
              </Copy>
            </Pressable>
          )}
        </View>
        {failedChecks > 2 && (
          <Copy style={{ color: colors.muted, fontSize: 12 }}>
            Review is taking longer than expected. Do not pay twice. You can
            reopen this payment from your race wallet.
          </Copy>
        )}
        {phase === "processing" && (
          <Copy style={{ fontSize: 13 }}>
            Your reference was submitted. The organizer is checking it against
            the bank record; you can safely close and return later.
          </Copy>
        )}
        {phase === "confirmed" && (
          <Copy style={{ fontSize: 13 }}>
            Your payment is confirmed and your race ticket is ready.
          </Copy>
        )}
        {phase === "failed" && (
          <Copy accessibilityRole="alert" style={{ color: colors.error, fontSize: 13 }}>
            {failureMessage}
          </Copy>
        )}
        <Copy style={{ color: colors.muted, fontSize: 11 }}>
          Your race ticket is issued only after the organizer approves the payment.
        </Copy>
      </ScrollView>
    </Modal>
  );
}
