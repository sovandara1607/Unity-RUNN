export type SupportedCurrency = "USD" | "KHR";

export function formatMoney(amountMinor: number, currency: SupportedCurrency = "USD") {
  if (!amountMinor) return "Free";
  if (currency === "KHR") return `៛${amountMinor.toLocaleString()}`;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amountMinor / 100);
}

export function parseMoneyInput(value: string, currency: SupportedCurrency) {
  const amount = Number.parseFloat(value || "0");
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return currency === "KHR" ? Math.round(amount) : Math.round(amount * 100);
}
