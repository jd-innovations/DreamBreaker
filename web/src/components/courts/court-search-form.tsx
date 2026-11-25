import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { INPUT_TEXT } from "@/components/ui/field-classes";
import { cn } from "@/lib/utils";

/** A plain GET form to /courts?q=, so search works without JavaScript and every result page has a URL. */
export function CourtSearchForm({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <form action="/courts" method="get" role="search" className="flex gap-2">
      <label htmlFor="courts-q" className="sr-only">City, ZIP or court name</label>
      <div className="relative flex-1">
        <MagnifyingGlass size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          id="courts-q"
          name="q"
          type="search"
          defaultValue={defaultValue}
          maxLength={120}
          placeholder="City, ZIP or court name"
          className={cn(INPUT_TEXT, "h-11 w-full rounded-xl border border-border bg-secondary pl-10 pr-3")}
        />
      </div>
      <button
        type="submit"
        className="h-11 shrink-0 rounded-xl bg-primary px-5 font-semibold text-primary-foreground transition hover:bg-primary/90"
      >
        Search
      </button>
    </form>
  );
}
