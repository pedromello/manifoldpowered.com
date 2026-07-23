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
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-3xl md:text-4xl font-black leading-tight">
          Turn your taste into income.
        </h2>
        <p className="mt-3 text-white/60 font-bold">
          Launch an Outlet and earn by selling and curating games to the
          audience you already have.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {BENEFITS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 p-1.5 rounded-lg bg-emerald-500/15 text-emerald-300">
              <Icon size={16} />
            </span>
            <span className="text-sm font-bold text-white/80">{text}</span>
          </li>
        ))}
      </ul>

      <p className="text-sm font-bold text-white/50 leading-relaxed border-t border-white/10 pt-6">
        An Outlet is your own storefront on Manifold. You choose the games, you
        build the audience, and you earn on what you sell — no inventory and no
        upfront cost. Every Outlet is powered by the shared Manifold catalog, so
        you can start selling in minutes.
      </p>
    </div>
  );
}
