import email from "infra/email";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.deleteAllEmails();
});

describe("infra/email.ts", () => {
  test("send()", async () => {
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
    expect(lastEmail.recipients[0]).toContain("<receiver@manifoldpowered.com>");
    expect(lastEmail.subject).toBe("Last Email");
    expect(lastEmail.text).toContain("Text Last Email");
  });
});
