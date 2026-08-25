import { TrendingUp, Users, Sparkles } from "lucide-react";

// CEO-approved Outlet value proposition. Reused on the Outlet-creation flow
// (and available for the post-signup onboarding hub) so new sellers see why
// an Outlet is worth opening before they fill out the form.
const BENEFITS = [
  {
    icon: TrendingUp,
    text: "Earn on every sale you drive, across the entire Manifold catalog",
  },
  {
    icon: Users,
    text: "Curate a storefront that matches your audience, no inventory required",
  },
  {
    icon: Sparkles,
    text: "Get paid for discovery — your picks become your revenue",
  },
];

export function OutletValueProp() {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-fuchsia-300">
          For curators and creators
        </p>
        <h2 className="text-3xl font-black leading-[1.05] tracking-tight md:text-4xl">
          Turn your taste into income.
        </h2>
        <p className="mt-4 max-w-md text-sm font-medium leading-relaxed text-white/55">
          Launch an Outlet and earn by selling and curating games to the
          audience you already have.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {BENEFITS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 rounded-lg bg-fuchsia-500/15 p-1.5 text-fuchsia-300">
              <Icon size={16} />
            </span>
            <span className="text-sm font-semibold leading-relaxed text-white/75">
              {text}
            </span>
          </li>
        ))}
      </ul>

      <p className="border-t border-white/[0.08] pt-6 text-sm font-medium leading-relaxed text-white/45">
        An Outlet is your own storefront on Manifold. You choose the games, you
        build the audience, and you earn on what you sell — no inventory and no
        upfront cost. Every Outlet is powered by the shared Manifold catalog, so
        you can start selling in minutes.
      </p>
    </div>
  );
}
