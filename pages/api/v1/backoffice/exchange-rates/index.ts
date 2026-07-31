import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import exchangeRate, {
  exchangeRateSchema,
  exchangeRateAdminQuerySchema,
} from "models/exchange_rate";
import authorization from "models/authorization";
import auditLog from "models/audit_log";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:exchange_rate:any"), getHandler)
  .post(controller.canRequest("create:exchange_rate:any"), postHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = exchangeRateAdminQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { rates, pagination } = await exchangeRate.findAllPaginated(
    result.data,
  );

  const secureOutputValues = rates.map((rateItem) =>
    authorization.filterOutput(
      req.context.user,
      "read:exchange_rate:any",
      rateItem,
    ),
  );

  return res.status(200).json({
    exchange_rates: secureOutputValues,
    pagination,
  });
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = exchangeRateSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  // Rates are append-only, so this always writes a new row rather than
  // replacing the current one. That is what keeps past conversions
  // reproducible from the rate that was effective at the time.
  const recordedRate = await exchangeRate.record(result.data);

  await auditLog.record({
    admin_user_id: req.context.user.id as string,
    action: "exchange_rate:create",
    target_type: "exchange_rate",
    target_id: recordedRate.id,
    metadata: {
      base_currency: recordedRate.base_currency,
      quote_currency: recordedRate.quote_currency,
      rate: recordedRate.rate.toFixed(8),
      source: recordedRate.source,
      effective_at: recordedRate.effective_at.toISOString(),
    },
  });

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "create:exchange_rate:any",
    recordedRate,
  );

  return res.status(201).json(secureOutputValues);
}
