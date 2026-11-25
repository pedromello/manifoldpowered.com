import { NotFoundError, ServiceError } from "infra/errors";
import { sandboxEnabled } from "infra/runtime";

export interface GiftCardProduct {
  code: string;
  name: string;
  amount_minor: number;
  currency: string;
}

export interface GiftCardIssueRequest {
  // Stable across retries and restarts; a real adapter must reconcile an
  // uncertain response by this reference before attempting another issuance.
  request_id: string;
  product: GiftCardProduct;
}

export interface GiftCardDelivery {
  reference: string;
  code: string;
}

export type GiftCardReconciliation =
  | { status: "issued"; delivery: GiftCardDelivery }
  // Definitive absence, including no previous request still running. A plain
  // "not found" from an eventually consistent lookup is not enough.
  | { status: "not_issued" }
  | { status: "pending" | "unknown" };

export interface GiftCardProvider {
  products(): Promise<GiftCardProduct[]>;
  issue(
    request: GiftCardIssueRequest,
    signal?: AbortSignal,
  ): Promise<GiftCardDelivery>;
  reconcile(
    request: GiftCardIssueRequest,
    signal?: AbortSignal,
  ): Promise<GiftCardReconciliation>;
}

export function assertGiftCardSandbox() {
  if (!sandboxEnabled()) {
    throw new ServiceError({
      message:
        "Gift card purchases are available only in development and tests.",
    });
  }
}

// Synthetic catalogue for visual prototypes using public platform branding.
// These labels do not imply real credit, stock, or a commercial integration.
const products: GiftCardProduct[] = [
  {
    code: "sandbox-brl-25",
    name: "Nintendo eShop · Demo",
    amount_minor: 2500,
    currency: "BRL",
  },
  {
    code: "sandbox-brl-50",
    name: "PlayStation Store · Demo",
    amount_minor: 5000,
    currency: "BRL",
  },
  {
    code: "sandbox-brl-100",
    name: "Steam · Demo",
    amount_minor: 10000,
    currency: "BRL",
  },
];

export const simulatedGiftCardProvider: GiftCardProvider = {
  async products() {
    assertGiftCardSandbox();
    assertSimulator();
    return products.map((product) => ({ ...product }));
  },
  async issue(request) {
    return simulatedDelivery(request);
  },
  async reconcile(request) {
    return { status: "issued", delivery: simulatedDelivery(request) };
  },
};

function simulatedDelivery({
  request_id,
  product,
}: GiftCardIssueRequest): GiftCardDelivery {
  assertGiftCardSandbox();
  assertSimulator();
  const registered = products.find((item) => item.code === product.code);
  if (
    !registered ||
    registered.amount_minor !== product.amount_minor ||
    registered.currency !== product.currency
  ) {
    throw new NotFoundError({ message: "Gift card product is unavailable." });
  }
  // Deterministic, explicitly nonredeemable, and independent of process
  // memory. A DB rollback or a restarted worker returns the same delivery.
  return {
    reference: `simulated:${request_id}`,
    code: `SIMULATED-NOT-REDEEMABLE-${request_id}`,
  };
}

function assertSimulator() {
  if (!["development", "test"].includes(process.env.NODE_ENV))
    throw new ServiceError({ message: "Demo gift cards are unavailable." });
}
