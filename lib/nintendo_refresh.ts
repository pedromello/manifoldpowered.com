export interface NintendoRefreshInfo {
  operation_id: string;
  state: "updated" | "cached" | "in_progress" | "failed";
  last_completed_at: string | null;
  next_allowed_at: string | null;
  message?: string;
}
