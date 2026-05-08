import { LucideProps } from "lucide-react";

export function MetaTag({
  icon: Icon,
  label,
  active,
}: {
  icon: React.ComponentType<LucideProps>;
  label: string;
  active: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-300 ${
        active
          ? "bg-white/10 border-white/20 text-white"
          : "bg-white/5 border-white/5 text-white/40 grayscale opacity-60"
      }`}
    >
      <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
      <span className="text-sm font-bold tracking-tight">{label}</span>
    </div>
  );
}
