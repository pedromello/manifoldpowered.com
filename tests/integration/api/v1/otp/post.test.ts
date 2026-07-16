import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.deleteAllEmails();
});

describe("POST /api/v1/otp", () => {
  describe("Anonymous user", () => {
    test("With existing email should send a code and return 201", async () => {
      const user = await orchestrator.createUser({
        email: "otp-request@pedro.tec.br",
      });

      const response = await fetch(`${webserver.getOrigin()}/api/v1/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
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

    test("With non-existent email should return 404", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "non-existent@pedro.tec.br" }),
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

    test("With invalid email format should return 400", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      });

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.status_code).toBe(400);
    });
  });
});
