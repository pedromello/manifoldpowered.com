import Head from "next/head";
import Link from "next/link";
import { Gamepad2, Store } from "lucide-react";

// Post-signup hub: an informational fork that routes new users to the right
// creation flow. Intentionally requires no auth and no account data to view —
// the CTAs point at /onboarding/create and /store/new, which each handle their
// own auth redirect. Linked from the signup success screen.
export default function OnboardingHubPage() {
  return (
    <>
      <Head>
        <title>Get started | Manifold</title>
      </Head>

      <div className="min-h-screen bg-[#1D0F3B] text-white flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-4xl flex flex-col gap-10">
          <h1 className="text-3xl md:text-5xl font-black leading-tight text-center">
            Welcome to Manifold. What do you want to build?
          </h1>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
              <span className="w-fit p-3 rounded-xl bg-indigo-500/15 text-indigo-300">
                <Gamepad2 size={24} />
              </span>
              <h2 className="text-2xl font-black">I make games</h2>
              <p className="text-white/60 font-bold flex-1">
                Distribute your games and get discovered across every Outlet on
                Manifold.
              </p>
              <Link
                href="/onboarding/create"
                className="w-full text-center px-4 py-3 rounded-xl bg-white text-black font-black text-sm uppercase tracking-wider hover:bg-white/90 transition-colors"
              >
                Create a Studio
              </Link>
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
              <span className="w-fit p-3 rounded-xl bg-emerald-500/15 text-emerald-300">
                <Store size={24} />
              </span>
              <h2 className="text-2xl font-black">I sell games</h2>
              <p className="text-white/60 font-bold flex-1">
                Open an Outlet and earn by curating games for your audience.
              </p>
              <Link
                href="/store/new"
                className="w-full text-center px-4 py-3 rounded-xl bg-emerald-500 text-black font-black text-sm uppercase tracking-wider hover:bg-emerald-400 transition-colors"
              >
                Create an Outlet
              </Link>
            </div>
          </div>

          <div className="text-center">
            <Link
              href="/store"
              className="text-sm font-bold text-white/50 hover:text-white transition-colors underline underline-offset-4"
            >
              I&apos;ll decide later, take me to Manifold
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
