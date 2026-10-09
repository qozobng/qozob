// =========================================================================
// Read every row of a query, 1,000 at a time.
// Supabase (PostgREST) returns at most 1,000 rows per request, so a plain
// .limit(5000) silently stops at 1,000. Pass a function that applies
// .range(from, to) to the query and this keeps going until a short page.
// =========================================================================

export interface PageError {
  message: string;
  code?: string;
  hint?: string | null;
}

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PageError | null }>,
  { pageSize = 1000, max = 50000 }: { pageSize?: number; max?: number } = {},
): Promise<{ rows: T[]; error: PageError | null; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { rows, error, truncated: false };
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, error: null, truncated: false };
  }
  return { rows, error: null, truncated: true };
}

/** True when the error means "this SQL function / column isn't deployed yet". */
export function isMissingFunction(err: PageError | null | undefined): boolean {
  if (!err) return false;
  return err.code === 'PGRST202' || err.code === '42883' || /could not find the function/i.test(err.message);
}

