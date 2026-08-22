import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowRight, AtSign, Check, Loader2, User } from "lucide-react";

import AuthLayout from "components/AuthLayout";

const USERNAME_PATTERN = /^[A-Za-z0-9]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/v1/user")
      .then((response) => {
        if (!isMounted) return;
        if (response.ok) {
          router.replace("/store");
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

  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!USERNAME_PATTERN.test(trimmedUsername)) {
      setErrorMessage(
        "Username must be 3 to 30 alphanumeric characters with no spaces.",
      );
      return;
    }

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setErrorMessage("Enter a valid email address.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: trimmedUsername,
          email: trimmedEmail,
          password: null,
        }),
      });

      if (!response.ok) {
        const responseBody = await response.json().catch(() => null);
        throw new Error(
          responseBody?.message || "Could not request early access.",
        );
      }

      setUsername("");
      setEmail("");
      setSuccessMessage(
        "We sent you an activation email. Please activate your account within 24 hours.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not request early access.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isCheckingSession) {
    return (
      <AuthLayout
        title="Create Account | Manifold"
        description="Create your Manifold account."
      >
        <div
          className="flex min-h-72 items-center justify-center"
          role="status"
        >
          <Loader2 className="animate-spin text-white/40" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create Account | Manifold"
      description="Create your Manifold account."
    >
      {successMessage ? (
        <div className="flex flex-col gap-5" role="status">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300">
            <Check size={22} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              Account requested
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.025em]">
              Check your inbox
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/50">
              {successMessage}
            </p>
          </div>
          <Link
            href="/store"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-5 text-sm font-bold hover:from-fuchsia-500 hover:to-violet-500"
          >
            Browse games while you wait
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/onboarding"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 text-sm font-semibold text-white/55 hover:border-white/20 hover:text-white"
          >
            See what you can build
          </Link>
        </div>
      ) : (
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">
              Early access
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.025em]">
              Create your account
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/45">
              Choose your identity on Manifold. We will email you an activation
              link.
            </p>
          </div>

          <label className="flex flex-col gap-2 text-sm font-semibold text-white/70">
            Username
            <div className="relative">
              <User
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"
              />
              <input
                autoComplete="username"
                maxLength={30}
                minLength={3}
                pattern="[A-Za-z0-9]{3,30}"
                required
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-11 w-full rounded-lg border border-white/10 bg-white/[0.035] pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20"
                placeholder="yourname"
              />
            </div>
            <span className="text-xs font-normal text-white/35">
              3–30 letters or numbers. No spaces.
            </span>
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-white/70">
            Email
            <div className="relative">
              <AtSign
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"
              />
              <input
                autoComplete="email"
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-lg border border-white/10 bg-white/[0.035] pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20"
                placeholder="you@example.com"
              />
            </div>
          </label>

          {errorMessage && (
            <p
              className="rounded-lg border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-sm text-rose-200"
              role="alert"
            >
              {errorMessage}
            </p>
          )}

          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-5 text-sm font-bold hover:from-fuchsia-500 hover:to-violet-500 disabled:cursor-progress disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ArrowRight size={16} />
            )}
            {isSubmitting ? "Sending..." : "Request early access"}
          </button>

          <p className="border-t border-white/[0.08] pt-5 text-center text-sm text-white/40">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-bold text-violet-300 hover:text-violet-200"
            >
              Log in
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
