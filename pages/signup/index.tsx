import Link from "next/link";
import { useRouter } from "next/router";
import { FormEvent, useEffect, useState } from "react";
import AuthLayout from "../../components/AuthLayout";

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
        headers: {
          "Content-Type": "application/json",
        },
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
        title="Request Early Access | Manifold"
        description="Create your Manifold early access account."
      >
        <p role="status">Loading...</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Request Early Access | Manifold"
      description="Create your Manifold early access account."
    >
      {successMessage ? (
        <div className="modal-success" role="status">
          <h2 id="early-access-title">Check your inbox</h2>
          <p>{successMessage}</p>
          <Link href="/onboarding" className="submit-button back-link">
            See what you can build
          </Link>
          <Link href="/store" className="submit-button ghost-link">
            Browse games while you wait
          </Link>
        </div>
      ) : (
        <form className="early-access-form" onSubmit={handleSubmit}>
          <div className="modal-heading">
            <h2 id="early-access-title">Request Early Access</h2>
            <p>Create your account and activate it from your inbox.</p>
          </div>

          <label className="field">
            <span>Username</span>
            <input
              autoComplete="username"
              inputMode="text"
              maxLength={30}
              minLength={3}
              pattern="[A-Za-z0-9]{3,30}"
              required
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <small>Use 3 to 30 letters or numbers. No spaces.</small>
          </label>

          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          {errorMessage ? (
            <p className="form-message error" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <button
            className="submit-button"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Sending..." : "Send"}
          </button>
        </form>
      )}

      <style jsx>{`
        .early-access-form,
        .modal-success {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          padding: 1rem;
        }

        .modal-heading,
        .modal-success {
          text-align: left;
        }

        .modal-heading h2,
        .modal-success h2 {
          margin: 0;
          color: var(--color-purple-dark);
          padding-right: 2.5rem;
          font-size: 2.4rem;
          font-weight: 900;
          line-height: 1.1;
        }

        .modal-heading p,
        .modal-success p {
          margin: 0.75rem 0 0;
          color: rgba(53, 34, 89, 0.8);
          font-size: 1.1rem;
          line-height: 1.5;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          text-align: left;
          font-weight: 700;
        }

        .field input {
          width: 100%;
          min-height: 3rem;
          border: 1px solid rgba(53, 34, 89, 0.24);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.78);
          color: var(--color-purple-dark);
          padding: 0.75rem 1rem;
          font: inherit;
          letter-spacing: 0;
        }

        .field input:focus {
          border-color: var(--color-purple-dark);
          outline: 3px solid rgba(214, 205, 255, 0.9);
        }

        .field small {
          color: rgba(53, 34, 89, 0.72);
          font-size: 0.85rem;
          font-weight: 500;
          line-height: 1.4;
        }

        .form-message {
          margin: 0;
          border-radius: 8px;
          padding: 0.85rem 1rem;
          text-align: left;
          font-weight: 700;
          line-height: 1.4;
        }

        .form-message.error {
          border: 1px solid rgba(150, 20, 20, 0.3);
          background: rgba(255, 230, 230, 0.9);
          color: #781818;
        }

        .submit-button {
          min-height: 3rem;
          border: 0;
          border-radius: 8px;
          cursor: pointer;
          background: var(--color-purple-dark);
          color: var(--bg-primary);
          padding: 0.85rem 1.25rem;
          font: inherit;
          font-weight: 800;
          letter-spacing: 0;
        }

        .submit-button:disabled {
          cursor: progress;
          opacity: 0.65;
        }

        .submit-button:focus-visible {
          outline: 3px solid rgba(53, 34, 89, 0.45);
          outline-offset: 3px;
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          margin-top: 1.5rem;
        }

        .ghost-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          background: transparent;
          color: var(--color-purple-dark);
          border: 1px solid rgba(53, 34, 89, 0.24);
        }

        @media (max-width: 520px) {
          .early-access-form,
          .modal-success {
            padding: 0;
          }

          .modal-heading h2,
          .modal-success h2 {
            font-size: 1.8rem;
          }
        }
      `}</style>
    </AuthLayout>
  );
}
