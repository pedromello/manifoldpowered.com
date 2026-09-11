import { ExternalGameRefreshButton } from "components/store/ExternalGameRefreshButton";
export function NintendoRefreshButton({ url }: { url: string }) {
  return <ExternalGameRefreshButton provider="nintendo" value={url} />;
}
