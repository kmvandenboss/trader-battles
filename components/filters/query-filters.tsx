"use client";

/**
 * QueryFilters — a small, reusable filter bar that drives server-component
 * pages purely through URL search params. Changing a control pushes an updated
 * querystring; the server component re-reads `searchParams` and re-queries the
 * repositories. No client-side data state, and (crucially) no scores, ratings,
 * or standings are ever computed here — this only narrows what the server
 * already computed.
 */

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterField {
  paramKey: string;
  label: string;
  /** Real options; an "All" entry is prepended automatically. */
  options: FilterOption[];
  allLabel?: string;
}

export interface DateRangeField {
  fromKey: string;
  toKey: string;
  label: string;
}

interface QueryFiltersProps {
  fields: FilterField[];
  dateRange?: DateRangeField;
}

const selectClass =
  "h-8 rounded-md border border-border bg-secondary/40 px-2 text-sm text-foreground outline-none transition-colors hover:bg-secondary/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

export function QueryFilters({ fields, dateRange }: QueryFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );

  const anyActive =
    fields.some((f) => searchParams.get(f.paramKey)) ||
    (dateRange
      ? Boolean(
          searchParams.get(dateRange.fromKey) ||
            searchParams.get(dateRange.toKey),
        )
      : false);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <span className="mb-1 flex items-center gap-1.5 self-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Filter className="size-3.5" aria-hidden />
        Filter
      </span>

      {fields.map((field) => {
        const current = searchParams.get(field.paramKey) ?? "";
        return (
          <label key={field.paramKey} className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              {field.label}
            </span>
            <select
              aria-label={field.label}
              className={selectClass}
              value={current}
              onChange={(e) => setParam(field.paramKey, e.target.value)}
            >
              <option value="">{field.allLabel ?? "All"}</option>
              {field.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        );
      })}

      {dateRange ? (
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              {dateRange.label} from
            </span>
            <input
              type="date"
              aria-label={`${dateRange.label} from`}
              className={selectClass}
              value={searchParams.get(dateRange.fromKey) ?? ""}
              onChange={(e) => setParam(dateRange.fromKey, e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">to</span>
            <input
              type="date"
              aria-label={`${dateRange.label} to`}
              className={selectClass}
              value={searchParams.get(dateRange.toKey) ?? ""}
              onChange={(e) => setParam(dateRange.toKey, e.target.value)}
            />
          </label>
        </div>
      ) : null}

      {anyActive ? (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="mb-px inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
          Clear
        </button>
      ) : null}
    </div>
  );
}
