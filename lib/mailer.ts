import { render } from "@react-email/render";
import nodemailer from "nodemailer";
import { createElement } from "react";
import TransactionalNotificationEmail, {
  type NotificationEmailDetail,
} from "@/lib/emails/transactional-notification-email";
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

type NotificationEmailInput = {
  to: string | string[];
  subject: string;
  previewText: string;
  heading: string;
  greetingName?: string;
  intro: string;
  details?: NotificationEmailDetail[];
  ctaLabel?: string;
  ctaUrl?: string;
  closingText?: string;
};

type AppointmentEmailContext = {
  appointmentId: string;
  startsAt: Date;
  endsAt: Date;
  doctorName: string;
  patientName: string;
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

function getCompanyName() {
  return process.env.APP_NAME ?? "Psychatric";
}

function getAppBaseUrl() {
  return (
    process.env.APP_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  );
}

function toAbsoluteUrl(path: string) {
  const base = getAppBaseUrl().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: process.env.APP_TIMEZONE ?? "Asia/Kathmandu",
  }).format(value);
}

function formatAppointmentWindow(startsAt: Date, endsAt: Date) {
  return `${formatDateTime(startsAt)} to ${formatDateTime(endsAt)}`;
}

function createTransporter() {
  const smtp = getSmtpConfig();
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });
}

async function sendTransactionalNotificationEmail(input: NotificationEmailInput) {
  const smtp = getSmtpConfig();
  const transporter = createTransporter();
  const template = createElement(TransactionalNotificationEmail, {
    ...input,
    company: getCompanyName(),
  });
  const html = await render(template);
  const text = await render(template, { plainText: true });

  await transporter.sendMail({
    from: smtp.from,
    to: Array.isArray(input.to) ? input.to.join(",") : input.to,
    subject: input.subject,
    text,
    html,
  });
}

function getOtpEmailSubject(type: OtpType) {
  if (type === "sign-in") return "Your sign-in verification code";
  if (type === "forget-password") return "Your password reset verification code";
  return "Your email verification code";
}

