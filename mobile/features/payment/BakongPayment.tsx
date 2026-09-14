import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { Button, Copy, Eyebrow, Heading } from "../../components/ui";
import { colors, fonts } from "../../constants/theme";
import { useApi } from "../../services/api/provider";
import type { PaymentCheckout } from "../../services/api/types";
import { ApiError } from "../../services/api/client";

type Phase = "waiting" | "confirmed" | "expired";

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function BakongPayment({
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
  const [checking, setChecking] = useState(false);
  const [phase, setPhase] = useState<Phase>("waiting");
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
  const phaseRef = useRef<Phase>("waiting");
  const onPaidRef = useRef(onPaid);
  useEffect(() => {
    onPaidRef.current = onPaid;
  }, [onPaid]);

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

  const verify = useCallback(async () => {
    if (checkingRef.current || phaseRef.current !== "waiting") return;
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
        onPaidRef.current();
        return;
      }
      setFailedChecks(0);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "payment_expired") {
        phaseRef.current = "expired";
        setPhase("expired");
        return;
      }
      setFailedChecks((count) => count + 1);
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [checkout.registration_id, session]);

  useEffect(() => {
    if (phase !== "waiting") return;
    const first = setTimeout(verify, 2500);
    const interval = setInterval(verify, 4000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [verify, phase]);

  const status =
    phase === "confirmed"
      ? "Payment confirmed"
      : phase === "expired"
        ? "This payment expired"
        : lapsed
          ? "Time is up. Making a final check with Bakong"
          : failedChecks > 0
            ? "Could not check yet. Your payment is still safe"
            : checking
              ? "Checking with Bakong"
              : "Waiting for payment";

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.ink,
          paddingTop: Math.max(24, insets.top),
          paddingBottom: Math.max(24, insets.bottom),
          paddingHorizontal: 24,
          gap: 20,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Eyebrow>Bakong KHQR · Secure checkout</Eyebrow>
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
              opacity: phase === "waiting" ? 1 : 0.3,
            }}
          >
            {checkout.qr_string ? (
              <QRCode
                value={checkout.qr_string}
                size={240}
                color={colors.ink}
              />
            ) : (
              <View style={{ width: 240, height: 240 }} />
            )}
          </View>
          <Copy style={{ marginTop: 14, fontFamily: fonts.bold, fontSize: 12, color: colors.ink }}>
            {phase === "waiting"
              ? "Scan with your banking app"
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

        <View
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
          {phase === "waiting" && (
            <Pressable onPress={() => void verify()} disabled={checking}>
              <Copy
                style={{
                  fontFamily: fonts.bold,
                  textDecorationLine: "underline",
                  opacity: checking ? 0.4 : 1,
                }}
              >
                Check now
              </Copy>
            </Pressable>
          )}
        </View>
        {failedChecks > 2 && (
          <Copy style={{ color: colors.muted, fontSize: 12 }}>
            Bakong is taking longer to respond. Do not pay twice! You can reopen
            this payment from your race wallet.
          </Copy>
        )}
        {phase === "expired" && (
          <Copy style={{ fontSize: 13 }}>
            Your place was released so someone else could take it. Nothing was
            charged. If your bank shows a deduction, contact us before paying
            again.
          </Copy>
        )}
        <Copy style={{ color: colors.muted, fontSize: 11 }}>
          Your race ticket is issued only after Bakong confirms settlement.
        </Copy>
      </View>
    </Modal>
  );
}
