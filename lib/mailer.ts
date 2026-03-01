import { render } from "@react-email/render";
import nodemailer from "nodemailer";
import { createElement } from "react";
import VerificationOtpEmail, {
  type OtpType,
} from "@/lib/emails/verification-otp-email";

type SendAuthOtpEmailInput = {
  email: string;
  otp: string;
  type: OtpType;
  expiresInSeconds: number;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSmtpConfig(): SmtpConfig {
  const host = getRequiredEnv("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure = String(process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
  const user = getRequiredEnv("SMTP_USER");
  const pass = getRequiredEnv("SMTP_PASS");
  const from = getRequiredEnv("SMTP_FROM");

  if (!Number.isFinite(port)) {
    throw new Error("Invalid SMTP_PORT value");
  }

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
  };
}

function getOtpEmailSubject(type: OtpType) {
  if (type === "sign-in") return "Your sign-in verification code";
  if (type === "forget-password") return "Your password reset verification code";
  return "Your email verification code";
}

export async function sendAuthOtpEmail(input: SendAuthOtpEmailInput) {
  const { email, otp, type, expiresInSeconds } = input;
  const smtp = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  const subject = getOtpEmailSubject(type);
  const minutes = Math.max(1, Math.floor(expiresInSeconds / 60));
  const username = email.split("@")[0] || "there";
  const company = process.env.APP_NAME ?? "Psychatric";
  const template = createElement(VerificationOtpEmail, {
    username,
    company,
    otp,
    type,
    expiresInMinutes: minutes,
  });
  const html = await render(template);
  const text = await render(template, { plainText: true });

  await transporter.sendMail({
    from: smtp.from,
    to: email,
    subject,
    text,
    html,
  });
}
