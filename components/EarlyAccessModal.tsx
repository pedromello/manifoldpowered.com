import { FormEvent, useEffect, useState } from "react";

interface EarlyAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const USERNAME_PATTERN = /^[A-Za-z0-9]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generatePassword() {
  const randomBytes = new Uint8Array(24);
  window.crypto.getRandomValues(randomBytes);

  return Array.from(randomBytes, (byte) =>
    byte.toString(36).padStart(2, "0"),
  ).join("");
}

export default function EarlyAccessModal({
  isOpen,
  onClose,
}: EarlyAccessModalProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

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
      const password = generatePassword();
      const response = await fetch("/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: trimmedUsername,
          email: trimmedEmail,
          password,
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
        "We sent you an activation email. Please activate your account within 15 minutes.",
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

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-modal="true"
        aria-labelledby="early-access-title"
        className="modal-panel"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          aria-label="Close early access form"
          className="modal-close"
          type="button"
          onClick={onClose}
        >
          x
        </button>

        {successMessage ? (
          <div className="modal-success" role="status">
            <h2 id="early-access-title">Check your inbox</h2>
            <p>{successMessage}</p>
            <button className="submit-button" type="button" onClick={onClose}>
              Got it
            </button>
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
      </section>

      <style jsx>{`
        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
        }

        .modal-panel {
          width: min(100%, 480px);
          max-height: calc(100vh - 2rem);
          overflow-y: auto;
          position: relative;
          border: 1px solid rgba(214, 205, 255, 0.8);
          border-radius: 8px;
          background: var(--bg-primary);
          color: var(--color-purple-dark);
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35);
        }

        .modal-close {
          position: absolute;
          top: 0.75rem;
          right: 0.75rem;
          width: 2.25rem;
          height: 2.25rem;
          border: 1px solid rgba(53, 34, 89, 0.16);
          border-radius: 8px;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.65);
          color: var(--color-purple-dark);
          font-size: 1.25rem;
          line-height: 1;
        }

        .early-access-form,
        .modal-success {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          padding: 2rem;
        }

        .modal-heading,
        .modal-success {
          text-align: left;
        }

        .modal-heading h2,
        .modal-success h2 {
          margin: 0;
          padding-right: 2.5rem;
          font-size: 2rem;
          line-height: 1.1;
        }

        .modal-heading p,
        .modal-success p {
          margin: 0.75rem 0 0;
          color: rgba(53, 34, 89, 0.8);
          font-size: 1rem;
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

        .submit-button:focus-visible,
        .modal-close:focus-visible {
          outline: 3px solid rgba(53, 34, 89, 0.45);
          outline-offset: 3px;
        }

        @media (max-width: 520px) {
          .early-access-form,
          .modal-success {
            padding: 1.5rem;
          }

          .modal-heading h2,
          .modal-success h2 {
            font-size: 1.6rem;
          }
        }
      `}</style>
    </div>
  );
}
