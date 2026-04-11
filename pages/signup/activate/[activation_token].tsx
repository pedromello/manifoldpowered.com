import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import AuthLayout from "../../../components/AuthLayout";

type ActivationState = "loading" | "success" | "error";

export default function ActivateSignup() {
  const router = useRouter();
  const { activation_token: activationToken } = router.query;
  const [activationState, setActivationState] =
    useState<ActivationState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!router.isReady || typeof activationToken !== "string") {
      return;
    }

    async function activateAccount() {
      setActivationState("loading");
      setErrorMessage("");

      try {
        const response = await fetch(`/api/v1/activations/${activationToken}`, {
          method: "PATCH",
        });

        if (!response.ok) {
          const responseBody = await response.json().catch(() => null);
          throw new Error(
            responseBody?.message ||
              "We could not activate your account with this link.",
          );
        }

        setActivationState("success");
      } catch (error) {
        setActivationState("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "We could not activate your account with this link.",
        );
      }
    }

    activateAccount();
  }, [activationToken, router.isReady]);

  return (
    <AuthLayout
      title="Activate Your Manifold Account"
      description="Activate your Manifold early access account."
    >
      {activationState === "loading" ? (
        <>
          <div className="status-mark loading-mark" aria-hidden="true">
            <span></span>
          </div>
          <p className="eyebrow">Activating your account</p>
          <h1>Hold tight.</h1>
          <p className="message">
            We are confirming your early access spot now.
          </p>
        </>
      ) : null}

      {activationState === "success" ? (
        <>
          <div className="status-mark success-mark" aria-hidden="true">
            <span>!</span>
          </div>
          <p className="eyebrow">Account activated</p>
          <h1>You are officially in.</h1>
          <p className="message">
            Welcome to Manifold. We will notify you as soon as the next phase
            begins.
          </p>
          <Link href="/" className="home-link">
            Back to Manifold
          </Link>
        </>
      ) : null}

      {activationState === "error" ? (
        <>
          <div className="status-mark error-mark" aria-hidden="true">
            <span>x</span>
          </div>
          <p className="eyebrow">Activation link failed</p>
          <h1>We could not activate this account.</h1>
          <p className="message">
            {errorMessage} The link may be expired or already used.
          </p>
          <Link href="/signup" className="home-link">
            Request a new invite
          </Link>
        </>
      ) : null}

      <style jsx>{`
        .status-mark {
          width: 5rem;
          height: 5rem;
          margin: 0 auto 1.5rem;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: var(--color-purple-dark);
          color: var(--bg-primary);
          font-size: 2.5rem;
          font-weight: 900;
          line-height: 1;
        }

        .loading-mark {
          background: rgba(53, 34, 89, 0.12);
        }

        .loading-mark span {
          width: 2.25rem;
          height: 2.25rem;
          border: 4px solid rgba(53, 34, 89, 0.18);
          border-top-color: var(--color-purple-dark);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .success-mark {
          background: #1f7a4d;
        }

        .error-mark {
          background: #7a1f2d;
        }

        .eyebrow {
          margin: 0 0 0.75rem;
          color: rgba(53, 34, 89, 0.72);
          font-size: 0.95rem;
          font-weight: 800;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        h1 {
          margin: 0;
          color: var(--color-purple-dark);
          font-size: 4rem;
          font-weight: 900;
          line-height: 0.95;
          letter-spacing: 0;
        }

        .message {
          max-width: 560px;
          margin: 1.5rem auto 0;
          color: rgba(53, 34, 89, 0.84);
          font-size: 1.25rem;
          line-height: 1.6;
        }

        .home-link {
          min-height: 3rem;
          margin-top: 2rem;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--color-purple-dark);
          color: var(--bg-primary);
          padding: 0.85rem 1.35rem;
          font-weight: 800;
          text-decoration: none;
        }

        .home-link:focus-visible {
          outline: 3px solid rgba(53, 34, 89, 0.45);
          outline-offset: 4px;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .loading-mark span {
            animation: none;
          }
        }

        @media (max-width: 640px) {
          h1 {
            font-size: 2.5rem;
          }

          .message {
            font-size: 1.1rem;
          }
        }
      `}</style>
    </AuthLayout>
  );
}
