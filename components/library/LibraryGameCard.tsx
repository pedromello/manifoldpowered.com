import { useState } from "react";
import useSWR from "swr";
import { Calendar, ChevronDown, Download } from "lucide-react";

import { DownloadSection, type GameFile } from "./DownloadSection";
import type { GameApi } from "components/store/types";

export function LibraryGameCard({
  gameItem,
}: {
  gameItem: { id: string; acquired_at: string; game: GameApi };
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const game = gameItem.game;
  const acquiredDate = new Date(gameItem.acquired_at).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" },
  );

  const {
    data: files,
    error,
    isLoading,
  } = useSWR<GameFile[]>(`/api/v1/games/${game.slug}/files`, (url) =>
    fetch(url).then((response) => {
      if (!response.ok) throw new Error("Failed to fetch files");
      return response.json();
    }),
  );

  const handleDownload = async (event: React.MouseEvent, fileId: string) => {
    event.stopPropagation();
    if (downloadingId) return;
    setDownloadingId(fileId);

    try {
      const response = await fetch(`/api/v1/library/download/${fileId}`);
      if (!response.ok) throw new Error("Failed to get download URL");
      const { download_url } = await response.json();
      const anchor = document.createElement("a");
      anchor.href = download_url;
      anchor.target = "_blank";
      anchor.download = "";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (downloadError) {
      console.error(downloadError);
      alert("There was an error initiating the download.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <article className="overflow-hidden rounded-xl border border-white/[0.09] bg-[#14101c] transition-colors hover:border-white/20">
      <div className="flex flex-col sm:flex-row">
        <div className="aspect-[920/430] w-full shrink-0 overflow-hidden bg-[#21182f] sm:w-52">
          {game.media?.banner ? (
            // Game banners may be hosted outside Next's image allowlist.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={game.media.banner}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-[linear-gradient(135deg,#28183b,#15101d)]" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-5 p-5">
          <div className="min-w-0">
            <h3 className="truncate text-xl font-bold">{game.title}</h3>
            <p className="mt-1 truncate text-sm text-white/40">
              {game.developer_name}
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-xs text-white/35">
              <Calendar size={14} />
              Added {acquiredDate}
            </p>

            {files?.length === 1 ? (
              <button
                onClick={(event) => handleDownload(event, files[0].id)}
                disabled={downloadingId === files[0].id}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 text-xs font-bold disabled:cursor-progress disabled:opacity-60"
              >
                <Download size={14} />
                {downloadingId === files[0].id ? "Preparing..." : "Download"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsExpanded((current) => !current)}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/10 px-4 text-xs font-semibold text-white/55 hover:border-white/20 hover:text-white"
                aria-expanded={isExpanded}
              >
                {isExpanded ? "Hide files" : "View files"}
                <ChevronDown
                  size={15}
                  className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-white/[0.08] bg-black/15 p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-white/30">
            Available files
          </p>
          <DownloadSection files={files} isLoading={isLoading} error={error} />
        </div>
      )}
    </article>
  );
}
