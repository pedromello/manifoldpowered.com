import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import authorization from "models/authorization";
import type { ExternalRefreshInfo } from "lib/external_refresh";

interface ExternalImportResult<Game> {
  game: Game | null;
  created: boolean;
  refresh: ExternalRefreshInfo | null;
}

interface ExternalImportActor {
  userId: string;
  isAdmin: boolean;
}

export interface ExternalImportControllerAdapter<
  Input,
  StatusReference,
  Game extends { status: string },
> {
  permission: string;
  parseInput(value: unknown): Input;
  parseStatus(query: NextApiRequest["query"]): StatusReference;
  importGame(
    input: Input,
    actor: ExternalImportActor,
  ): Promise<ExternalImportResult<Game>>;
  status(reference: StatusReference): Promise<ExternalImportResult<Game>>;
  present(game: Game, req: NextApiRequest): object | Promise<object>;
}

export function createExternalImportController<
  Input,
  StatusReference,
  Game extends { status: string },
>(adapter: ExternalImportControllerAdapter<Input, StatusReference, Game>) {
  async function postHandler(req: NextApiRequest, res: NextApiResponse) {
    const input = adapter.parseInput(req.body);
    const result = await adapter
      .importGame(input, {
        userId: req.context.user.id!,
        isAdmin: authorization.can(req.context.user, "read:game:any"),
      })
      .catch((error: unknown) => {
        const retry = z
          .object({ context: z.object({ retry_after: z.number() }) })
          .safeParse(error);
        if (retry.success)
          res.setHeader("Retry-After", retry.data.context.retry_after);
        throw error;
      });
    return respond(req, res, result);
  }

  async function getHandler(req: NextApiRequest, res: NextApiResponse) {
    const reference = adapter.parseStatus(req.query);
    return respond(req, res, await adapter.status(reference), true);
  }

  async function respond(
    req: NextApiRequest,
    res: NextApiResponse,
    result: ExternalImportResult<Game>,
    polling = false,
  ) {
    res.setHeader("Cache-Control", "private, no-store");
    if (result.refresh?.state === "in_progress")
      res.setHeader("Retry-After", "2");
    if (!result.game)
      return res
        .status(!polling && result.refresh?.state === "in_progress" ? 202 : 200)
        .json({ refresh: result.refresh });
    if (!["ACTIVE", "ONLY_DISPLAY"].includes(result.game.status))
      return res
        .status(200)
        .json({ message: "This game is currently hidden from the catalog." });

    const game = await adapter.present(result.game, req);
    return res.status(result.created ? 201 : 200).json({
      ...game,
      refresh: result.refresh,
    });
  }

  return createRouter<NextApiRequest, NextApiResponse>()
    .use(controller.injectAnonymousOrUser)
    .post(controller.canRequest(adapter.permission), postHandler)
    .get(controller.canRequest(adapter.permission), getHandler)
    .handler(controller.errorHandlers);
}
