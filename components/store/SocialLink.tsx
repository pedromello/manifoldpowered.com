import { LucideProps, ExternalLink } from "lucide-react";

export function SocialLink({
  icon: Icon,
  href,
  label,
}: {
  icon: React.ComponentType<LucideProps>;
  href?: string;
  label: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 text-white/60 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all duration-300 group"
      title={label}
    >
      <Icon size={20} className="group-hover:scale-110 transition-transform" />
      <span className="text-sm font-bold">{label}</span>
      <ExternalLink
        size={14}
        className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
      />
    </a>
  );
}
