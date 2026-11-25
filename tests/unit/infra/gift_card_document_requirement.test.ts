import { recipientDocumentRequired } from "infra/gift_card_api";

const original = { ...process.env };

beforeEach(() => {
  process.env.GIFT_CARD_PROVIDER = "api";
  delete process.env.GIFT_CARD_PROVIDER_DOCUMENT_REQUIRED;
});

afterEach(() => {
  process.env = { ...original };
});

test.each([undefined, "", "invalid", "true", "TRUE", " false"])(
  "API email delivery requires a document for configuration %j",
  (configured) => {
    if (configured !== undefined)
      process.env.GIFT_CARD_PROVIDER_DOCUMENT_REQUIRED = configured;

    expect(recipientDocumentRequired()).toBe(true);
  },
);

test("API email delivery permits only the explicit false opt-out", () => {
  process.env.GIFT_CARD_PROVIDER_DOCUMENT_REQUIRED = "false";

  expect(recipientDocumentRequired()).toBe(false);
});

test("simulated delivery keeps its optional document default", () => {
  process.env.GIFT_CARD_PROVIDER = "simulated";

  expect(recipientDocumentRequired()).toBe(false);
});

test("simulated delivery can explicitly require a document", () => {
  process.env.GIFT_CARD_PROVIDER = "simulated";
  process.env.GIFT_CARD_PROVIDER_DOCUMENT_REQUIRED = "true";

  expect(recipientDocumentRequired()).toBe(true);
});
