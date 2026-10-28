export const purchasePaymentLabels: Record<string, string> = {
  UNPAID: "Payment incomplete",
  PENDING: "Awaiting payment",
  PROCESSING: "Payment under review",
  PAID: "Paid",
  FAILED: "Payment not approved",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  DISPUTED: "Payment being reviewed",
  ACQUIRED: "Acquired",
};
export function purchaseAvailability(
  type: string,
  payment: string,
  delivery: string,
  channel: "EMAIL" | "CODE" = "CODE",
) {
  if (["REFUNDED", "DISPUTED"].includes(payment) || delivery === "REVIEW")
    return "Purchase under review";
  if (delivery === "READY")
    return type === "GAME"
      ? "In your library"
      : channel === "EMAIL"
        ? "Delivered by email"
        : "Code available";
  if (payment === "CANCELLED") return "Purchase cancelled";
  if (payment !== "PAID") return "Waiting for payment";
  return type === "GAME"
    ? "Preparing your game"
    : channel === "EMAIL"
      ? "Preparing email delivery"
      : "Preparing your code";
}
