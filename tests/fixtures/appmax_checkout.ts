import { randomUUID } from "node:crypto";
import { createAppmaxPaymentProvider } from "infra/payments/appmax";

type RemoteOrder = {
  customer_id: number;
  total_minor: number;
  status: string;
  method?: "pix" | "creditcard";
  installments?: number;
  paid_at?: string;
};

// Test-only HTTP responses. The actual Appmax adapter serializes requests,
// authenticates and interprets these responses; nothing reaches an external API.
export function appmaxCheckoutFixture() {
  const customers = new Map<number, { email: string }>();
  const orders = new Map<number, RemoteOrder>();
  let sequence = parseInt(randomUUID().replace(/-/g, "").slice(0, 10), 16);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });
  const request = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.href === "https://auth.sandboxappmax.com.br/oauth2/token") {
        const form = new URLSearchParams(String(init?.body));
        if (
          form.get("grant_type") !== "client_credentials" ||
          form.get("client_id") !== "synthetic-use-case-client" ||
          form.get("client_secret") !== "synthetic-use-case-secret"
        )
          return json({}, 401);
        return json({
          access_token: "synthetic-use-case-bearer",
          expires_in: 3600,
        });
      }
      if (
        url.origin !== "https://api.sandboxappmax.com.br" ||
        new Headers(init?.headers).get("authorization") !==
          "Bearer synthetic-use-case-bearer"
      )
        throw new Error("Unexpected Appmax fixture request.");
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (
        url.pathname === "/v1/payments/installments" &&
        init?.method === "POST"
      )
        return json({
          data: {
            installments: {
              "1": { total: body.total_value },
              "3": { total: body.total_value + 300 },
            },
            settings: { max_installments: 3, min_installment_value: 500 },
          },
        });
      if (url.pathname === "/v1/customers" && init?.method === "POST") {
        const id = ++sequence;
        customers.set(id, { email: body.email });
        return json({ data: { customer: { id } } }, 201);
      }
      if (url.pathname === "/v1/orders" && init?.method === "POST") {
        if (!customers.has(body.customer_id)) return json({}, 422);
        const id = ++sequence;
        orders.set(id, {
          customer_id: body.customer_id,
          total_minor: body.products[0].unit_value,
          status: "pendente",
        });
        return json({ data: { order: { id } } }, 201);
      }
      if (url.pathname === "/v1/payments/pix" && init?.method === "POST") {
        const order = orders.get(body.order_id)!;
        order.method = "pix";
        order.installments = 1;
        return json(
          {
            data: {
              payment: {
                pix_qrcode: Buffer.from("synthetic-pix-qr").toString("base64"),
                pix_emv: "FIXTURE-PIX-NOT-PAYABLE",
                pix_expiration_date: new Date(
                  Date.now() + 3600000,
                ).toISOString(),
              },
            },
          },
          201,
        );
      }
      if (
        url.pathname === "/v1/payments/credit-card" &&
        init?.method === "POST"
      ) {
        const order = orders.get(body.order_id)!;
        order.method = "creditcard";
        order.installments = body.payment_data.credit_card.installments;
        order.status = "autorizado";
        return json(
          { data: { order: { id: body.order_id, status: "autorizado" } } },
          201,
        );
      }
      const remote = url.pathname.match(/^\/v1\/orders\/(\d+)$/);
      if (remote && init?.method === "GET") {
        const id = Number(remote[1]);
        const order = orders.get(id);
        if (!order) return json({}, 404);
        return json({
          data: {
            order: {
              id,
              status: order.status,
              total_paid: order.paid_at ? order.total_minor : 0,
            },
            customer: { id: order.customer_id },
            payment: {
              method: order.method,
              installments: order.installments,
              paid_at: order.paid_at ?? null,
            },
          },
        });
      }
      throw new Error("Unexpected Appmax fixture endpoint.");
    },
  );
  const provider = createAppmaxPaymentProvider({ request });
  function approve(id: string) {
    const order = orders.get(Number(id));
    if (!order?.method)
      throw new Error("Fixture payment has not been submitted.");
    order.status = "aprovado";
    order.paid_at = new Date().toISOString();
  }
  return { provider, request, approve };
}
