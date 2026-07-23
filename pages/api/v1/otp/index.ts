import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import otp from "models/otp";
import user from "models/user";
import { ValidationError } from "infra/errors";
import { z } from "zod";

const requestOtpSchema = z.object({
  login: z.string().trim().min(1),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("create:otp"), postHandler)
  .handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = requestOtpSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const userRequestingCode = await user.findOneByLogin(result.data.login);

  const { code } = await otp.create(userRequestingCode.id);
  await otp.sendEmailToUser(userRequestingCode, code);

  return res.status(201).json({ message: "OTP code sent to your email" });
}
