"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useState } from "react";
import {
  requestPasswordResetOtp,
  resetPasswordWithOtp,
} from "@/lib/actions/auth-actions";

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const [step, setStep] = useState<"request" | "reset" | "done">("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setNotice("");

    try {
      await requestPasswordResetOtp(email);
      setStep("reset");
      setNotice("A reset code was sent to your email.");
    } catch (err) {
      setError(
        `Could not send reset code: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otp.trim()) {
      setError("Enter the reset code.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    setError("");
    setNotice("");

    try {
      await resetPasswordWithOtp(email, otp.trim(), password);
      setStep("done");
      setNotice("Your password has been reset. You can now log in.");
    } catch (err) {
      setError(
        `Could not reset password: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const resendCode = async () => {
    setIsLoading(true);
    setError("");
    setNotice("");

    try {
      await requestPasswordResetOtp(email);
      setNotice("A new reset code has been sent.");
    } catch (err) {
      setError(
        `Could not resend code: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      {...props}
      onSubmit={step === "request" ? handleRequestOtp : handleResetPassword}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="text-muted-foreground text-sm text-balance">
            {step === "request"
              ? "Enter your email and we will send you a reset code."
              : step === "reset"
                ? `Enter the code sent to ${email}`
                : "Password reset complete."}
          </p>
        </div>

        {error && (
          <p className="text-destructive text-sm text-center">{error}</p>
        )}
        {notice && <p className="text-sm text-center text-emerald-600">{notice}</p>}

        {step === "request" && (
          <>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </Field>
            <Field>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Sending code..." : "Send Reset Code"}
              </Button>
            </Field>
          </>
        )}

        {step === "reset" && (
          <>
            <Field>
              <FieldLabel htmlFor="otp">Reset Code</FieldLabel>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter code"
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                disabled={isLoading}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-password">New Password</FieldLabel>
              <Input
                id="new-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
              <FieldDescription>Must be at least 8 characters long.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-new-password">Confirm Password</FieldLabel>
              <Input
                id="confirm-new-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
              />
            </Field>
            <Field>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Resetting password..." : "Reset Password"}
              </Button>
            </Field>
            <Field>
              <Button
                type="button"
                variant="outline"
                disabled={isLoading}
                onClick={resendCode}
              >
                Resend Code
              </Button>
            </Field>
            <FieldDescription className="text-center">
              Wrong email?{" "}
              <button
                type="button"
                className="underline underline-offset-4"
                disabled={isLoading}
                onClick={() => {
                  setStep("request");
                  setOtp("");
                  setPassword("");
                  setConfirmPassword("");
                  setError("");
                  setNotice("");
                }}
              >
                Change email
              </button>
            </FieldDescription>
          </>
        )}

        {step === "done" && (
          <Field>
            <Button asChild>
              <Link href="/login">Back to login</Link>
            </Button>
          </Field>
        )}

        <FieldDescription className="text-center">
          Remember your password?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Sign in
          </Link>
        </FieldDescription>
      </FieldGroup>
    </form>
  );
}
