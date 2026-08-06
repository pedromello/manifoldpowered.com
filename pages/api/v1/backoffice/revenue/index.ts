import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import ledger from "models/ledger";
import authorization from "models/authorization";
import { ValidationError } from "infra/errors";

// Both bounds optional and independent: an admin asking "everything so far"
// passes neither, and "since the first of the month" passes only `from`.
//
// z.coerce.date() rather than a string plus a manual parse, so "not a date" is
// a ValidationError with the field named rather than an Invalid Date silently
// widening the query to the whole book.
const revenueQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((range) => !range.from || !range.to || range.from <= range.to, {
    message: "The start of the range must not be after its end",
    path: ["from"],
  });

// The platform's own income statement.
//
// Every other ledger read is scoped to a payee and answers "what am I owed".
// This one is deliberately unscoped and admin-only: there is no narrower
// version of it to grant, since the numbers are the whole book rather than any
// one party's share of it.
export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:platform_ledger:any"), getHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = revenueQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  // No resource check to repeat here, unlike the outlet and studio endpoints:
  // the feature is :any-only, so holding it is the whole authorisation.
  const userTryingToRead = req.context.user;

  const totals = await ledger.platformTotals({
    from: result.data.from,
    to: result.data.to,
  });

  const secureOutputValues = totals.map((currencyTotals) =>
    authorization.filterOutput(
      userTryingToRead,
      "read:platform_ledger:any",
      currencyTotals,
    ),
  );

  return res.status(200).json({
    revenue: secureOutputValues,
  });
}
