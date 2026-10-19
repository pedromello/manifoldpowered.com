import {
  renderSelectionEmail,
  sendSelectionEmailBatch,
  selectionEmailSender,
  SelectionEmailTransportError,
  type SelectionEmailContent,
} from "infra/selection-email";
import nodemailer from "nodemailer";

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

const content: SelectionEmailContent = {
  locale: "pt-BR",
  outlet: {
    name: "Clube dos jogos",
    slug: "clube",
    logo_url: "https://images.example/outlet.png",
  },
  selection: {
    title: "Mistérios do fim de semana",
    description: "Três mundos para descobrir.",
    cover_url: "https://images.example/selection.png",
    slug: "misterios",
  },
  games: [
    {
      title: "First game",
      slug: "first-game",
      image_url: "https://images.example/first.png",
    },
    { title: "Second game", slug: "second-game" },
    { title: "Third game", slug: "third-game" },
    { title: "Fourth game", slug: "fourth-game" },
  ],
  publicUrl:
    "https://www.manifoldpowered.com/pt-BR/store/clube/selections/misterios",
  unsubscribeUrl:
    "https://www.manifoldpowered.com/pt-BR/notifications/unsubscribe/token",
  preferencesUrl:
    "https://www.manifoldpowered.com/pt-BR/settings/notifications",
};
const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const fetchMock = jest.fn();

beforeEach(() => {
  process.env.OUTLET_SELECTION_EMAILS_ENABLED = "true";
  process.env.OUTLET_SELECTION_EMAIL_TRANSPORT = "resend";
  process.env.VERCEL_ENV = "production";
  process.env.EMAIL_FROM = "notices@example.com";
  process.env.RESEND_API_KEY = "test-only-api-key";
  global.fetch = fetchMock;
  fetchMock.mockReset();
});
afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

function message(to = "recipient@example.com") {
  return { to, ...renderSelectionEmail(content) };
}

test("localizes the shell, preserves curator text and published game order, limits to three", () => {
  const portuguese = renderSelectionEmail(content);
  const english = renderSelectionEmail({ ...content, locale: "en" });
  expect(portuguese.subject).toBe("Clube dos jogos publicou uma nova seleção");
  expect(portuguese.html).toContain("Explorar seleção");
  expect(english.html).toContain("Explore selection");
  expect(english.html).toContain(content.selection.title);
  expect(english.html).not.toContain("Fourth game");
  expect(english.html.indexOf("First game")).toBeLessThan(
    english.html.indexOf("Second game"),
  );
  expect(english.html).toContain("/en/item/first-game");
  expect(english.html).toContain("/images/brand/manifold-logo.png");
  expect(english.text).toContain("Manage preferences");
  expect(renderSelectionEmail({ ...content, locale: "invalid" }).subject).toBe(
    english.subject,
  );
});

test("escapes curator content, excludes unsafe images, and rejects unsafe email links", () => {
  const output = renderSelectionEmail({
    ...content,
    outlet: { ...content.outlet, name: "Outlet\r\nBcc: hidden@example.com" },
    selection: {
      ...content.selection,
      title: '<script>alert("x")</script>',
      cover_url: "javascript:alert(1)",
    },
  });
  expect(output.subject).not.toMatch(/[\r\n]/);
  expect(output.html).toContain("&lt;script&gt;");
  expect(output.html).not.toContain("<script>");
  expect(output.html).not.toContain("javascript:");
  expect(() =>
    renderSelectionEmail({ ...content, unsubscribeUrl: "javascript:alert(1)" }),
  ).toThrow("Invalid selection email link");
});

test("sends individual recipients in stable order with the persisted sender and idempotency key", async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ data: [{ id: "one" }, { id: "two" }] }), {
      status: 200,
    }),
  );
  const messages = [
    { ...message(), from: "Frozen <frozen@example.com>" },
    message("other@example.com"),
  ];
  await expect(
    sendSelectionEmailBatch(messages, "batch-stable-key"),
  ).resolves.toEqual([{ id: "one" }, { id: "two" }]);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails/batch");
  expect(init.headers["Idempotency-Key"]).toBe("batch-stable-key");
  expect(init.redirect).toBe("error");
  const body = JSON.parse(init.body);
  expect(body.map((item) => item.to)).toEqual([
    ["recipient@example.com"],
    ["other@example.com"],
  ]);
  expect(body[0].from).toBe("Frozen <frozen@example.com>");
  expect(body[1].from).toBe("Manifold <notices@example.com>");
});

test.each([
  [429, "retryable", "120", 120],
  [400, "permanent", null, 60],
  [503, "uncertain", null, 60],
])(
  "classifies HTTP %i without keeping provider text or recipients",
  async (status, kind, header, delay) => {
    fetchMock.mockResolvedValue(
      new Response("recipient@example.com secret body", {
        status,
        headers: header ? { "Retry-After": header } : {},
      }),
    );
    try {
      await sendSelectionEmailBatch([message()], "key");
      throw new Error("Expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(SelectionEmailTransportError);
      expect(error).toMatchObject({ kind, retryAfterSeconds: delay });
      expect(JSON.stringify(error)).not.toContain("recipient@example.com");
      expect(error.cause).toBeUndefined();
    }
  },
);

test("network uncertainty and invalid success responses remain uncertain", async () => {
  fetchMock.mockRejectedValueOnce(
    new Error("contains private recipient@example.com"),
  );
  await expect(
    sendSelectionEmailBatch([message()], "key"),
  ).rejects.toMatchObject({ kind: "uncertain", code: "resend_network" });
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ data: [] }), { status: 200 }),
  );
  await expect(
    sendSelectionEmailBatch([message()], "key"),
  ).rejects.toMatchObject({ kind: "uncertain", code: "resend_response" });
});