export async function sendAuthOtpEmail(input: SendAuthOtpEmailInput) {
  const { email, otp, type, expiresInSeconds } = input;
  const smtp = getSmtpConfig();
  const transporter = createTransporter();

  const subject = getOtpEmailSubject(type);
  const minutes = Math.max(1, Math.floor(expiresInSeconds / 60));
  const username = email.split("@")[0] || "there";
  const company = getCompanyName();
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

export async function sendSignupWelcomeEmail(input: {
  email: string;
  name?: string | null;
  role: string;
}) {
  await sendTransactionalNotificationEmail({
    to: input.email,
    subject: "Account created successfully",
    previewText: "Your account has been created.",
    heading: "Welcome to your new account",
    greetingName: input.name?.trim() || input.email.split("@")[0] || "there",
    intro:
      "Your account setup is complete. You can now sign in and start using the platform.",
    details: [
      { label: "Role", value: input.role },
      { label: "Email", value: input.email },
    ],
    ctaLabel: "Open Dashboard",
    ctaUrl: toAbsoluteUrl("/dashboard"),
  });
}

export async function sendLoginAlertEmail(input: {
  email: string;
  name?: string | null;
}) {
  await sendTransactionalNotificationEmail({
    to: input.email,
    subject: "New login detected",
    previewText: "A login to your account was detected.",
    heading: "Login alert",
    greetingName: input.name?.trim() || input.email.split("@")[0] || "there",
    intro: "A login to your account was detected successfully.",
    details: [{ label: "Time", value: formatDateTime(new Date()) }],
    ctaLabel: "Review Dashboard",
    ctaUrl: toAbsoluteUrl("/dashboard"),
    closingText:
      "If this login wasn't you, reset your password immediately and contact your administrator.",
  });
}

export async function sendPasswordResetRequestedEmailToUser(input: {
  email: string;
  name?: string | null;
}) {
  await sendTransactionalNotificationEmail({
    to: input.email,
    subject: "Password reset requested",
    previewText: "We received a request to reset your password.",
    heading: "Password reset request received",
    greetingName: input.name?.trim() || input.email.split("@")[0] || "there",
    intro:
      "We received a password reset request for your account. Use the OTP sent to your email to continue.",
    details: [{ label: "Requested at", value: formatDateTime(new Date()) }],
    ctaLabel: "Open Reset Page",
    ctaUrl: toAbsoluteUrl("/forgot-password"),
  });
}

export async function sendPasswordResetRequestedEmailToDoctor(input: {
  doctorEmail: string;
  doctorName?: string | null;
  patientName: string;
  patientEmail: string;
}) {
  await sendTransactionalNotificationEmail({
    to: input.doctorEmail,
    subject: "Patient password reset requested",
    previewText: "A linked patient has requested password reset.",
    heading: "Patient reset request alert",
    greetingName:
      input.doctorName?.trim() || input.doctorEmail.split("@")[0] || "doctor",
    intro:
      "A patient linked to your doctor tenant requested a password reset. Please review if follow-up is needed.",
    details: [
      { label: "Patient", value: input.patientName },
      { label: "Patient email", value: input.patientEmail },
      { label: "Requested at", value: formatDateTime(new Date()) },
    ],
    ctaLabel: "Open Bookings",
    ctaUrl: toAbsoluteUrl("/dashboard/doctor/bookings"),
  });
}

export async function sendPasswordResetSuccessfulEmail(input: {
  email: string;
  name?: string | null;
}) {
  await sendTransactionalNotificationEmail({
    to: input.email,
    subject: "Password changed successfully",
    previewText: "Your password has been updated.",
    heading: "Password updated",
    greetingName: input.name?.trim() || input.email.split("@")[0] || "there",
    intro: "Your account password was changed successfully.",
    details: [{ label: "Updated at", value: formatDateTime(new Date()) }],
    ctaLabel: "Sign in",
    ctaUrl: toAbsoluteUrl("/login"),
    closingText:
      "If you did not change your password, contact support immediately and secure your account.",
  });
}

export async function sendAppointmentBookedToPatientEmail(
  input: AppointmentEmailContext & {
    patientEmail: string;
  },
) {
  await sendTransactionalNotificationEmail({
    to: input.patientEmail,
    subject: "Appointment booked successfully",
    previewText: "Your appointment has been booked.",
    heading: "Appointment booked",
    greetingName: input.patientName,
    intro: "Your appointment is booked successfully.",
    details: [
      { label: "Session", value: input.appointmentId },
      { label: "Doctor", value: input.doctorName },
      {
        label: "Time",
        value: formatAppointmentWindow(input.startsAt, input.endsAt),
      },
    ],
    ctaLabel: "Open Session",
    ctaUrl: toAbsoluteUrl(`/dashboard/patient/schedule/${input.appointmentId}`),
  });
}

export async function sendAppointmentBookedToDoctorEmail(
  input: AppointmentEmailContext & {
    doctorEmail: string;
  },
) {
  await sendTransactionalNotificationEmail({
    to: input.doctorEmail,
    subject: "New appointment booked",
    previewText: "A patient booked a session.",
    heading: "New booking received",
    greetingName: input.doctorName,
    intro: "A new patient session has been booked in your schedule.",
    details: [
      { label: "Session", value: input.appointmentId },
      { label: "Patient", value: input.patientName },
      {
        label: "Time",
        value: formatAppointmentWindow(input.startsAt, input.endsAt),
      },
    ],
    ctaLabel: "Open Session",
    ctaUrl: toAbsoluteUrl(`/dashboard/doctor/bookings/${input.appointmentId}`),
  });
}

export async function sendAppointmentBookedToStaffEmail(
  input: AppointmentEmailContext & {
    staffEmail: string;
    staffName?: string;
  },
) {
  await sendTransactionalNotificationEmail({
    to: input.staffEmail,
    subject: "New appointment in doctor schedule",
    previewText: "A new patient appointment was booked.",
    heading: "New appointment booked",
    greetingName: input.staffName || input.staffEmail.split("@")[0] || "staff",
    intro: "A new appointment has been booked under your doctor tenant.",
    details: [
      { label: "Session", value: input.appointmentId },
      { label: "Doctor", value: input.doctorName },
      { label: "Patient", value: input.patientName },
      {
        label: "Time",
        value: formatAppointmentWindow(input.startsAt, input.endsAt),
      },
    ],
    ctaLabel: "Open Sessions",
    ctaUrl: toAbsoluteUrl("/dashboard/doctor/bookings"),
  });
}

export async function sendAppointmentConfirmedEmailToPatient(
  input: AppointmentEmailContext & {
    patientEmail: string;
  },
) {
  await sendTransactionalNotificationEmail({
    to: input.patientEmail,
    subject: "Appointment confirmed",
    previewText: "Your appointment status is now confirmed.",
    heading: "Appointment confirmed",
    greetingName: input.patientName,
    intro: "Your doctor has confirmed your appointment.",
    details: [
      { label: "Session", value: input.appointmentId },
      { label: "Doctor", value: input.doctorName },
      {
        label: "Time",
        value: formatAppointmentWindow(input.startsAt, input.endsAt),
      },
    ],
    ctaLabel: "View Session",
    ctaUrl: toAbsoluteUrl(`/dashboard/patient/schedule/${input.appointmentId}`),
  });
}

export async function sendReportUploadedEmailToPatient(input: {
  patientEmail: string;
  patientName: string;
  doctorName: string;
  reportTitle: string;
  appointmentId?: string | null;
}) {
  const sessionValue = input.appointmentId ?? "Not linked to a session";
  const ctaUrl = input.appointmentId
    ? toAbsoluteUrl(`/dashboard/patient/schedule/${input.appointmentId}`)
    : toAbsoluteUrl("/dashboard/patient/schedule");

  await sendTransactionalNotificationEmail({
    to: input.patientEmail,
    subject: "New report uploaded",
    previewText: "Your doctor uploaded a new report.",
    heading: "Session report uploaded",
    greetingName: input.patientName,
    intro: "A new report has been uploaded to your session.",
    details: [
      { label: "Report", value: input.reportTitle },
      { label: "Doctor", value: input.doctorName },
      { label: "Session", value: sessionValue },
    ],
    ctaLabel: "Open Session",
    ctaUrl,
  });
}

export async function sendReportShareRequestEmailToDoctor(input: {
  targetDoctorEmail: string;
  targetDoctorName?: string | null;
  fromDoctorName: string;
  documentTitle: string;
}) {
  await sendTransactionalNotificationEmail({
    to: input.targetDoctorEmail,
    subject: "Report share request received",
    previewText: "A doctor requested to share a report with you.",
    heading: "Incoming report share request",
    greetingName:
      input.targetDoctorName?.trim() ||
      input.targetDoctorEmail.split("@")[0] ||
      "doctor",
    intro: "You have received a new report share request.",
    details: [
      { label: "From doctor", value: input.fromDoctorName },
      { label: "Report", value: input.documentTitle },
    ],
    ctaLabel: "Open Shares",
    ctaUrl: toAbsoluteUrl("/dashboard/doctor/bookings"),
  });
}

export async function sendStaffAccountCreatedEmailToStaff(input: {
  staffEmail: string;
  staffName: string;
  doctorName: string;
  temporaryPassword: string;
  staffRole: string;
}) {
  await sendTransactionalNotificationEmail({
    to: input.staffEmail,
    subject: "Your staff account is ready",
    previewText: "A doctor created your staff account.",
    heading: "Staff account created",
    greetingName: input.staffName,
    intro:
      "Your staff account has been created. Please sign in and complete onboarding by updating your password.",
    details: [
      { label: "Doctor", value: input.doctorName },
      { label: "Role", value: input.staffRole },
      { label: "Temporary password", value: input.temporaryPassword },
      { label: "Email", value: input.staffEmail },
    ],
    ctaLabel: "Sign in",
    ctaUrl: toAbsoluteUrl("/login"),
    closingText:
      "For security, change your password immediately after first login.",
  });
}

export async function sendStaffAccountCreatedEmailToDoctor(input: {
  doctorEmail: string;
  doctorName: string;
  staffName: string;
  staffEmail: string;
  staffRole: string;
}) {
  await sendTransactionalNotificationEmail({
    to: input.doctorEmail,
    subject: "Staff account created",
    previewText: "A new staff account has been created and linked.",
    heading: "Staff account created",
    greetingName: input.doctorName,
    intro: "A staff account was created and linked to your doctor tenant.",
    details: [
      { label: "Staff", value: input.staffName },
      { label: "Email", value: input.staffEmail },
      { label: "Role", value: input.staffRole },
    ],
    ctaLabel: "Manage Staff",
    ctaUrl: toAbsoluteUrl("/dashboard/doctor/staff"),
  });
}

export async function sendMailSafely(
  actionLabel: string,
  fn: () => Promise<void>,
) {
  try {
    await fn();
  } catch (error) {
    console.error(`[mailer] ${actionLabel} failed`, error);
  }
}
