import { NotFoundError, ServiceError } from "infra/errors";

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

export interface GiftCardProvider {
  products(): Promise<GiftCardProduct[]>;
  issue(request: GiftCardIssueRequest): Promise<GiftCardDelivery>;
}

export function assertGiftCardSandbox() {
  if (!["development", "test"].includes(process.env.NODE_ENV)) {
    throw new ServiceError({
      message:
        "Gift card purchases are available only in development and tests.",
    });
  }
}

// Synthetic catalogue. No external brand, identity, URL, token or personal
// information is needed to exercise a virtual-card order and its tracking.
const products: GiftCardProduct[] = [
  {
    code: "sandbox-brl-25",
    name: "Demo gift card · R$25",
    amount_minor: 2500,
    currency: "BRL",
  },
  {
    code: "sandbox-brl-50",
    name: "Demo gift card · R$50",
    amount_minor: 5000,
    currency: "BRL",
  },
];

export const simulatedGiftCardProvider: GiftCardProvider = {
  async products() {
    assertGiftCardSandbox();
    return products.map((product) => ({ ...product }));
  },
  async issue({ request_id, product }) {
    assertGiftCardSandbox();
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
  },
};
