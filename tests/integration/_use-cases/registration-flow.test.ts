import { User } from "generated/prisma/client";
import webserver from "infra/webserver";
import activation from "models/activation";
import user from "models/user";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.deleteAllEmails();
});

let newUser: User;
let activationId: string;
let sessionId: string;

describe("Use case: Registration Flow (all successful)", () => {
  test("Create a user account", async () => {
    const newUserResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/users`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "registration-flow",
          email: "registration-flow@manifoldpowered.com",
          password: "registration-password",
        }),
      },
    );

    expect(newUserResponse.status).toBe(201);

    newUser = await newUserResponse.json();

    expect(newUser).toEqual({
      id: newUser.id,
      username: "registration-flow",
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
    expect(lastEmail.subject).toBe(
      "One step away — activate your Manifold account",
    );
    expect(lastEmail.text).toContain("registration-flow");

    activationId = orchestrator.extractUUID(lastEmail.text);
    expect(lastEmail.text).toContain(
      `${webserver.getOrigin()}/signup/activate/${activationId}`,
    );

    const activationObj = await activation.findOneValidById(activationId);

    expect(activationObj.user_id).toBe(newUser.id);
    expect(activationObj.used_at).toBeNull();
    expect(activationObj.expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  test("Activate account", async () => {
    const activateAccountResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/activations/${activationId}`,
      {
        method: "PATCH",
      },
    );
    expect(activateAccountResponse.status).toBe(200);

    const activationObj = await activateAccountResponse.json();

    expect(activationObj).toEqual({
      id: activationId,
      used_at: activationObj.used_at,
      user_id: newUser.id,
      expires_at: activationObj.expires_at,
      created_at: activationObj.created_at,
      updated_at: activationObj.updated_at,
    });
    expect(activationObj.used_at).not.toBeNull();

    const activatedUser = await user.findOneById(newUser.id);
    const newUserWithPassword = await orchestrator.getUserById(newUser.id);

    expect(activatedUser).toEqual({
      id: newUser.id,
      username: "registration-flow",
      email: "registration-flow@manifoldpowered.com",
      password: newUserWithPassword.password,
      features: [
        "create:session",
        "read:session",
        "update:user",
        "read:public_game",
        "create:wishlist",
        "read:wishlist",
        "delete:wishlist",
        "create:review",
        "read:review",
        "delete:review",
      ],
      created_at: activatedUser.created_at,
      updated_at: activatedUser.updated_at,
    });
  });

  test("Login", async () => {
    const loginResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/sessions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "registration-flow@manifoldpowered.com",
          password: "registration-password",
        }),
      },
    );

    expect(loginResponse.status).toBe(201);

    const loginResponseJson = await loginResponse.json();
    expect(loginResponseJson.user_id).toBe(newUser.id);
    sessionId = loginResponseJson.token;
  });

  test("Get user profile", async () => {
    const getUserResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/user`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${sessionId}`,
        },
      },
    );
    expect(getUserResponse.status).toBe(200);

    const getUserResponseJson = await getUserResponse.json();
    expect(getUserResponseJson).toEqual({
      id: newUser.id,
      username: "registration-flow",
      email: "registration-flow@manifoldpowered.com",
      features: [
        "create:session",
        "read:session",
        "update:user",
        "read:public_game",
        "create:wishlist",
        "read:wishlist",
        "delete:wishlist",
        "create:review",
        "read:review",
        "delete:review",
      ],
      created_at: getUserResponseJson.created_at,
      updated_at: getUserResponseJson.updated_at,
    });
  });
});
