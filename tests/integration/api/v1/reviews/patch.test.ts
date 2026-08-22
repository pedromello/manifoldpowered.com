import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { prisma } from "infra/database";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("PATCH /api/v1/reviews", () => {
  test("Anonymous user should return 403", async () => {
    const response = await fetch(`${webserver.getOrigin()}/api/v1/reviews`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "some-game",
        message: "Updated review",
        recommended: true,
      }),
    });

    expect(response.status).toBe(403);
  });

  test("Owner can update the message and recommendation", async () => {
    const user = await orchestrator.createUser();
    await orchestrator.activateUser(user.id);
    const session = await orchestrator.createSession(user.id);
    const game = await orchestrator.createGame(user.id);
    await prisma.game.update({
      where: { id: game.id },
      data: {
        status: "ACTIVE",
        positive_reviews: 1,
        negative_reviews: 0,
        review_score: "POSITIVE",
      },
    });
    await orchestrator.addToLibrary(user.id, game.id);
    await prisma.review.create({
      data: {
        user_id: user.id,
        game_id: game.id,
        message: "It was good.",
        recommended: true,
      },
    });

    const response = await fetch(`${webserver.getOrigin()}/api/v1/reviews`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${session.token}`,
      },
      body: JSON.stringify({
        slug: game.slug,
        message: "I changed my mind.",
        recommended: false,
      }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).message).toBe("Review updated successfully");

    const updatedReview = await prisma.review.findUnique({
      where: { user_id_game_id: { user_id: user.id, game_id: game.id } },
    });
    const updatedGame = await prisma.game.findUnique({
      where: { id: game.id },
    });

    expect(updatedReview?.message).toBe("I changed my mind.");
    expect(updatedReview?.recommended).toBe(false);
    expect(updatedGame?.positive_reviews).toBe(0);
    expect(updatedGame?.negative_reviews).toBe(1);
    expect(updatedGame?.review_score).toBe("NEGATIVE");
  });

  test("Updating text without changing recommendation keeps counters stable", async () => {
    const user = await orchestrator.createUser();
    await orchestrator.activateUser(user.id);
    const session = await orchestrator.createSession(user.id);
    const game = await orchestrator.createGame(user.id);
    await prisma.game.update({
      where: { id: game.id },
      data: {
        status: "ACTIVE",
        positive_reviews: 1,
        review_score: "POSITIVE",
      },
    });
    await orchestrator.addToLibrary(user.id, game.id);
    await prisma.review.create({
      data: {
        user_id: user.id,
        game_id: game.id,
        message: "Original",
        recommended: true,
      },
    });

    const response = await fetch(`${webserver.getOrigin()}/api/v1/reviews`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${session.token}`,
      },
      body: JSON.stringify({
        slug: game.slug,
        message: "Edited text only",
        recommended: true,
      }),
    });

    expect(response.status).toBe(200);
    const updatedGame = await prisma.game.findUnique({
      where: { id: game.id },
    });
    expect(updatedGame?.positive_reviews).toBe(1);
    expect(updatedGame?.negative_reviews).toBe(0);
  });

  test("Non-owner cannot update a review", async () => {
    const gameCreator = await orchestrator.createUser();
    const reviewer = await orchestrator.createUser();
    await orchestrator.activateUser(reviewer.id);
    const session = await orchestrator.createSession(reviewer.id);
    const game = await orchestrator.createGame(gameCreator.id);
    await prisma.game.update({
      where: { id: game.id },
      data: { status: "ACTIVE" },
    });
    await prisma.review.create({
      data: {
        user_id: reviewer.id,
        game_id: game.id,
        message: "Legacy review without entitlement",
        recommended: true,
      },
    });

    const response = await fetch(`${webserver.getOrigin()}/api/v1/reviews`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${session.token}`,
      },
      body: JSON.stringify({
        slug: game.slug,
        message: "Trying to update",
        recommended: false,
      }),
    });

    expect(response.status).toBe(403);
  });
});
