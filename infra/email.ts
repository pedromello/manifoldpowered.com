import nodemailer from "nodemailer";
import { ServiceError } from "./errors";

export interface MailOptions {
  from?: string;
  to: string;
  subject: string;
  text: string;
}

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SMTP_HOST,
  port: Number(process.env.EMAIL_SMTP_PORT),
  auth: {
    user: process.env.EMAIL_SMTP_USER,
    pass: process.env.EMAIL_SMTP_PASSWORD,
  },
  secure: process.env.NODE_ENV === "production" ? true : false,
});

async function send(mailOptions: MailOptions) {
  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw new ServiceError({
      cause: error,
      message: "Could not send email",
      action: "Check if email service is available",
      context: mailOptions,
    });
  }
}

const email = {
  send,
};

export default email;