test("rejects oversized batches, multiple recipients and feature-disabled sends before network", async () => {
  await expect(
    sendSelectionEmailBatch(
      Array.from({ length: 101 }, () => message()),
      "key",
    ),
  ).rejects.toMatchObject({ code: "invalid_batch" });
  await expect(
    sendSelectionEmailBatch(
      [message("one@example.com,two@example.com")],
      "key",
    ),
  ).rejects.toMatchObject({ code: "invalid_batch" });
  process.env.OUTLET_SELECTION_EMAILS_ENABLED = "false";
  await expect(
    sendSelectionEmailBatch([message()], "key"),
  ).rejects.toMatchObject({ code: "feature_disabled" });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("previews cannot send real emails without an exact recipient allowlist", async () => {
  process.env.VERCEL_ENV = "preview";
  delete process.env.OUTLET_SELECTION_EMAIL_TEST_RECIPIENTS;
  await expect(
    sendSelectionEmailBatch([message()], "key"),
  ).rejects.toMatchObject({ code: "test_recipient_denied" });
  expect(fetchMock).not.toHaveBeenCalled();
  process.env.OUTLET_SELECTION_EMAIL_TEST_RECIPIENTS = "recipient@example.com";
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ data: [{ id: "allowed" }] }), {
      status: 200,
    }),
  );
  await expect(sendSelectionEmailBatch([message()], "key")).resolves.toEqual([
    { id: "allowed" },
  ]);
});

test("local default uses Mailcatcher HTML/text and stable Message-ID without Resend", async () => {
  process.env.VERCEL_ENV = "development";
  delete process.env.OUTLET_SELECTION_EMAIL_TRANSPORT;
  process.env.EMAIL_SMTP_HOST = "127.0.0.1";
  const sendMail = jest.fn().mockResolvedValue({});
  jest
    .mocked(nodemailer.createTransport)
    .mockReturnValue({ sendMail } as never);
  const first = await sendSelectionEmailBatch([message()], "stable-local-key");
  const second = await sendSelectionEmailBatch([message()], "stable-local-key");
  expect(second).toEqual(first);
  expect(sendMail.mock.calls[0][0]).toMatchObject({
    html: expect.stringContaining("Explorar seleção"),
    text: expect.stringContaining("Explorar seleção"),
    messageId: first[0].id,
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("requires a configured sender", () => {
  delete process.env.EMAIL_FROM;
  expect(selectionEmailSender).toThrow(SelectionEmailTransportError);
});

test("production rejects an SMTP override because Message-ID does not make retries idempotent", async () => {
  process.env.VERCEL_ENV = "production";
  process.env.OUTLET_SELECTION_EMAIL_TRANSPORT = "smtp";
  await expect(
    sendSelectionEmailBatch([message()], "stable-key"),
  ).rejects.toMatchObject({
    kind: "permanent",
    code: "production_smtp_forbidden",
  });
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("concurrent idempotency conflicts remain uncertain and retry the identical body/key", async () => {
  const messages = [{ ...message(), from: "Frozen <frozen@example.com>" }];
  fetchMock
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: "concurrent_idempotent_requests",
          message: "private recipient@example.com and secret body",
        }),
        { status: 409, headers: { "Retry-After": "17" } },
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: "accepted" }] }), {
        status: 200,
      }),
    );
  try {
    await sendSelectionEmailBatch(messages, "persisted-key");
    throw new Error("Expected conflict");
  } catch (error) {
    expect(error).toMatchObject({
      kind: "uncertain",
      code: "resend_concurrent_idempotent_requests",
      retryAfterSeconds: 17,
    });
    expect(JSON.stringify(error)).not.toContain("recipient@example.com");
    expect(error.cause).toBeUndefined();
  }
  await expect(
    sendSelectionEmailBatch(messages, "persisted-key"),
  ).resolves.toEqual([{ id: "accepted" }]);
  expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
  expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe(
    "persisted-key",
  );
});

test("an explicit idempotency body mismatch is permanent without retaining provider details", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        name: "invalid_idempotent_request",
        message: "private recipient@example.com and secret body",
      }),
      { status: 409 },
    ),
  );
  try {
    await sendSelectionEmailBatch([message()], "persisted-key");
    throw new Error("Expected conflict");
  } catch (error) {
    expect(error).toMatchObject({
      kind: "permanent",
      code: "resend_invalid_idempotent_request",
    });
    expect(JSON.stringify(error)).not.toContain("recipient@example.com");
    expect(error.cause).toBeUndefined();
  }
});

test.each([
  "not-json",
  JSON.stringify({ name: "private-provider-name@example.com" }),
])(
  "an unrecognized conflict response fails conservatively without exposing its body",
  async (body) => {
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 409 }));
    await expect(
      sendSelectionEmailBatch([message()], "key"),
    ).rejects.toMatchObject({ kind: "uncertain", code: "resend_http_409" });
  },
);

test("conflict error parsing stops at four KiB and cancels an oversized provider body", async () => {
  const cancel = jest.fn();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8192));
    },
    cancel,
  });
  fetchMock.mockResolvedValueOnce(new Response(body, { status: 409 }));
  await expect(
    sendSelectionEmailBatch([message()], "key"),
  ).rejects.toMatchObject({ kind: "uncertain", code: "resend_http_409" });
  expect(cancel).toHaveBeenCalledTimes(1);
});
