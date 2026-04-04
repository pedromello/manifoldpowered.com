import { User } from "generated/prisma/client";
import webserver from "infra/webserver";
import activation from "models/activation";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.deleteAllEmails();
});

let newUser: User;

describe("Use case: Registration Flow (all successful)", () => {
  test("Create a user account", async () => {
    const newUserResponse = await fetch("http://localhost:3000/api/v1/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "registration-flow",
        email: "registration-flow@manifoldpowered.com",
        password: "registration-password",
      }),
    });

    expect(newUserResponse.status).toBe(201);

    newUser = await newUserResponse.json();

    expect(newUser).toEqual({
      id: newUser.id,
      username: "registration-flow",
      email: "registration-flow@manifoldpowered.com",
      password: newUser.password,
      features: ["read:activation_token"],
      created_at: newUser.created_at,
      updated_at: newUser.updated_at,
    });
  });

  test("Receive activation email", async () => {
    const lastEmail = await orchestrator.getLastEmail();

    expect(lastEmail.sender).toBe("<contact@manifoldpowered.com>");
    expect(lastEmail.recipients[0]).toBe(
      "<registration-flow@manifoldpowered.com>",
    );
    expect(lastEmail.subject).toBe("Activate your account at Manifold!");
    expect(lastEmail.text).toContain("registration-flow");

    const activationObj = await activation.findByUserId(newUser.id);

    expect(activationObj.user_id).toBe(newUser.id);
    expect(activationObj.expires_at.getTime()).toBeGreaterThan(Date.now());
    expect(lastEmail.text).toContain(
      `${webserver.getOrigin()}/signup/activate/${activationObj.id}`,
    );
  });

  test("Activate account", async () => {});

  test("Login", async () => {});

  test("Get user profile", async () => {});
});
