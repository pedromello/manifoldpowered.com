import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import activation from "models/activation";
import otp from "models/otp";
import session from "models/session";
import authorization from "models/authorization";
import profileHandler from "pages/api/v1/users/[username]";
import { apiRequest } from "tests/fixtures/api_request";
import {
  hasVerifiedAccountEmail,
  requireVerifiedAccountEmail,
} from "models/user_email_verification";

// Real local PostgreSQL transactions; no email or external provider is called.
const users: string[] = [];
async function account() {
  const created = await prisma.user.create({
    data: {
      username: `mail_${randomUUID().slice(0, 16)}`,
      email: `${randomUUID()}@example.test`,
      features: ["read:activation_token"],
    },
  });
  users.push(created.id);
  return created;
}
afterAll(async () => {
  const where = { user_id: { in: users } };
  await prisma.userEmailVerification.deleteMany({ where });
  await prisma.userOtp.deleteMany({ where });
  await prisma.userActivationToken.deleteMany({ where });
  await prisma.session.deleteMany({ where });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

test("permissions alone do not prove the current account mailbox", async () => {
  const buyer = await account();
  await activation.activateUserByUserId(buyer.id);
  await expect(
    prisma.$transaction((tx) => requireVerifiedAccountEmail(tx, buyer.id)),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(await hasVerifiedAccountEmail(buyer.id)).toBe(false);
});

test("activation consumes its exact mailbox proof atomically once", async () => {
  const buyer = await account();
  const challenge = await activation.create(buyer.id);
  expect(challenge.email).toBe(buyer.email);
  const results = await Promise.allSettled([
    activation.consume(challenge.id),
    activation.consume(challenge.id),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(
    1,
  );
  expect(await hasVerifiedAccountEmail(buyer.id)).toBe(true);
  expect(
    await prisma.$transaction((tx) =>
      requireVerifiedAccountEmail(tx, buyer.id),
    ),
  ).toBe(buyer.email);
});

test("an activation sent before an email change cannot activate or verify the new address", async () => {
  const buyer = await account();
  const challenge = await activation.create(buyer.id);
  await prisma.user.update({
    where: { id: buyer.id },
    data: { email: `${randomUUID()}@example.test` },
  });
  await expect(activation.consume(challenge.id)).rejects.toMatchObject({
    statusCode: 404,
  });
  expect(await hasVerifiedAccountEmail(buyer.id)).toBe(false);
  expect(
    await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } }),
  ).toMatchObject({ features: ["read:activation_token"] });
});

test("OTP consumption proves its mailbox and concurrent replay succeeds only once", async () => {
  const buyer = await account();
  await activation.activateUserByUserId(buyer.id);
  const challenge = await otp.create(buyer.id);
  expect(challenge.otp.email).toBe(buyer.email);
  const results = await Promise.allSettled([
    otp.validateAndConsume(buyer.username, challenge.code),
    otp.validateAndConsume(buyer.username, challenge.code),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(
    1,
  );
  expect(await hasVerifiedAccountEmail(buyer.id)).toBe(true);
});

test("a code sent to the old address cannot prove the changed address with an existing account", async () => {
  const buyer = await account();
  await activation.activateUserByUserId(buyer.id);
  const challenge = await otp.create(buyer.id);
  await prisma.user.update({
    where: { id: buyer.id },
    data: { email: `${randomUUID()}@example.test` },
  });
  await expect(
    otp.validateAndConsume(buyer.username, challenge.code),
  ).rejects.toMatchObject({ statusCode: 401 });
  expect(await hasVerifiedAccountEmail(buyer.id)).toBe(false);
});

test("email changes invalidate delivery eligibility without trusting existing sessions", async () => {
  const buyer = await account();
  const challenge = await otp.create(buyer.id);
  await otp.validateAndConsume(buyer.username, challenge.code);
  await prisma.user.update({
    where: { id: buyer.id },
    data: { email: `${randomUUID()}@example.test` },
  });
  await expect(
    prisma.$transaction((tx) => requireVerifiedAccountEmail(tx, buyer.id)),
  ).rejects.toMatchObject({ statusCode: 409 });
  const replacement = await otp.create(buyer.id);
  await otp.validateAndConsume(buyer.username, replacement.code);
  expect(await hasVerifiedAccountEmail(buyer.id)).toBe(true);
});

test("legacy activation challenges preserve activation without inventing mailbox proof", async () => {
  const buyer = await account();
  const challenge = await activation.create(buyer.id);
  await prisma.userActivationToken.update({
    where: { id: challenge.id },
    data: { email: null },
  });
  await activation.consume(challenge.id);
  expect(await hasVerifiedAccountEmail(buyer.id)).toBe(false);
});

test("legacy OTP challenges can log in without inventing mailbox proof", async () => {
  const buyer = await account();
  const challenge = await otp.create(buyer.id);
  await prisma.userOtp.update({
    where: { id: challenge.otp.id },
    data: { email: null },
  });
  expect(
    await otp.validateAndConsume(buyer.username, challenge.code),
  ).toMatchObject({
    id: buyer.id,
  });
  expect(await hasVerifiedAccountEmail(buyer.id)).toBe(false);
});

test.each<[string, Record<string, unknown>]>([
  ["permission grants", { features: authorization.ADMIN_ONLY_FEATURES }],
  ["internal identity", { id: "synthetic-forged-account" }],
  ["mailbox proof", { verified_email: "forged@example.test" }],
  ["account timestamps", { created_at: "2000-01-01T00:00:00.000Z" }],
])(
  "profile rejects %s without altering permissions or mailbox evidence",
  async (_label, payload) => {
    const buyer = await account();
    const challenge = await activation.create(buyer.id);
    await activation.consume(challenge.id);
    const authenticated = await session.create(buyer.id);
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: buyer.id },
    });
    const proof = await prisma.userEmailVerification.findUniqueOrThrow({
      where: { user_id: buyer.id },
    });
    const response = await apiRequest(profileHandler, {
      url: `/api/v1/users/${buyer.username}`,
      method: "PATCH",
      query: { username: buyer.username },
      session: authenticated.token,
      // Mixing a valid field with an internal field must reject the entire update.
      body: { email: "unused@example.test", ...payload },
    });
    expect(response.status).toBe(400);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } }),
    ).toEqual(before);
    expect(
      await prisma.userEmailVerification.findUniqueOrThrow({
        where: { user_id: buyer.id },
      }),
    ).toEqual(proof);
    expect(await hasVerifiedAccountEmail(buyer.id)).toBe(true);
    expect(authorization.can(before, "read:dashboard:any")).toBe(false);
  },
);

test("valid own profile updates preserve permissions and require proof for a changed email", async () => {
  const buyer = await account();
  const challenge = await activation.create(buyer.id);
  const activated = await activation.consume(challenge.id);
  const authenticated = await session.create(buyer.id);
  const nextEmail = `${randomUUID()}@example.test`;
  const nextUsername = `mail_${randomUUID().slice(0, 16)}`;
  const response = await apiRequest(profileHandler, {
    url: `/api/v1/users/${buyer.username}`,
    method: "PATCH",
    query: { username: buyer.username },
    session: authenticated.token,
    body: { username: nextUsername, email: nextEmail },
  });
  expect(response.status).toBe(200);
  expect(
    await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } }),
  ).toMatchObject({
    username: nextUsername,
    email: nextEmail,
    features: activated.user.features,
  });
  expect(
    await prisma.userEmailVerification.findUniqueOrThrow({
      where: { user_id: buyer.id },
    }),
  ).toMatchObject({ email: buyer.email });
  expect(await hasVerifiedAccountEmail(buyer.id)).toBe(false);
  await expect(
    prisma.$transaction((tx) => requireVerifiedAccountEmail(tx, buyer.id)),
  ).rejects.toMatchObject({ statusCode: 409 });
});
