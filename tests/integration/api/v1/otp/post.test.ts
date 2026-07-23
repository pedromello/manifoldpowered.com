import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.deleteAllEmails();
});

describe("POST /api/v1/otp", () => {
  describe("Anonymous user", () => {
    test("With an existing email should send a code and return 201", async () => {
      const user = await orchestrator.createUser({
        email: "otp-request@pedro.tec.br",
      });

      const response = await fetch(`${webserver.getOrigin()}/api/v1/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: user.email }),
      });

      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody).toEqual({ message: "OTP code sent to your email" });

      const lastEmail = await orchestrator.getLastEmail();
      expect(lastEmail.sender).toBe("<contact@manifoldpowered.com>");
      expect(lastEmail.recipients[0]).toBe("<otp-request@pedro.tec.br>");
      expect(lastEmail.subject).toBe("Your Manifold login code");

      const code = orchestrator.extractOtpCode(lastEmail.text);
      expect(code).toMatch(/^\d{6}$/);
    });

    test("With an existing username should send a code to that user's email and return 201", async () => {
      const user = await orchestrator.createUser({
        username: "otpbyusername",
        email: "otp-by-username@pedro.tec.br",
      });

      const response = await fetch(`${webserver.getOrigin()}/api/v1/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: user.username }),
      });

      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody).toEqual({ message: "OTP code sent to your email" });

      const lastEmail = await orchestrator.getLastEmail();
      expect(lastEmail.recipients[0]).toBe("<otp-by-username@pedro.tec.br>");

      const code = orchestrator.extractOtpCode(lastEmail.text);
      expect(code).toMatch(/^\d{6}$/);
    });

    test("With a non-existent email should return 404", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: "non-existent@pedro.tec.br" }),
      });

      expect(response.status).toBe(404);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "User with email non-existent@pedro.tec.br not found",
        name: "NotFoundError",
        action: "Try another email",
        status_code: 404,
      });
    });

    test("With a non-existent username should return 404", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: "nonexistentuser" }),
      });

      expect(response.status).toBe(404);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "User with username nonexistentuser not found",
        name: "NotFoundError",
        action: "Try another username",
        status_code: 404,
      });
    });

    test("With a missing login should return 400", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.status_code).toBe(400);
    });
  });
});
