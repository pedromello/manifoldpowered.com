import { User, Users, Gamepad2 } from "lucide-react";
import { readGameFeatures } from "lib/game_features";
import { useI18n } from "lib/i18n";
import { MetaTag } from "components/store/MetaTag";

export function GameFeatures({ meta }: { meta: unknown }) {
  const { t } = useI18n();
  const features = readGameFeatures(meta);
  if (!features.single_player && !features.multiplayer && !features.controller)
    return null;
  return (
    <div className="flex flex-col gap-3">
      <h4 className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">
        {t("Features")}
      </h4>
      <div className="grid grid-cols-1 gap-2">
        {features.single_player && (
          <MetaTag icon={User} label={t("Single Player")} active />
        )}
        {features.multiplayer && (
          <MetaTag icon={Users} label={t("Multiplayer")} active />
        )}
        {features.controller && (
          <MetaTag
            icon={Gamepad2}
            label={t(
              features.controller === "partial"
                ? "Partial controller support"
                : "Full controller support",
            )}
            active
          />
        )}
      </div>
      {features.players && (
        <div className="text-xs leading-5 text-white/60">
          {(["system", "local", "online"] as const).map((mode) => {
            const range = features.players?.[mode];
            if (!range || (range.min == null && range.max == null)) return null;
            const count =
              range.min != null && range.max != null
                ? range.min === range.max
                  ? String(range.min)
                  : `${range.min}–${range.max}`
                : range.min != null
                  ? t("At least {count}", { count: range.min })
                  : t("Up to {count}", { count: range.max! });
            return (
              <p key={mode}>
                {t(
                  mode === "system"
                    ? "On one console"
                    : mode === "local"
                      ? "Local wireless"
                      : "Online players",
                )}
                : {count}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
