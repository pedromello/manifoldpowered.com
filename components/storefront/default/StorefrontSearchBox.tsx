import Form from "next/form";
import { Search } from "lucide-react";

/**
 * A `next/form` GET rather than a controlled input: submitting navigates to a
 * real URL, so a search result is shareable and works with JS disabled.
 */
export function StorefrontSearchBox({
  action,
  defaultQuery,
  category,
}: {
  action: string;
  defaultQuery: string;
  /** Carried through as a hidden field so searching does not drop the filter. */
  category: string | null;
}) {
  return (
    <Form action={action} className="relative w-full md:w-80 group">
      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/40 group-focus-within:text-white transition-colors">
        <Search size={20} />
      </div>
      <input
        type="text"
        name="q"
        data-storefront="search"
        defaultValue={defaultQuery}
        placeholder="Search games..."
        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-base md:text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 focus:bg-white/10 transition-all shadow-inner"
      />
      {category && <input type="hidden" name="category" value={category} />}
    </Form>
  );
}
