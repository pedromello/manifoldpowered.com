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
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-3xl md:text-4xl font-black leading-tight">
          Ship once. Reach every Outlet.
        </h2>
        <p className="mt-3 text-white/60 font-bold">
          Create a Studio to distribute your games and get discovered across the
          whole Manifold network.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {BENEFITS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 p-1.5 rounded-lg bg-indigo-500/15 text-indigo-300">
              <Icon size={16} />
            </span>
            <span className="text-sm font-bold text-white/80">{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
