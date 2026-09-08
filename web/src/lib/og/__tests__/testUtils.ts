import { vi } from 'vitest';

// A minimal fluent mock of the Supabase query builder used by og/fetchers.ts.
// Each chain method records what was called and returns `this`; the terminal
// `.maybeSingle()` resolves with whatever this table was configured to
// return. Good enough for asserting *what our code asked for* (columns,
// filters) — whether Postgres actually enforces those filters is what the
// real RLS policies (read directly from the migrations during the sharing
// audit) are responsible for, not this mock.

export interface TableResponse {
  data: unknown;
  error: unknown | null;
}

export interface RecordedCall {
  table: string;
  select: string | null;
  eq: Array<[string, unknown]>;
  order: Array<[string, { ascending?: boolean }]>;
  limit: number | null;
}

export function makeOgClientMock(responses: Record<string, TableResponse>) {
  const calls: RecordedCall[] = [];

  function from(table: string) {
    const call: RecordedCall = { table, select: null, eq: [], order: [], limit: null };
    calls.push(call);

    const builder = {
      select(cols: string) {
        call.select = cols;
        return builder;
      },
      eq(col: string, val: unknown) {
        call.eq.push([col, val]);
        return builder;
      },
      order(col: string, opts: { ascending?: boolean }) {
        call.order.push([col, opts]);
        return builder;
      },
      limit(n: number) {
        call.limit = n;
        return builder;
      },
      maybeSingle() {
        const resp = responses[table] ?? { data: null, error: null };
        return Promise.resolve(resp);
      },
    };
    return builder;
  }

  return { client: { from: vi.fn(from) }, calls };
}
