import { UploadCloud, Search, Users } from "lucide-react";

// CEO-approved Studio value proposition. Shown on the Studio-creation flow so
// developers understand the distribution/discovery upside before committing.
const BENEFITS = [
  {
    icon: UploadCloud,
    text: "Publish once and appear on every Outlet on the platform",
  },
  {
    icon: Search,
    text: "Get discovered by curators actively looking for games to sell",
  },
  {
    icon: Users,
    text: "Reach players everywhere, with purchases, downloads, and progress synced",
  },
];

export function StudioValueProp() {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-violet-300">
          For developers
        </p>
        <h2 className="text-3xl font-black leading-[1.05] tracking-tight md:text-4xl">
          Ship once. Reach every Outlet.
        </h2>
        <p className="mt-4 max-w-md text-sm font-medium leading-relaxed text-white/55">
          Create a Studio to distribute your games and get discovered across the
          whole Manifold network.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {BENEFITS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 rounded-lg bg-violet-500/15 p-1.5 text-violet-300">
              <Icon size={16} />
            </span>
            <span className="text-sm font-semibold leading-relaxed text-white/75">
              {text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
