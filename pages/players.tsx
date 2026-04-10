import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import EarlyAccessModal from "components/EarlyAccessModal";

export default function Players() {
  const [isEarlyAccessModalOpen, setIsEarlyAccessModalOpen] = useState(false);

  return (
    <div className="liquid-container">
      <Head>
        <title>Manifold for Players | One Universal Library</title>
        <meta
          name="description"
          content="Support creators directly without fracturing your game collection. One login, one library, endless storefronts."
        />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Manifold for Players" />
        <meta
          property="og:description"
          content="Your games, owned by you. Buy anywhere, play everywhere."
        />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="icon" href="/images/brand/manifold-ico.ico" />
      </Head>

      <main className="fluid-main">
        <section className="hero-layer">
          <img
            src="/images/brand/manifold-logo.png"
            alt="Manifold Logo"
            className="logo"
          />
          <div className="badge">
            <span className="dot"></span>
            Open-source infrastructure
          </div>

          <div className="hero-content">
            <h1
              className="massive-title"
              style={{ fontSize: "clamp(4rem, 15vw, 12rem)" }}
            >
              MANIFOLD
            </h1>
            <p className="hero-subtitle">
              Your games shouldn&apos;t be trapped inside corporate launchers.
              Support the creators you love while keeping your collection
              exactly where it belongs: in a single, universal library.
            </p>
          </div>

          <div className="hero-diagram-wrapper">
            <Image
              src="/images/manifold-diagram-hd.png"
              alt="Manifold Ecosystem Diagram"
              width={1920}
              height={1440}
              priority={true}
              className="diagram-layer"
            />
          </div>
        </section>

        <section className="intro-layer">
          <h2 className="manifesto">
            Stop buying games just to feed an algorithm.
            <br />
            <strong>
              When you buy a game through a Manifold-powered store, your money
              goes to the people who actually made it and the community who
              championed it.
            </strong>
          </h2>
        </section>

        <section className="features-layer">
          <div className="feature-card offset-left">
            <div className="feature-glow"></div>
            <h3 className="feature-title">One Epic Library</h3>
            <p className="feature-desc">
              Whether you buy a farming sim from your favorite streamer or a
              competitive FPS from an esports team&apos;s page, every single
              game goes into the same centralized dashboard. You only need one
              account.
            </p>
          </div>

          <div className="feature-card offset-right">
            <div className="feature-glow"></div>
            <h3 className="feature-title">True Independence</h3>
            <p className="feature-desc">
              Tired of 500MB bloatware launchers tracking your every move?
              Manifold is built on open standards, promoting a DRM-free-friendly
              philosophy that respects your hardware and privacy.
            </p>
          </div>

          <div className="feature-card offset-center">
            <div className="feature-glow"></div>
            <h3 className="feature-title">Fund Your Creators</h3>
            <p className="feature-desc">
              Every purchase genuinely supports the storefront you bought it
              from. You are actively funding your favorite content creators,
              modding teams, and communities with games you were going to buy
              anyway.
            </p>
          </div>
        </section>

        <section className="cta-layer">
          <h2 className="cta-heading">Take Back Your Games</h2>
          <p className="cta-text">
            We&apos;re building an ecosystem where players, devs, and creators
            finally agree on the rules. Join the open movement.
          </p>

          <div className="action-buttons">
            <a
              href="https://github.com/pedromello/manifoldpowered.com"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-liquid"
            >
              View Open Source
            </a>
            <button
              type="button"
              className="btn-liquid primary"
              onClick={() => setIsEarlyAccessModalOpen(true)}
            >
              Early Access
            </button>
          </div>

          <div className="audience-branching">
            <div className="branch-card">
              <h4>Are you a Creator?</h4>
              <p>Looking to launch a curated game store for your community?</p>
              <Link href="/" legacyBehavior>
                <a className="branch-link">Discover Creator Benefits &rarr;</a>
              </Link>
            </div>
            <div className="branch-card">
              <h4>Are you a Game Developer?</h4>
              <p>
                Learn how Manifold multiplies your organic reach without
                algorithm dependencies.
              </p>
              <Link href="/developers" legacyBehavior>
                <a className="branch-link">
                  Discover Developer Benefits &rarr;
                </a>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <EarlyAccessModal
        isOpen={isEarlyAccessModalOpen}
        onClose={() => setIsEarlyAccessModalOpen(false)}
      />

      <style jsx>{`
        .liquid-container {
          min-height: 100vh;
          overflow-x: hidden;
          background: var(--bg-primary);
          position: relative;
          font-family:
            -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica,
            Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji",
            "Segoe UI Symbol";
        }

        .liquid-container::before {
          content: "";
          position: absolute;
          top: -20vh;
          left: -20vw;
          width: 140vw;
          height: 140vh;
          background: radial-gradient(
            circle at 50% 10%,
            rgba(214, 205, 255, 0.4) 0%,
            transparent 60%
          );
          pointer-events: none;
          z-index: 0;
        }

        .fluid-main {
          position: relative;
          z-index: 1;
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem 2rem 4rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 12vh;
        }

        .hero-layer {
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          padding-top: 2vh;
        }

        .logo {
          max-height: 80px;
          width: auto;
          margin-bottom: 2.5rem;
          position: relative;
          z-index: 10;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(214, 205, 255, 0.5);
          border: 1px solid var(--color-indigo-light);
          color: var(--color-purple-dark);
          padding: 0.5rem 1.25rem;
          border-radius: 32px;
          font-weight: 600;
          font-size: 0.95rem;
          letter-spacing: 0.5px;
          margin-bottom: 3rem;
          animation: float 6s ease-in-out infinite;
        }

        .badge .dot {
          width: 8px;
          height: 8px;
          background: var(--color-purple-dark);
          border-radius: 50%;
          box-shadow: 0 0 10px var(--color-purple-dark);
          animation: pulse 2s infinite;
        }

        @keyframes float {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
          100% {
            transform: translateY(0px);
          }
        }

        @keyframes pulse {
          0% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
          100% {
            opacity: 1;
          }
        }

        .massive-title {
          font-weight: 800;
          line-height: 0.85;
          letter-spacing: -0.05em;
          color: transparent;
          -webkit-text-stroke: 1px rgba(53, 34, 89, 0.05);
          background: linear-gradient(
            180deg,
            var(--color-purple-dark) 0%,
            rgba(53, 34, 89, 0.2) 100%
          );
          background-clip: text;
          -webkit-background-clip: text;
          text-align: center;
          margin: 0;
          padding: 0 2rem;
          position: relative;
          z-index: 2;
        }

        .hero-subtitle {
          font-size: clamp(1.2rem, 3vw, 2rem);
          text-align: center;
          max-width: 800px;
          margin: 1.5rem auto 4rem;
          color: var(--color-purple-dark);
          opacity: 0.85;
          font-weight: 500;
          position: relative;
          z-index: 3;
        }

        .hero-diagram-wrapper {
          margin-top: -6vh;
          position: relative;
          width: 100%;
          max-width: 1100px;
          z-index: 10;
          transform: perspective(1200px) rotateX(4deg);
          transition: transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .hero-diagram-wrapper:hover {
          transform: perspective(1200px) rotateX(0deg) scale(1.02);
        }

        .hero-diagram-wrapper :global(.diagram-layer) {
          width: 100%;
          height: auto;
          border-radius: 32px;
          border: 1px solid rgba(53, 34, 89, 0.08);
          box-shadow:
            0 40px 80px rgba(53, 34, 89, 0.15),
            0 0 60px rgba(214, 205, 255, 0.4);
        }

        .intro-layer {
          text-align: center;
          max-width: 900px;
          margin: 0 auto;
        }

        .manifesto {
          font-size: clamp(1.5rem, 4vw, 2.5rem);
          line-height: 1.5;
          color: rgba(53, 34, 89, 0.8);
          font-weight: 400;
        }

        .manifesto strong {
          color: var(--color-purple-dark);
          font-weight: 600;
        }

        .features-layer {
          display: flex;
          flex-direction: column;
          gap: 4rem;
          max-width: 1060px;
          margin: 0 auto;
        }

        .feature-card {
          background: rgba(255, 255, 255, 0.35);
          border: 1px solid rgba(214, 205, 255, 0.6);
          border-radius: 40px;
          padding: 4rem;
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          transition:
            transform 0.4s cubic-bezier(0.25, 1, 0.5, 1),
            background 0.4s,
            border 0.4s;
          box-shadow: 0 10px 30px rgba(53, 34, 89, 0.02);
        }

        .feature-card:hover {
          transform: translateY(-8px);
          background: rgba(255, 255, 255, 0.6);
          border: 1px solid var(--color-indigo-light);
          box-shadow: 0 15px 40px rgba(53, 34, 89, 0.08);
        }

        .offset-left {
          align-self: flex-start;
          width: 85%;
        }

        .offset-right {
          align-self: flex-end;
          width: 85%;
        }

        .offset-center {
          align-self: center;
          width: 95%;
        }

        .feature-glow {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(
            90deg,
            transparent,
            var(--color-purple-dark) 50%,
            transparent
          );
          opacity: 0.3;
        }

        .feature-title {
          font-size: 2.2rem;
          font-weight: 700;
          color: var(--color-purple-dark);
          margin-bottom: 1.5rem;
          letter-spacing: -0.02em;
        }

        .feature-desc {
          font-size: 1.25rem;
          line-height: 1.6;
          color: rgba(53, 34, 89, 0.85);
        }

        .cta-layer {
          text-align: center;
          padding: 7rem 2rem;
          background: linear-gradient(
            180deg,
            transparent,
            rgba(214, 205, 255, 0.3) 100%
          );
          border-radius: 40px;
          border: 1px solid rgba(214, 205, 255, 0.6);
          margin-top: 4rem;
          margin-bottom: 6rem;
        }

        .cta-heading {
          font-size: clamp(2.5rem, 6vw, 4rem);
          font-weight: 800;
          margin-bottom: 1.5rem;
          color: var(--color-purple-dark);
        }

        .cta-text {
          font-size: 1.25rem;
          color: rgba(53, 34, 89, 0.8);
          max-width: 600px;
          margin: 0 auto 3rem;
          line-height: 1.6;
        }

        .action-buttons {
          display: flex;
          justify-content: center;
          gap: 1.5rem;
          flex-wrap: wrap;
        }

        .btn-liquid {
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1.25rem 2.5rem;
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--color-purple-dark);
          background: rgba(214, 205, 255, 0.2);
          border: 1px solid var(--color-indigo-light);
          border-radius: 32px;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .btn-liquid:hover {
          transform: translateY(-4px) scale(1.02);
          background: rgba(214, 205, 255, 0.5);
          box-shadow: 0 10px 30px rgba(53, 34, 89, 0.15);
        }

        .btn-liquid.primary {
          background: var(--color-purple-dark);
          color: var(--bg-primary);
          border: none;
        }

        .btn-liquid.primary:hover {
          background: var(--color-black);
          box-shadow: 0 10px 40px rgba(53, 34, 89, 0.3);
        }

        .audience-branching {
          display: flex;
          justify-content: center;
          gap: 2rem;
          margin-top: 7rem;
          flex-wrap: wrap;
        }

        .branch-card {
          flex: 1;
          min-width: 250px;
          max-width: 440px;
          background: rgba(255, 255, 255, 0.4);
          border: 1px solid rgba(214, 205, 255, 0.6);
          border-radius: 32px;
          padding: 3rem 2.5rem;
          text-align: left;
          transition:
            transform 0.3s ease,
            box-shadow 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .branch-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 5px;
          height: 100%;
          background: var(--color-purple-dark);
          transition: width 0.3s ease;
        }

        .branch-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 15px 40px rgba(53, 34, 89, 0.08);
          border: 1px solid var(--color-indigo-light);
          background: rgba(255, 255, 255, 0.7);
        }

        .branch-card:hover::before {
          width: 8px;
        }

        .branch-card h4 {
          font-size: 1.6rem;
          color: var(--color-purple-dark);
          margin-bottom: 1rem;
          font-weight: 800;
        }

        .branch-card p {
          color: rgba(53, 34, 89, 0.85);
          font-size: 1.15rem;
          margin-bottom: 2rem;
          line-height: 1.5;
        }

        .branch-link {
          display: inline-flex;
          align-items: center;
          color: var(--color-purple-dark);
          font-weight: 700;
          text-decoration: none;
          font-size: 1.1rem;
          transition: color 0.2s;
        }

        .branch-link:hover {
          color: var(--color-black);
          text-decoration: underline;
        }

        @media (max-width: 1024px) {
          .massive-title {
            font-size: clamp(4rem, 12vw, 10rem);
          }
        }

        @media (max-width: 768px) {
          .fluid-main {
            padding: 2rem 1rem 4rem 1rem;
          }

          .offset-left,
          .offset-right,
          .offset-center {
            width: 100%;
          }

          .feature-card {
            padding: 2rem 1.5rem;
            border-radius: 24px;
          }

          .cta-layer {
            padding: 3rem 1.5rem;
            border-radius: 24px;
          }

          .action-buttons {
            flex-direction: column;
            width: 100%;
          }

          .btn-liquid {
            width: 100%;
            justify-content: center;
          }

          .audience-branching {
            flex-direction: column;
            align-items: center;
          }

          .branch-card {
            width: 100%;
            min-width: 100%;
            padding: 2rem 1.5rem;
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
          margin: 0;
          padding: 0;
        }

        body {
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
