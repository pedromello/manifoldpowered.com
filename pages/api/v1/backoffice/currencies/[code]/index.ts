import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import currency, { currencyUpdateSchema } from "models/currency";
import authorization from "models/authorization";
import auditLog from "models/audit_log";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:currency:any"), getHandler)
  .patch(controller.canRequest("update:currency:any"), patchHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { code } = req.query;

  const foundCurrency = await currency.findOneByCode(code as string);

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "read:currency:any",
    foundCurrency,
  );

  return res.status(200).json(secureOutputValues);
}

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = currencyUpdateSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { code } = req.query;

  // findOneByCode throws NotFoundError, so an unknown code never reaches the
  // update or the audit log.
  const existingCurrency = await currency.findOneByCode(code as string);

  const updatedCurrency = await currency.update(
    existingCurrency.code,
    result.data,
  );

  await auditLog.record({
    admin_user_id: req.context.user.id as string,
    action: "currency:update",
    target_type: "currency",
    target_id: existingCurrency.id,
    // Disabling a currency hides every product priced in it, so the previous
    // state is worth keeping for the same reason user:disable snapshots it.
    metadata: {
      code: existingCurrency.code,
      previous: {
        symbol: existingCurrency.symbol,
        decimal_places: existingCurrency.decimal_places,
        enabled: existingCurrency.enabled,
      },
      applied: result.data,
    },
  });

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "update:currency:any",
    updatedCurrency,
  );

  return res.status(200).json(secureOutputValues);
}
