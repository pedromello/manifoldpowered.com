import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import authorization from "models/authorization";
import ledger from "models/ledger";

// The affiliate's own earnings, and only ever their own.
//
// Scoped to the session user rather than to an outlet, because a commission is
// owed to a person: LedgerEntry.owner_id is a User id, and a payout pays a
// user, not a storefront. An outlet-scoped statement would show an affiliate
// who runs two outlets the same combined figure on both, which is worse than
// showing nothing. Per-outlet attribution of individual sales already lives at
// GET /api/v1/stores/[slug]/sales.
export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:statement"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  // No id is read from the request at all. There is no parameter to tamper
  // with, so one affiliate cannot ask for another's numbers.
  const userTryingToRead = req.context.user;

  const balances = await ledger.statementFor(userTryingToRead.id as string);

  const secureOutputValues = balances.map((balance) =>
    authorization.filterOutput(userTryingToRead, "read:statement", balance),
  );

  return res.status(200).json({
    balances: secureOutputValues,
    hold_days: ledger.COMMISSION_HOLD_DAYS,
  });
}
