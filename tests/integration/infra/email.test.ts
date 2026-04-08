import email from "infra/email";
import { ServiceError } from "infra/errors";
import { describe } from "node:test";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.deleteAllEmails();
});

describe("infra/email.ts", () => {
  describe("send()", () => {
    test("Sends an email and get the last one correctly", async () => {
      await email.send({
        from: "Manifold <sender@manifoldpowered.com>",
        to: "receiver@manifoldpowered.com",
        subject: "First Email",
        text: "Text First Email",
      });

      await email.send({
        from: "Manifold <sender@manifoldpowered.com>",
        to: "receiver@manifoldpowered.com",
        subject: "Last Email",
        text: "Text Last Email",
      });

      const lastEmail = await orchestrator.getLastEmail();

      expect(lastEmail).not.toBeNull();
      expect(lastEmail.sender).toContain("<sender@manifoldpowered.com>");
      expect(lastEmail.recipients[0]).toContain(
        "<receiver@manifoldpowered.com>",
      );
      expect(lastEmail.subject).toBe("Last Email");
      expect(lastEmail.text).toContain("Text Last Email");
    });

    test("Sends an email without from and without env EMAIL_FROM", async () => {
      const originalEmailFrom = process.env.EMAIL_FROM;
      delete process.env.EMAIL_FROM;

      try {
        await email.send({
          to: "receiver@manifoldpowered.com",
          subject: "First Email",
          text: "Text First Email",
        });

        fail("Should throw an error");
      } catch (error) {
        console.log(error.cause);
        expect(error).toBeInstanceOf(ServiceError);
        expect(error).toHaveProperty("message", "Could not send email");
        expect(error).toHaveProperty(
          "action",
          "Check if email service is available",
        );
        expect(error).toHaveProperty("context", {
          to: "receiver@manifoldpowered.com",
          subject: "First Email",
          text: "Text First Email",
        });
        expect(error.cause).toBeInstanceOf(Error);
        expect(error.cause).toHaveProperty(
          "message",
          "From is not defined in mailOptions nor in env EMAIL_FROM",
        );
      }

      process.env.EMAIL_FROM = originalEmailFrom;
    });

    test("Sends an email without from", async () => {
      await email.send({
        to: "receiver@manifoldpowered.com",
        subject: "First Email",
        text: "Text First Email",
      });

      await email.send({
        to: "receiver@manifoldpowered.com",
        subject: "Last Email",
        text: "Text Last Email",
      });

      const lastEmail = await orchestrator.getLastEmail();

      expect(lastEmail).not.toBeNull();
      expect(lastEmail.sender).toContain("<contact@manifoldpowered.com>");
      expect(lastEmail.recipients[0]).toContain(
        "<receiver@manifoldpowered.com>",
      );
      expect(lastEmail.subject).toBe("Last Email");
      expect(lastEmail.text).toContain("Text Last Email");
    });
  });
});
