import { purchaseAvailability } from "lib/purchase-status";

test("email delivery remains pending after payment and becomes delivered only at READY", () => {
  expect(purchaseAvailability("GIFT_CARD", "PAID", "PENDING", "EMAIL")).toBe(
    "Preparing email delivery",
  );
  expect(purchaseAvailability("GIFT_CARD", "PAID", "READY", "EMAIL")).toBe(
    "Delivered by email",
  );
  expect(purchaseAvailability("GIFT_CARD", "UNPAID", "PENDING", "EMAIL")).toBe(
    "Waiting for payment",
  );
});

test("review and refunded payments take precedence over previously available delivery", () => {
  expect(purchaseAvailability("GIFT_CARD", "REFUNDED", "READY", "EMAIL")).toBe(
    "Purchase under review",
  );
  expect(purchaseAvailability("GIFT_CARD", "PAID", "REVIEW", "EMAIL")).toBe(
    "Purchase under review",
  );
});

test("game and legacy code delivery retain their existing labels", () => {
  expect(purchaseAvailability("GAME", "PAID", "READY")).toBe("In your library");
  expect(purchaseAvailability("GIFT_CARD", "PAID", "READY", "CODE")).toBe(
    "Code available",
  );
});
