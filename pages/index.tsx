import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import EarlyAccessModal from "components/EarlyAccessModal";

export default function Home() {
  const [isEarlyAccessModalOpen, setIsEarlyAccessModalOpen] = useState(false);

  return (
    <div className="liquid-container">
      <Head>
        <title>Manifold | Open-Source Game Distribution for Communities</title>
        <meta
          name="description"
          content="Empowering communities to own their game distribution. Start your own storefront, curate games, and earn revenue without depending on corporate intermediaries."
        />

        <meta property="og:type" content="website" />
        <meta property="og:title" content="Manifold | Own Your Game Store" />
        <meta
          property="og:description"
          content="We don't need another corporate storefront. Launch your community's official game distribution platform today."
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
            Project status: open-source pre-release
          </div>

          <div className="hero-content">
            <h1 className="massive-title">MANIFOLD</h1>
            <p className="hero-subtitle">
              Empowering communities to own their game distribution. Start your
              own storefront, curate games for your audience, and earn revenue
              without depending on corporate intermediaries.
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
            We don&apos;t need another corporate storefront. <br />
            <strong>
              Manifold gives the gaming community the power to distribute games
              on their own terms. A fully open-source infrastructure for
              creators to launch verified stores in minutes.
            </strong>
          </h2>
        </section>

        <section className="features-layer">
          <div className="feature-card offset-left">
            <div className="feature-glow"></div>
            <h3 className="feature-title">Your Community, Your Store</h3>
            <p className="feature-desc">
              Stop sending your audience away to generic algorithms. With
              Manifold, you open a verified, branded storefront in minutes.
              Handpick the catalog that fits your community&apos;s vibe
              perfectly, whether it&apos;s indie cozy games or hardcore
              competitive shooters.
            </p>
          </div>

          <div className="feature-card offset-right">
            <div className="feature-glow"></div>
            <h3 className="feature-title">Monetize Your Influence</h3>
            <p className="feature-desc">
              When your fans buy a game they discovered through your streams or
              reviews, you earn a direct revenue share. We provide the
              open-source infrastructure to make it secure, you provide the
              curation and the genuine recommendation.
            </p>
          </div>

          <div className="feature-card offset-center">
            <div className="feature-glow"></div>
            <h3 className="feature-title">Frictionless Infrastructure</h3>
            <p className="feature-desc">
              You don&apos;t need to be a developer to sell games. Manifold
              handles the payment processing integrations, secure game
              downloads, and heavy lifting. You just build your community and
              share the games you love.
            </p>
          </div>
        </section>

        <section className="cta-layer">
          <h2 className="cta-heading">Reclaim Distribution</h2>
          <p className="cta-text">
            Manifold is an open framework currently in active development. Be
            among the first to break the mold and reshape how games are sold.
          </p>

          <div className="action-buttons">
            <a
              href="https://github.com/pedromello/manifoldpowered.com"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-liquid"
              aria-label="View on GitHub"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              View on GitHub
            </a>
            <button
              type="button"
              className="btn-liquid primary"
              aria-label="Request Early Access"
              onClick={() => setIsEarlyAccessModalOpen(true)}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
              </svg>
              Early Access
            </button>
          </div>

          <div className="audience-branching">
            <div className="branch-card">
              <h4>Are you a Game Developer?</h4>
              <p>
                Learn how Manifold multiplies your organic reach across the
                world by connecting you with creators.
              </p>
              <Link href="/developers" legacyBehavior>
                <a className="branch-link">
                  Discover Developer Benefits &rarr;
                </a>
              </Link>
            </div>
            <div className="branch-card">
              <h4>Are you a Player?</h4>
              <p>
                Find out why your ultimate game library doesn&apos;t depend on
                heavy corporate launchers anymore.
              </p>
              <Link href="/players" legacyBehavior>
                <a className="branch-link">Explore Player Features &rarr;</a>
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
          padding: 4rem 2rem;
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
          font-size: clamp(4rem, 15vw, 15rem);
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

        /* Action Buttons */
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

        /* Audience Branching Structure */
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
