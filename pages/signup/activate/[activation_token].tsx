import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

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
    <div className="activation-page">
      <Head>
        <title>Activate Your Manifold Account</title>
        <meta
          name="description"
          content="Activate your Manifold early access account."
        />
        <link rel="icon" href="/images/brand/manifold-ico.ico" />
      </Head>

      <main className="activation-shell">
        <Image
          src="/images/brand/manifold-logo.png"
          alt="Manifold Logo"
          width={180}
          height={180}
          priority={true}
          className="logo"
        />

        <section className="activation-card" aria-live="polite">
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
                Welcome to Manifold early access. We will notify you as soon as
                the first test begins.
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
              <Link href="/" className="home-link">
                Request a new invite
              </Link>
            </>
          ) : null}
        </section>
      </main>

      <style jsx>{`
        .activation-page {
          min-height: 100vh;
          overflow: hidden;
          background:
            radial-gradient(
              circle at 50% 12%,
              rgba(214, 205, 255, 0.55),
              transparent 44%
            ),
            var(--bg-primary);
          color: var(--color-purple-dark);
          font-family:
            -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica,
            Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji",
            "Segoe UI Symbol";
        }

        .activation-shell {
          width: min(100%, 920px);
          min-height: 100vh;
          margin: 0 auto;
          padding: 3rem 1.25rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2rem;
        }

        .logo {
          width: auto;
          max-width: min(320px, 80vw);
          max-height: 86px;
        }

        .activation-card {
          width: min(100%, 900px);
          border: 1px solid rgba(214, 205, 255, 0.85);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.64);
          padding: 4rem;
          text-align: center;
          box-shadow:
            0 30px 80px rgba(53, 34, 89, 0.14),
            inset 0 1px 0 rgba(255, 255, 255, 0.82);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }

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
          .activation-card {
            padding: 2rem 1.25rem;
          }

          h1 {
            font-size: 2.5rem;
          }

          .message {
            font-size: 1.1rem;
          }
        }
      `}</style>

      <style jsx global>{`
        :root {
          --color-black: #000000;
          --color-purple-dark: #352259;
          --color-indigo-light: #d6cdff;
          --color-indigo-lighter: #e5dfff;
          --color-orange-light: #fffbf6;

          --bg-primary: var(--color-orange-light);
          --text-primary: var(--color-purple-dark);
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background-color: var(--bg-primary);
          color: var(--text-primary);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        ::selection {
          background-color: var(--color-indigo-light);
          color: var(--color-purple-dark);
        }
      `}</style>
    </div>
  );
}
