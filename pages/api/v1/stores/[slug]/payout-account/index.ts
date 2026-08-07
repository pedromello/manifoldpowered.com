import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import store from "models/store";
import authorization from "models/authorization";
import payoutAccount, {
  payoutAccountSchema,
  payoutAccountUpdateSchema,
} from "models/payout_account";
import { ForbiddenError, ValidationError } from "infra/errors";

// Where one outlet's money goes.
//
// Scoped to the outlet rather than to whoever owns it, for the same reason the
// statement is: the outlet is the payee, so payment details survive it changing
// hands. Nothing here can set payouts_enabled — that is the platform's call and
// lives in the backoffice.
export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:payout_account"), getHandler)
  .post(controller.canRequest("manage:payout_account"), postHandler)
  .patch(controller.canRequest("manage:payout_account"), patchHandler)
  .handler(controller.errorHandlers);

// canRequest only established that this user holds the feature at all. The slug
// is caller-supplied, so this check is what stops one outlet's operator reading
// or rewriting another's payout details.
//
// findOneBySlugWithMembers, not findOneBySlug: the payout branch of can()
// decides on the members array, so without it a permitted member would be
// refused their own outlet's account.
async function authorizeStore(
  req: NextApiRequest,
  feature: string,
  message: string,
) {
  const foundStore = await store.findOneBySlugWithMembers(
    req.query.slug as string,
  );

  if (!authorization.can(req.context.user, feature, foundStore)) {
    throw new ForbiddenError({
      message,
      action: "Verify if you are an administrator of this store",
    });
  }

  return foundStore;
}

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const foundStore = await authorizeStore(
    req,
    "read:payout_account",
    "You do not have permission to view this store's payout account",
  );

  const account = await payoutAccount.findOneByStoreId(foundStore.id);

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "read:payout_account",
    account,
  );

  return res.status(200).json(secureOutputValues);
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = payoutAccountSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const foundStore = await authorizeStore(
    req,
    "manage:payout_account",
    "You do not have permission to manage this store's payout account",
  );

  const createdAccount = await payoutAccount.create(foundStore.id, result.data);

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "manage:payout_account",
    createdAccount,
  );

  return res.status(201).json(secureOutputValues);
}

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = payoutAccountUpdateSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const foundStore = await authorizeStore(
    req,
    "manage:payout_account",
    "You do not have permission to manage this store's payout account",
  );

  const updatedAccount = await payoutAccount.update(foundStore.id, result.data);

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "manage:payout_account",
    updatedAccount,
  );

  return res.status(200).json(secureOutputValues);
}
