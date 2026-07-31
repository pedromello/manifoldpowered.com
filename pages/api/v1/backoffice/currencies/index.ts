import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import currency, {
  currencySchema,
  currencyAdminQuerySchema,
} from "models/currency";
import authorization from "models/authorization";
import auditLog from "models/audit_log";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:currency:any"), getHandler)
  .post(controller.canRequest("create:currency:any"), postHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = currencyAdminQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { currencies, pagination } = await currency.findAllPaginated(
    result.data,
  );

  const secureOutputValues = currencies.map((currencyItem) =>
    authorization.filterOutput(
      req.context.user,
      "read:currency:any",
      currencyItem,
    ),
  );

  return res.status(200).json({
    currencies: secureOutputValues,
    pagination,
  });
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = currencySchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const createdCurrency = await currency.create(result.data);

  await auditLog.record({
    admin_user_id: req.context.user.id as string,
    action: "currency:create",
    target_type: "currency",
    target_id: createdCurrency.id,
    metadata: { code: createdCurrency.code },
  });

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "create:currency:any",
    createdCurrency,
  );

  return res.status(201).json(secureOutputValues);
}
