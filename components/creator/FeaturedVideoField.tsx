import { FeaturedVideo } from "components/store/FeaturedVideo";
import { youtubeVideo } from "contracts/featured-video";
import { useI18n } from "lib/i18n";

export function FeaturedVideoField({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const video = youtubeVideo(value.trim());
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-3 rounded-xl border border-white/15 p-4 disabled:opacity-50"
    >
      <legend className="px-2 font-bold">{t("Featured YouTube video")}</legend>
      <label className="block text-sm">
        {t("YouTube video URL")}
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="mt-2 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-3 text-sm outline-none focus:border-violet-400"
        />
      </label>
      <p className="text-xs text-white/60">
        {t("Optional. This video becomes public only after publication.")}
      </p>
      {value && !video && (
        <p role="status" className="text-sm text-amber-200">
          {t("Use an HTTPS YouTube watch or youtu.be video URL.")}
        </p>
      )}
      {video && (
        <div className="max-w-md">
          <FeaturedVideo video={video} />
        </div>
      )}
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="min-h-11 rounded-xl border border-white/15 px-4 text-sm"
        >
          {t("Remove video")}
        </button>
      )}
    </fieldset>
  );
}
