import type { NextApiRequest, NextApiResponse } from "next";
import handler from "pages/api/v1/gift-cards";

async function call(method = "GET") {
  const req = {
    method,
    headers: {},
    url: "/api/v1/gift-cards",
  } as NextApiRequest;
  const res = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  };
  await handler(req, res as unknown as NextApiResponse);
  return res;
}

test("anonymous catalogue exposes products but no buyer orders or secret codes", async () => {
  const res = await call();
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  const body = res.json.mock.calls[0][0];
  expect(body.products.map((product) => product.amount_minor)).toEqual([
    2500, 5000, 10000,
  ]);
  expect(Object.keys(body).sort()).toEqual(["checkout_available", "products"]);
  expect(
    body.products.every(
      (product) =>
        Object.keys(product).sort().join() ===
        "amount_minor,code,currency,name",
    ),
  ).toBe(true);
});

test("public catalogue does not create purchases", async () => {
  expect((await call("POST")).status).toHaveBeenCalledWith(405);
});

test("demo catalogue is unavailable in production", async () => {
  const original = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  try {
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).not.toHaveBeenCalled();
  } finally {
    Object.assign(process.env, { NODE_ENV: original });
  }
});
