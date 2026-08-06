export interface PaginationApi {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// The Previous/Next block copy-pasted across the backoffice tables, extracted
// because four sale surfaces needed it in the same change. Renders nothing when
// there is only one page, so callers can drop it in unconditionally.
export function Pagination({
  pagination,
  onPageChange,
}: {
  pagination?: PaginationApi;
  onPageChange: (updater: (page: number) => number) => void;
}) {
  if (!pagination || pagination.pages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-3">
      <button
        disabled={pagination.page <= 1}
        onClick={() => onPageChange((page) => Math.max(1, page - 1))}
        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm font-bold text-white/70 disabled:opacity-30"
      >
        Previous
      </button>
      <span className="text-sm font-bold text-white/50">
        Page {pagination.page} of {pagination.pages}
      </span>
      <button
        disabled={pagination.page >= pagination.pages}
        onClick={() => onPageChange((page) => page + 1)}
        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm font-bold text-white/70 disabled:opacity-30"
      >
        Next
      </button>
    </div>
  );
}
