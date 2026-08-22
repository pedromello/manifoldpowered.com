import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { ArrowRight, Loader2, Mail } from "lucide-react";

import AuthLayout from "components/AuthLayout";

type Step = "login" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("login");
  const [login, setLogin] = useState("");
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/v1/user")
      .then((response) => {
        if (!isMounted) return;

        if (response.ok) {
          const callbackUrl = router.query.callbackUrl;
          router.replace(
            typeof callbackUrl === "string" ? callbackUrl : "/store",
          );
          return;
        }

        setIsCheckingSession(false);
      })
      .catch(() => {
        if (isMounted) setIsCheckingSession(false);
      });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRequestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/v1/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: login.trim() }),
      });

      if (!response.ok) {
        const responseBody = await response.json().catch(() => null);
        throw new Error(
          responseBody?.message || "Could not send the login code.",
        );
      }

      setStep("code");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not send the login code.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/v1/otp/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: login.trim(), code: code.trim() }),
      });

      if (!response.ok) {
        const responseBody = await response.json().catch(() => null);
        throw new Error(
          responseBody?.message || "Invalid code. Please try again.",
        );
      }

      const callbackUrl = router.query.callbackUrl;
      router.push(typeof callbackUrl === "string" ? callbackUrl : "/store");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Invalid code. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleUseDifferentAccount() {
    setStep("login");
    setCode("");
    setErrorMessage("");
  }

  if (isCheckingSession) {
    return (
      <AuthLayout title="Login | Manifold" description="Log in to Manifold.">
        <div
          className="flex min-h-64 items-center justify-center"
          role="status"
        >
          <Loader2 className="animate-spin text-white/40" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Login | Manifold" description="Log in to Manifold.">
      <form
        className="flex flex-col gap-5"
        onSubmit={step === "login" ? handleRequestCode : handleVerifyCode}
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">
            {step === "login" ? "Welcome back" : "Check your inbox"}
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.025em]">
            {step === "login" ? "Log in to Manifold" : "Enter your code"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/45">
            {step === "login"
              ? "No password needed. We will email you a one-time code."
              : `We sent a six-digit code for ${login}.`}
          </p>
        </div>

        {step === "login" ? (
          <label className="flex flex-col gap-2 text-sm font-semibold text-white/70">
            Username or email
            <div className="relative">
              <Mail
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"
              />
              <input
                autoComplete="username"
                required
                type="text"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                className="h-11 w-full rounded-lg border border-white/10 bg-white/[0.035] pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20"
                placeholder="you@example.com"
              />
            </div>
          </label>
        ) : (
          <label className="flex flex-col gap-2 text-sm font-semibold text-white/70">
            Six-digit code
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              minLength={6}
              pattern="[0-9]{6}"
              required
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="h-12 w-full rounded-lg border border-white/10 bg-white/[0.035] px-4 text-center text-xl font-bold tracking-[0.35em] text-white outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20"
              placeholder="000000"
            />
          </label>
        )}

        {errorMessage && (
          <p
            className="rounded-lg border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-sm text-rose-200"
            role="alert"
          >
            {errorMessage}
          </p>
        )}

        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-5 text-sm font-bold transition-colors hover:from-fuchsia-500 hover:to-violet-500 disabled:cursor-progress disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          {isSubmitting
            ? step === "login"
              ? "Sending code..."
              : "Verifying..."
            : step === "login"
              ? "Send login code"
              : "Log in"}
          {!isSubmitting && <ArrowRight size={16} />}
        </button>

        {step === "code" && (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleUseDifferentAccount}
            className="h-10 rounded-lg border border-white/10 text-sm font-semibold text-white/55 hover:border-white/20 hover:text-white"
          >
            Use a different account
          </button>
        )}

        <p className="border-t border-white/[0.08] pt-5 text-center text-sm text-white/40">
          New to Manifold?{" "}
          <Link
            href="/signup"
            className="font-bold text-violet-300 hover:text-violet-200"
          >
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
