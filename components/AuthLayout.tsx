import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";

interface AuthLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export default function AuthLayout({
  title,
  description = "Join Manifold",
  children,
}: AuthLayoutProps) {
  return (
    <div className="auth-page">
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="noindex" />
        <link rel="icon" href="/images/brand/manifold-ico.ico" />
      </Head>

      <main className="auth-shell">
        <Link href="/">
          <Image
            src="/images/brand/manifold-logo.png"
            alt="Manifold Logo"
            width={180}
            height={180}
            priority={true}
            className="logo"
          />
        </Link>

        <section className="auth-card" aria-live="polite">
          {children}
        </section>
      </main>

      <style jsx>{`
        .auth-page {
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

        .auth-shell {
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

        .auth-card {
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

        @media (max-width: 640px) {
          .auth-card {
            padding: 2rem 1.25rem;
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
