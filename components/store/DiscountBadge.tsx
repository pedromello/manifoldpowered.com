import { discountBadgeColor } from "./constants";

export function DiscountBadge({
  label,
  color = discountBadgeColor,
  size = "normal",
  flat = false,
}: {
  label: string;
  color?: string;
  size?: "normal" | "small";
  flat?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md font-black leading-none text-black shadow-lg ${
        size === "small" ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-xs"
      }`}
      style={{
        backgroundColor: color,
        boxShadow: flat ? "none" : `0 0 20px ${color}66`,
      }}
    >
      {label}
    </span>
  );
}
