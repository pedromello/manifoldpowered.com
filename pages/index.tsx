export default function Home() {
  return (
    <div className="container">
      <main className="content">
        <h1 className="title">Manifold</h1>
        <h2 className="subtitle">
          The Shared Infrastructure for the Next Generation of Game Stores.
        </h2>

        <p className="intro">
          Manifold is an open-source infrastructure that allows
          anyone—communities, streamers, and curators—to launch their own
          digital game store. Developers upload once; Outlets sell everywhere.
        </p>

        <div className="text">
          <p>
            Game development has been democratized. Distribution hasn&apos;t.
            Engines, assets, and learning resources are now accessible to
            everyone. Yet, when it comes to selling, the industry still relies
            on centralized monopolies.
          </p>

          <p>
            Manifold changes this. We are building a modular distribution layer.
            We treat the &quot;store backend&quot; as shared infrastructure,
            allowing multiple independent storefronts to exist, grow, and
            connect without building everything from scratch.
          </p>

          <div className="section">
            <h2 className="section-header">
              1. For Developers: Reach Niche Markets
            </h2>
            <p>
              Stop relying on a single algorithm to find your audience. Upload
              your game to the Manifold network once, and make it available to
              hundreds of niche stores (Outlets) curated by people who actually
              understand your genre.
            </p>
          </div>

          <div className="section">
            <h2 className="section-header">
              2. For Curators & Communities: Build Your Outlet
            </h2>
            <p>
              Turn your community into a storefront. Whether you are a streamer,
              a clan, or a genre enthusiast, you can launch a branded game
              store. You curate the games; we handle the heavy lifting (hosting,
              payments, and accounts).
            </p>
          </div>

          <div className="section">
            <h2 className="section-header">
              3. For Players: One Unified Library
            </h2>
            <p>
              Freedom of choice without fragmentation. A game bought in a
              &quot;Horror Niche Store&quot; and a game bought in a &quot;Cozy
              RPG Store&quot; both live in the same Manifold player library. Buy
              anywhere, play everywhere.
            </p>
          </div>

          <div className="closing">
            <p>
              We are at the beginning. Manifold is currently in active
              development, built in public by developers who believe creating a
              game should be harder than distributing it.
            </p>
            <p className="spacing-top">
              We are looking for early adopters, contributors, and dreamers.
            </p>
          </div>
        </div>

        <div className="actions">
          <a
            href="https://github.com/pedromello/manifoldpowered.com"
            target="_blank"
            rel="noopener noreferrer"
            className="cta"
            aria-label="View on GitHub"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <span>View on GitHub</span>
          </a>

          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLScYuPMblNZLzKLLnZ6enRJ0n3_Jqvx7V9veNiesVlE4QJo3eg/viewform?usp=dialog"
            target="_blank"
            rel="noopener noreferrer"
            className="cta"
            aria-label="Follow Development"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
            <span>Follow Development</span>
          </a>
        </div>
      </main>

      <style jsx>{`
        .container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 3rem 2rem;
          background: #fafafa;
        }

        .content {
          max-width: 680px;
          width: 100%;
        }

        .title {
          font-size: 2.5rem;
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 1.5rem;
          color: #000;
          letter-spacing: -0.03em;
        }

        .subtitle {
          font-size: 1.5rem;
          font-weight: 600;
          line-height: 1.2;
          margin-bottom: 1.5rem;
          color: #000;
          letter-spacing: -0.03em;
        }

        .intro {
          font-size: 1.25rem;
          line-height: 1.6;
          color: #444;
          margin-bottom: 3rem;
          font-weight: 500;
        }

        .text {
          font-size: 1.1rem;
          line-height: 1.7;
          color: #333;
        }

        .text p {
          margin-bottom: 1.5rem;
        }

        .section {
          margin-top: 2.5rem;
          margin-bottom: 2.5rem;
        }

        .section-header {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 0.75rem;
          color: #000;
        }

        .closing {
          margin-top: 3.5rem;
          color: #666;
          border-top: 1px solid #eee;
          padding-top: 2rem;
        }

        .spacing-top {
          margin-top: 1rem;
        }

        .actions {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          margin-top: 3rem;
        }

        .cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.625rem;
          padding: 0.875rem 1.5rem;
          color: #000;
          font-weight: 500;
          font-size: 0.95rem;
          text-decoration: none;
          background: #fff;
          border: 2px solid #000;
          border-radius: 8px;
          transition: all 0.2s ease;
        }

        .cta:hover {
          background: #000;
          color: #fff;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .cta svg {
          width: 20px;
          height: 20px;
        }

        @media (max-width: 640px) {
          .title {
            font-size: 2rem;
          }

          .intro {
            font-size: 1.1rem;
          }

          .text {
            font-size: 1rem;
          }
        }
      `}</style>

      <style jsx global>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family:
            -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            "Helvetica Neue", Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
      `}</style>
    </div>
  );
}
