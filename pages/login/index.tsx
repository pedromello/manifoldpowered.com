import { FormEvent, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import AuthLayout from "../../components/AuthLayout";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/v1/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      if (!response.ok) {
        const responseBody = await response.json().catch(() => null);
        throw new Error(
          responseBody?.message || "Invalid credentials. Please try again.",
        );
      }

      // Success
      const callbackUrl = router.query.callbackUrl;
      const redirectUrl =
        typeof callbackUrl === "string" ? callbackUrl : "/store";
      router.push(redirectUrl);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Invalid credentials. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Login | Manifold"
      description="Login to your Manifold account."
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="modal-heading">
          <h2 id="login-title">Log In</h2>
          <p>Welcome back to Manifold.</p>
        </div>

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

        <label className="field">
          <span>Password</span>
          <input
            autoComplete="current-password"
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {errorMessage ? (
          <p className="form-message error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <button className="submit-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Logging in..." : "Log In"}
        </button>

        <p className="signup-prompt">
          Don't have an account?{" "}
          <Link href="/signup">Request Early Access</Link>
        </p>
      </form>

      <style jsx>{`
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          padding: 1rem;
        }

        .modal-heading {
          text-align: left;
        }

        .modal-heading h2 {
          margin: 0;
          color: var(--color-purple-dark);
          padding-right: 2.5rem;
          font-size: 2.4rem;
          font-weight: 900;
          line-height: 1.1;
        }

        .modal-heading p {
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
          margin-top: 0.5rem;
        }

        .submit-button:disabled {
          cursor: progress;
          opacity: 0.65;
        }

        .submit-button:focus-visible {
          outline: 3px solid rgba(53, 34, 89, 0.45);
          outline-offset: 3px;
        }

        .signup-prompt {
          margin: 1rem 0 0;
          font-size: 0.95rem;
          color: rgba(53, 34, 89, 0.8);
          font-weight: 500;
        }

        .signup-prompt :global(a) {
          color: var(--color-purple-dark);
          font-weight: 800;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        @media (max-width: 520px) {
          .auth-form {
            padding: 0;
          }

          .modal-heading h2 {
            font-size: 1.8rem;
          }
        }
      `}</style>
    </AuthLayout>
  );
}
