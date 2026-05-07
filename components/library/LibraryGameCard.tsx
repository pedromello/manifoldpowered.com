import { useState } from "react";
import useSWR from "swr";
import {
  ChevronDown,
  Calendar,
  Download,
} from "lucide-react";
import { DownloadSection, type GameFile } from "./DownloadSection";
import { type GameApi } from "components/store/GameListItem";

export function LibraryGameCard({ gameItem }: { gameItem: { id: string, acquired_at: string, game: GameApi } }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const game = gameItem.game;

  const acquiredDate = new Date(gameItem.acquired_at).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  );

  const {
    data: files,
    error,
    isLoading,
  } = useSWR<GameFile[]>(`/api/v1/games/${game.slug}/files`, (url) =>
    fetch(url).then((res) => {
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    }),
  );

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    if (downloadingId) return;
    setDownloadingId(fileId);

    try {
      const res = await fetch(`/api/v1/library/download/${fileId}`);
      if (!res.ok) throw new Error("Failed to get download URL");

      const { download_url } = await res.json();

      const a = document.createElement("a");
      a.href = download_url;
      a.target = "_blank";
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert("There was an error initiating the download.");
    } finally {
      setDownloadingId(null);
    }
  };

  const defaultGradient =
    "linear-gradient(135deg, var(--color-purple-dark) 0%, rgba(53,34,89,0.7) 100%)";

  return (
    <div
      className={`flex flex-col rounded-3xl border transition-all duration-300 overflow-hidden ${isExpanded ? "bg-white/10 border-white/20 shadow-[0_0_40px_rgba(165,180,252,0.15)]" : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 hover:-translate-y-1"}`}
    >
      {/* Header / Main Card */}
      <div
        className="flex flex-col sm:flex-row items-stretch cursor-pointer p-0 sm:p-4 gap-4"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div
          className="w-full sm:w-48 md:w-64 aspect-[16/9] sm:aspect-video sm:rounded-2xl overflow-hidden shrink-0 border-b sm:border border-white/10 relative"
          style={{
            background: game.media?.banner
              ? `url(${game.media.banner}) center/cover no-repeat`
              : defaultGradient,
          }}
        >
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
        </div>

        <div className="flex flex-col sm:flex-row justify-between flex-1 p-4 sm:p-0 min-w-0 gap-4 sm:gap-6">
          {/* Left Column: Title, Developer, and Acquired date at the bottom */}
          <div className="flex flex-col justify-between flex-1 min-w-0">
            <div className="flex flex-col gap-1">
              <h3 className="text-xl sm:text-2xl font-black text-white truncate">
                {game.title}
              </h3>
              <span className="text-sm text-white/50 font-bold uppercase tracking-widest">
                {game.developer_name}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-white/40 mt-3 sm:mt-0">
              <Calendar size={14} />
              <span>Acquired {acquiredDate}</span>
            </div>
          </div>

          {/* Right Column: Download button or accordion trigger */}
          <div className="flex items-center justify-center sm:justify-end w-full sm:w-auto mt-4 sm:mt-0 shrink-0">
            {files?.length === 1 ? (
              <button
                onClick={(e) => handleDownload(e, files[0].id)}
                disabled={downloadingId === files[0].id}
                className="flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 h-9 rounded-lg font-black uppercase text-xs tracking-wider transition-transform hover:scale-105 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 shrink-0"
                style={{ backgroundColor: "#FFB400", color: "#1D0F3B" }}
              >
                {downloadingId === files[0].id ? (
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-current"></div>
                ) : (
                  <Download size={14} />
                )}
                Download
              </button>
            ) : (
              <div
                className={`flex items-center justify-center w-full sm:w-9 h-9 rounded-lg sm:rounded-full bg-white/5 border border-white/10 text-white/60 transition-colors duration-300 shrink-0 ${isExpanded ? "bg-white/10 text-white" : ""}`}
              >
                <span className="sm:hidden text-xs font-black uppercase tracking-wider mr-2">
                  {isExpanded ? "Hide Files" : "View Files"}
                </span>
                <div
                  className={`transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                >
                  <ChevronDown size={18} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Accordion Content */}
      <div
        className={`transition-all duration-500 ease-in-out ${isExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="p-6 pt-2 border-t border-white/10 bg-black/20">
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-black uppercase tracking-widest text-white/40 mb-2">
              Game Files
            </h4>
            <DownloadSection
              files={files}
              isLoading={isLoading}
              error={error}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
