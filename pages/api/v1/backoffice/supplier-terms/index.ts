import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import authorization from "models/authorization";
import auditLog from "models/audit_log";
import commercialTerms, {
  supplierTermsSchema,
  supplierTermsQuerySchema,
  SupplierTermsDto,
} from "models/commercial_terms";
import { ValidationError } from "infra/errors";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .get(controller.canRequest("read:supplier_terms:any"), getHandler)
  .put(controller.canRequest("update:supplier_terms:any"), putHandler)
  .handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = supplierTermsQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new ValidationError({
      message: "Invalid query parameters",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const { terms, pagination } =
    await commercialTerms.findAllSupplierTermsPaginated(result.data);

  const secureOutputValues = terms.map((termsItem) =>
    authorization.filterOutput(
      req.context.user,
      "read:supplier_terms:any",
      termsItem,
    ),
  );

  return res.status(200).json({
    supplier_terms: secureOutputValues,
    pagination,
  });
}

// PUT rather than POST: a supplier has one set of terms at a time, so the
// request states what the terms now are rather than adding another row.
// Re-agreeing a rate is ordinary, not a conflict.
async function putHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = supplierTermsSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const termsDto = result.data as SupplierTermsDto;

  const existingTerms = await commercialTerms.findSupplierTerms(
    termsDto.supplier_type,
    termsDto.supplier_id,
  );

  const savedTerms = await commercialTerms.setSupplierTerms(termsDto);

  await auditLog.record({
    admin_user_id: req.context.user.id as string,
    action: "supplier_terms:update",
    target_type: "supplier_terms",
    target_id: savedTerms.id,
    // The cost rate is the platform's entire gross margin, so what it was
    // before is worth keeping.
    metadata: {
      supplier_type: savedTerms.supplier_type,
      supplier_id: savedTerms.supplier_id,
      previous: {
        cost_rate: existingTerms?.cost_rate.toFixed(8) ?? null,
      },
      applied: {
        cost_rate: savedTerms.cost_rate.toFixed(8),
      },
    },
  });

  const secureOutputValues = authorization.filterOutput(
    req.context.user,
    "update:supplier_terms:any",
    savedTerms,
  );

  return res.status(existingTerms ? 200 : 201).json(secureOutputValues);
}
