import { User } from "generated/prisma/client";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.deleteAllEmails();
});

let newUser: User;
let sessionToken: string;

describe("Use case: Passwordless login flow via OTP (all successful)", () => {
  test("Create and activate a user account", async () => {
    newUser = await orchestrator.createUser({
      email: "passwordless-flow@manifoldpowered.com",
    });
    await orchestrator.activateUser(newUser.id);
  });

  test("Request an OTP code", async () => {
    const response = await fetch(`${webserver.getOrigin()}/api/v1/otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newUser.email }),
    });

    expect(response.status).toBe(201);
  });

  test("Receive the code by email", async () => {
    const lastEmail = await orchestrator.getLastEmail();

    expect(lastEmail.recipients[0]).toBe(
      "<passwordless-flow@manifoldpowered.com>",
    );
    expect(lastEmail.subject).toBe("Your Manifold login code");

    const code = orchestrator.extractOtpCode(lastEmail.text);
    expect(code).toMatch(/^\d{6}$/);

    const verifyResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/otp/sessions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newUser.email, code }),
      },
    );

    expect(verifyResponse.status).toBe(201);

    const verifyResponseBody = await verifyResponse.json();
    expect(verifyResponseBody.user_id).toBe(newUser.id);

    sessionToken = verifyResponseBody.token;
  });

  test("Access the authenticated profile with the issued session", async () => {
    const response = await fetch(`${webserver.getOrigin()}/api/v1/user`, {
      method: "GET",
      headers: {
        Cookie: `session_id=${sessionToken}`,
      },
    });

    expect(response.status).toBe(200);

    const responseBody = await response.json();
    expect(responseBody.id).toBe(newUser.id);
  });

  test("Reusing the same code should now fail", async () => {
    const lastEmail = await orchestrator.getLastEmail();
    const code = orchestrator.extractOtpCode(lastEmail.text);

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/otp/sessions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newUser.email, code }),
      },
    );

    expect(response.status).toBe(401);
  });
});
