import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store from "models/store";
import authorization from "models/authorization";
import ledger from "models/ledger";
import { ForbiddenError } from "infra/errors";

// What one outlet has earned.
//
// Scoped to the outlet rather than to whoever owns it, because the outlet is
// the payee: it holds the balance and the payout account, and a payment goes to
// the account registered against it. An owner-scoped statement would show
// someone running two outlets a single combined figure matching neither of the
// two payments they are about to receive.
export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:store_statement"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { slug } = req.query;

  const userTryingToRead = req.context.user;

  // findOneBySlugWithMembers, not findOneBySlug: the store branch of can()
  // decides on the members array, so without it a permitted member would be
  // refused their own outlet's numbers.
  const foundStore = await store.findOneBySlugWithMembers(slug as string);

  // canRequest only established that this user holds the feature at all. The
  // slug is caller-supplied, so this check is what stops one outlet's operator
  // reading another's earnings.
  if (
    !authorization.can(userTryingToRead, "read:store_statement", foundStore)
  ) {
    throw new ForbiddenError({
      message: "You do not have permission to view this store's statement",
      action: "Verify if you are an administrator of this store",
    });
  }

  const balances = await ledger.statementFor("STORE", foundStore.id);

  const secureOutputValues = balances.map((balance) =>
    authorization.filterOutput(
      userTryingToRead,
      "read:store_statement",
      balance,
    ),
  );

  return res.status(200).json({
    balances: secureOutputValues,
    hold_days: ledger.COMMISSION_HOLD_DAYS,
  });
}
