import { prisma } from "infra/database";
import activation from "models/activation";
import otp from "models/otp";
import user from "models/user";
import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function activatedAccount() {
  const account = await orchestrator.createUser({ password: null });
  await activation.activateUserByUserId(account.id);
  return user.findOneById(account.id);
}

describe("email address ownership", () => {
  test("consumes activation proof with its exact address and account access", async () => {
    const account = await orchestrator.createUser({ password: null });
    const challenge = await activation.create(account.id);
    expect(challenge.recipient_email).toBe(account.email);
    expect(challenge.email_version).toBe(0);

    const result = await activation.consume(challenge.id);
    expect(result.user.verified_email).toBe(account.email);
    expect(result.user.email_verified_at).toBeInstanceOf(Date);
    expect(result.activation.used_at).toBeInstanceOf(Date);
    await expect(activation.consume(challenge.id)).rejects.toMatchObject({
      name: "NotFoundError",
    });
  });

  test("administrative activation does not manufacture address proof", async () => {
    const account = await activatedAccount();
    expect(account.verified_email).toBeNull();
    expect(account.email_verified_at).toBeNull();
  });

  test("ordinary OTP login proves ownership and preserves the first confirmation time", async () => {
    const account = await activatedAccount();
    const first = await otp.create(account.id);
    const confirmed = await otp.validateAndConsume(
      account.username,
      first.code,
    );
    expect(confirmed.verified_email).toBe(account.email);
    expect(confirmed.email_verified_at).toBeInstanceOf(Date);

    const second = await otp.create(account.id);
    const reconfirmed = await otp.validateAndConsume(
      account.email,
      second.code,
    );
    expect(reconfirmed.email_verified_at).toEqual(confirmed.email_verified_at);
  });

  test("address changes clear proof and invalidate outstanding old-address challenges", async () => {
    const account = await activatedAccount();
    const first = await otp.create(account.id);
    await otp.validateAndConsume(account.email, first.code);
    const pendingOtp = await otp.create(account.id);
    const pendingActivation = await activation.create(account.id);
    const nextAddress = `next-${account.id}@example.com`;
    const changed = await user.updateByUsername(account.username, {
      email: nextAddress,
    });
    expect(changed).toMatchObject({
      email: nextAddress,
      verified_email: null,
      email_verified_at: null,
      email_version: 1,
    });
    expect(
      await prisma.userOtp.findUniqueOrThrow({
        where: { id: pendingOtp.otp.id },
      }),
    ).toMatchObject({ used_at: expect.any(Date) });
    expect(
      await prisma.userActivationToken.findUniqueOrThrow({
        where: { id: pendingActivation.id },
      }),
    ).toMatchObject({ used_at: expect.any(Date) });
    await expect(
      otp.validateAndConsume(account.username, pendingOtp.code),
    ).rejects.toMatchObject({ name: "UnauthorizedError" });

    const current = await otp.create(account.id);
    expect(current.otp).toMatchObject({
      recipient_email: nextAddress,
      email_version: 1,
    });
    expect(
      await otp.validateAndConsume(account.username, current.code),
    ).toMatchObject({ verified_email: nextAddress, email_version: 1 });
  });

  test("case-only address updates preserve ownership and generation", async () => {
    const account = await activatedAccount();
    const challenge = await otp.create(account.id);
    const confirmed = await otp.validateAndConsume(
      account.username,
      challenge.code,
    );
    const updated = await user.updateByUsername(account.username, {
      email: `  ${account.email.toUpperCase()}  `,
    });
    expect(updated.email_version).toBe(0);
    expect(updated.verified_email).toBe(account.email);
    expect(updated.email_verified_at).toEqual(confirmed.email_verified_at);
  });

  test("concurrent consumers can redeem a code only once", async () => {
    const account = await activatedAccount();
    const challenge = await otp.create(account.id);
    const results = await Promise.allSettled([
      otp.validateAndConsume(account.username, challenge.code),
      otp.validateAndConsume(account.username, challenge.code),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
  });

  test("a challenge from an obsolete address generation cannot establish proof", async () => {
    const account = await activatedAccount();
    const challenge = await otp.create(account.id);
    await prisma.user.update({
      where: { id: account.id },
      data: { email_version: { increment: 1 } },
    });
    await expect(
      otp.validateAndConsume(account.username, challenge.code),
    ).rejects.toMatchObject({ name: "UnauthorizedError" });
    expect((await user.findOneById(account.id)).verified_email).toBeNull();
  });

  test("OTP mail uses the bound recipient even when the caller read an older address", async () => {
    const account = await activatedAccount();
    const nextAddress = `recipient-${account.id}@example.com`;
    await user.updateByUsername(account.username, { email: nextAddress });
    const challenge = await otp.create(account.id);
    await otp.sendEmailToUser(account, challenge.code, challenge.otp);
    const message = await orchestrator.getLastEmail();
    expect(message.recipients.join(",")).toContain(nextAddress);
    expect(message.text).toContain(challenge.code);
  });

  test("an email-change race cannot leave proof for the old address", async () => {
    const account = await activatedAccount();
    const challenge = await otp.create(account.id);
    const nextAddress = `race-${account.id}@example.com`;
    await Promise.allSettled([
      otp.validateAndConsume(account.username, challenge.code),
      user.updateByUsername(account.username, { email: nextAddress }),
    ]);
    const changed = await user.findOneById(account.id);
    expect(changed.email).toBe(nextAddress);
    expect(changed.verified_email).toBeNull();
    expect(changed.email_version).toBe(1);
  });

  test("legacy unbound challenges still authenticate without inventing proof", async () => {
    const account = await activatedAccount();
    const challenge = await otp.create(account.id);
    await prisma.userOtp.update({
      where: { id: challenge.otp.id },
      data: { recipient_email: null, email_version: null },
    });
    const result = await otp.validateAndConsume(
      account.username,
      challenge.code,
    );
    expect(result.verified_email).toBeNull();

    const pending = await orchestrator.createUser({ password: null });
    const legacyActivation = await prisma.userActivationToken.create({
      data: {
        user_id: pending.id,
        expires_at: new Date(Date.now() + 60_000),
      },
    });
    expect(
      (await activation.consume(legacyActivation.id)).user.verified_email,
    ).toBeNull();
  });

  test("public PATCH cannot assign protected account or proof fields", async () => {
    const account = await activatedAccount();
    const login = await orchestrator.createSession(account.id);
    for (const [field, value] of Object.entries({
      features: ["read:user:any"],
      verified_email: account.email,
      email_verified_at: new Date().toISOString(),
      email_version: 99,
      id: "replacement-id",
      created_at: "2000-01-01T00:00:00.000Z",
      updated_at: "2000-01-01T00:00:00.000Z",
    })) {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/users/${account.username}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${login.token}`,
          },
          body: JSON.stringify({ [field]: value }),
        },
      );
      expect(response.status).toBe(400);
    }
    const unchanged = await user.findOneById(account.id);
    expect(unchanged.features).toEqual(account.features);
    expect(unchanged.verified_email).toBeNull();
    expect(unchanged.email_version).toBe(0);
  });
});
