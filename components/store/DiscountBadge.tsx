import { discountBadgeColor } from "./constants";

export function DiscountBadge({
  label,
  color = discountBadgeColor,
  size = "normal",
}: {
  label: string;
  color?: string;
  size?: "normal" | "small";
}) {
  return (
    <span
      className={`py-1 rounded-lg text-xs md:text-lg font-black text-black uppercase tracking-wider shadow-lg transform rotate-2 animate-pulse-glow ${
        size === "small" ? "text-xs py-2 px-1" : "text-sm px-3"
      }`}
      style={{
        backgroundColor: color,
        boxShadow: `0 0 20px ${color}66`,
      }}
    >
      {label && size === "normal" ? `${label} OFF` : label}
    </span>
  );
}
