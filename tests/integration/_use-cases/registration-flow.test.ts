import password from "models/password";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.deleteAllEmails();
});

describe("Use case: Registration Flow (all successful)", () => {
  test("Create a user account", async () => {
    const newUser = await fetch("http://localhost:3000/api/v1/users", {
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

    expect(newUser.status).toBe(201);

    const newUserBody = await newUser.json();

    expect(newUserBody).toEqual({
      id: newUserBody.id,
      username: "registration-flow",
      email: "registration-flow@manifoldpowered.com",
      password: newUserBody.password,
      features: [],
      created_at: newUserBody.created_at,
      updated_at: newUserBody.updated_at,
    });
  });

  test("Create a user account", async () => {});

  test("Create a user account", async () => {});

  test("Create a user account", async () => {});

  test("Create a user account", async () => {});
});
