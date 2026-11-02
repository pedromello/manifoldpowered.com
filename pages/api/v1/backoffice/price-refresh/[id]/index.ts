import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import { prisma } from "infra/database";
import { ValidationError } from "infra/errors";
import { runSummary } from "models/price_refresh";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .use((_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    return next();
  })
  .get(controller.canRequest("read:game:any"), async (req, res) => {
    const input = z
      .object({ id: z.uuid(), page: z.coerce.number().int().min(1).default(1) })
      .safeParse(req.query);
    if (!input.success)
      throw new ValidationError({ message: "Invalid price report request" });
    const run = await runSummary(input.data.id);
    const items = await prisma.priceRefreshItem.findMany({
      where: { run_id: run.id },
      orderBy: [
        { title: "asc" },
        { provider: "asc" },
        { country: "asc" },
        { id: "asc" },
      ],
      skip: (input.data.page - 1) * 50,
      take: 50,
      select: {
        id: true,
        game_id: true,
        title: true,
        provider: true,
        country: true,
        status: true,
        attempts: true,
        before: true,
        after: true,
        error_code: true,
        checked_at: true,
      },
    });
    return res.status(200).json({
      run,
      items,
      page: input.data.page,
      pages: Math.max(1, Math.ceil(run.total / 50)),
    });
  })
  .handler(controller.errorHandlers);
