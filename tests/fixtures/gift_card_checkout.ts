/// <reference types="jest" />
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import type { CheckoutGateway, CheckoutRequest } from "infra/stripe_checkout";
import { createGiftCardOrderService } from "models/gift_card_order";
import { createGiftCardDeliveryService } from "models/gift_card_delivery";
import {
  type GiftCardDelivery,
  type GiftCardIssueRequest,
  type GiftCardReconciliation,
  simulatedGiftCardProvider,
} from "infra/gift_card_provider";

// Payment responses live exclusively in the test layer. Application runtime
// always uses the real Stripe SDK; no fake payment gateway can be selected.
export function checkoutFixture() {
  const sessions = new Map<string, Stripe.Checkout.Session>();
  const byOrder = new Map<string, string>();
  const create = jest.fn(async ({ order_id, product }: CheckoutRequest) => {
    if (byOrder.has(order_id)) return sessions.get(byOrder.get(order_id)!)!;
    const id = `cs_test_fixture_${randomUUID()}`;
    const session = {
      id,
      object: "checkout.session",
      livemode: false,
      mode: "payment",
      status: "open",
      payment_status: "unpaid",
      payment_intent: null,
      client_reference_id: order_id,
      metadata: { purchase_type: "gift_card", order_id },
      amount_total: product.amount_minor,
      currency: product.currency.toLowerCase(),
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      url: `https://checkout.stripe.com/c/pay/${id}`,
    } as unknown as Stripe.Checkout.Session;
    byOrder.set(order_id, id);
    sessions.set(id, session);
    return session;
  });
  const gateway: CheckoutGateway = {
    create,
    retrieve: jest.fn(async (id: string) => {
      const session = sessions.get(id);
      if (!session) throw new Error("Fixture session not found");
      return { ...session };
    }),
    expire: jest.fn(async (id: string) => {
      const session = sessions.get(id)!;
      session.status = "expired";
      return { ...session };
    }),
  };
  const deliveries = new Map<string, GiftCardDelivery>();
  const provider = {
    products: simulatedGiftCardProvider.products,
    issue: jest.fn(async (request: GiftCardIssueRequest) => {
      const delivery =
        deliveries.get(request.request_id) ??
        (await simulatedGiftCardProvider.issue(request));
      deliveries.set(request.request_id, delivery);
      return delivery;
    }),
    reconcile: jest.fn(
      async (
        request: GiftCardIssueRequest,
      ): Promise<GiftCardReconciliation> => {
        const delivery = deliveries.get(request.request_id);
        return delivery
          ? { status: "issued", delivery }
          : { status: "not_issued" };
      },
    ),
  };
  const getSession = (orderId: string) => sessions.get(byOrder.get(orderId)!)!;
  function pay(orderId: string) {
    const session = getSession(orderId);
    session.status = "complete";
    session.payment_status = "paid";
    session.payment_intent = `pi_fixture_${orderId}`;
    session.url = null;
    return session;
  }
  return { gateway, provider, create, sessions, deliveries, getSession, pay };
}

export function paymentEvent(
  session: Stripe.Checkout.Session,
  type = "checkout.session.completed",
  id = `evt_fixture_${randomUUID()}`,
): Stripe.Event {
  return {
    id,
    object: "event",
    type,
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: { ...session, metadata: { ...session.metadata } } },
  } as unknown as Stripe.Event;
}

export function checkoutFlowFixture(
  fixture: ReturnType<typeof checkoutFixture>,
) {
  const orders = createGiftCardOrderService(fixture);
  const delivery = createGiftCardDeliveryService(fixture);
  return {
    ...orders,
    retryIssuance: (userId: string, id: string) => delivery.fulfill(id, userId),
    receive: async (event: Stripe.Event) => {
      const order = await orders.receive(event);
      if (order) await delivery.fulfill(order.id);
    },
  };
}
