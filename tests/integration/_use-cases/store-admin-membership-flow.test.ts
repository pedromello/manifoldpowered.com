import { Session, Store, User } from "generated/prisma/client";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

let owner: User;
let ownerSession: Session;
let admin: User;
let adminSession: Session;
let createdStore: Store;

describe("Use case: Store admin membership flow (association, permission change, removal)", () => {
  test("Owner creates a store", async () => {
    owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    ownerSession = await orchestrator.createSession(owner.id);

    const response = await fetch(`${webserver.getOrigin()}/api/v1/stores`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${ownerSession.token}`,
      },
      body: JSON.stringify({ name: "Membership Flow Store" }),
    });

    expect(response.status).toBe(201);
    createdStore = await response.json();
  });

  test("Admin cannot manage the store before being associated", async () => {
    admin = await orchestrator.createUser();
    await orchestrator.activateUser(admin.id);
    adminSession = await orchestrator.createSession(admin.id);

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${adminSession.token}`,
        },
        body: JSON.stringify({ description: "Not allowed yet" }),
      },
    );

    expect(response.status).toBe(403);
  });

  test("Owner associates the admin with manage:store_members permission", async () => {
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/members`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${ownerSession.token}`,
        },
        body: JSON.stringify({
          username: admin.username,
          permissions: ["manage:store_members"],
        }),
      },
    );

    expect(response.status).toBe(201);
    const responseBody = await response.json();
    expect(responseBody.permissions).toEqual(["manage:store_members"]);
  });

  test("Admin can now manage members, but still cannot update the store", async () => {
    const otherUser = await orchestrator.createUser();
    await orchestrator.activateUser(otherUser.id);

    const addMemberResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/members`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${adminSession.token}`,
        },
        body: JSON.stringify({
          username: otherUser.username,
          permissions: ["update:store"],
        }),
      },
    );
    expect(addMemberResponse.status).toBe(201);

    const updateStoreResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${adminSession.token}`,
        },
        body: JSON.stringify({ description: "Still not allowed" }),
      },
    );
    expect(updateStoreResponse.status).toBe(403);
  });

  test("Owner changes the admin's permission to update:store", async () => {
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/members/${admin.username}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${ownerSession.token}`,
        },
        body: JSON.stringify({ permissions: ["update:store"] }),
      },
    );

    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody.permissions).toEqual(["update:store"]);
  });

  test("Admin can now update the store, but no longer manage members", async () => {
    const updateStoreResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${adminSession.token}`,
        },
        body: JSON.stringify({ description: "Now allowed" }),
      },
    );
    expect(updateStoreResponse.status).toBe(200);

    const listMembersResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/members`,
      {
        headers: { Cookie: `session_id=${adminSession.token}` },
      },
    );
    expect(listMembersResponse.status).toBe(403);
  });

  test("Owner removes the admin from the store", async () => {
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/members/${admin.username}`,
      {
        method: "DELETE",
        headers: { Cookie: `session_id=${ownerSession.token}` },
      },
    );

    expect(response.status).toBe(200);
  });

  test("Removed admin can no longer update the store", async () => {
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${adminSession.token}`,
        },
        body: JSON.stringify({ description: "Should fail" }),
      },
    );

    expect(response.status).toBe(403);
  });
});
