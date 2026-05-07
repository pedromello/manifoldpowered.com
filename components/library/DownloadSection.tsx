import { useState } from "react";
import useSWR from "swr";
import { Download, HardDrive, Cpu, AlertCircle } from "lucide-react";

export type GameFile = {
  id: string;
  game_id: string;
  display_name: string;
  version: string;
  platform: string;
  file_url: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
};

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function DownloadSection({ files, isLoading, error }: { files: GameFile[] | undefined, isLoading: boolean, error: any }) {

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (fileId: string) => {
    if (downloadingId) return;
    setDownloadingId(fileId);

    try {
      const res = await fetch(`/api/v1/library/download/${fileId}`);
      if (!res.ok) throw new Error("Failed to get download URL");
      
      const { download_url } = await res.json();
      
      // Programmatic download
      const a = document.createElement("a");
      a.href = download_url;
      a.target = "_blank"; // In case it's a cross-origin link
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

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-6 px-4">
        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white/50"></div>
        <span className="text-sm font-bold text-white/50">Checking for files...</span>
      </div>
    );
  }

  if (error || !files) {
    return (
      <div className="flex items-center gap-3 py-6 px-4 text-rose-400">
        <AlertCircle size={20} />
        <span className="text-sm font-bold">Unable to fetch available files.</span>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex items-center gap-3 py-6 px-4 text-white/40">
        <HardDrive size={20} />
        <span className="text-sm font-bold">No files are currently available for this title.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-4">
      {files.map((file) => (
        <div 
          key={file.id} 
          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors gap-4"
        >
          <div className="flex flex-col">
            <span className="font-bold text-white text-lg">{file.display_name}</span>
            <div className="flex items-center gap-4 text-sm text-white/50 mt-1">
              <span className="flex items-center gap-1.5"><Cpu size={14} /> {file.platform}</span>
              <span className="flex items-center gap-1.5"><HardDrive size={14} /> {formatBytes(file.size_bytes)}</span>
              <span>v{file.version}</span>
            </div>
          </div>
          
          <button
            onClick={() => handleDownload(file.id)}
            disabled={downloadingId === file.id}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30 hover:text-white transition-all font-black uppercase text-sm tracking-widest cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {downloadingId === file.id ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-current"></div>
                Starting...
              </>
            ) : (
              <>
                <Download size={18} />
                Download
              </>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
