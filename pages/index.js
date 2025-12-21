export default function Home() {
  return (
    <div className="container">
      <main className="content">
        <h1 className="title">Manifold</h1>

        <div className="text">
          <p className="intro">
            We are currently building a new open-source layer of infrastructure
            for game distribution.
          </p>

          <p>
            Over the years, game development has been democratized.
            <br />
            Engines became accessible.
            <br />
            Art, design, and audio tools evolved into open and shared
            ecosystems.
          </p>

          <p className="emphasis">
            Distribution, however, remained centralized.
          </p>

          <p>
            Manifold is built on the idea that distribution should not be owned
            by a single platform, but treated as shared infrastructure — just
            like many of the tools used to create games.
          </p>

          <p>
            This project is about turning distribution into something modular,
            interoperable, and accessible.
            <br />A single system that allows multiple independent stores to
            exist, grow, and connect.
          </p>

          <p className="closing">
            We are at the beginning.
            <br />
            Building in public.
            <br />
            And open to anyone who believes that creating should be harder than
            distributing.
          </p>
        </div>
      </main>

      <style jsx>{`
        .container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          background: #fafafa;
        }

        .content {
          max-width: 640px;
          width: 100%;
        }

        .title {
          font-size: 2rem;
          font-weight: 600;
          margin-bottom: 3rem;
          color: #000;
          letter-spacing: -0.02em;
        }

        .text {
          font-size: 1.05rem;
          line-height: 1.8;
          color: #333;
        }

        .text p {
          margin-bottom: 1.5rem;
        }

        .intro {
          font-size: 1.15rem;
          font-weight: 500;
          color: #000;
        }

        .emphasis {
          font-style: italic;
          color: #666;
        }

        .closing {
          margin-top: 2.5rem;
          color: #666;
        }

        @media (max-width: 640px) {
          .title {
            font-size: 1.5rem;
            margin-bottom: 2rem;
          }

          .text {
            font-size: 1rem;
          }

          .intro {
            font-size: 1.05rem;
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
