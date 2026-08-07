import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://cdtndyhouwvhszlpedmw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkdG5keWhvdXd2aHN6bHBlZG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNTI5ODYsImV4cCI6MjA5NTcyODk4Nn0.zUaqJrq-RfIv5gcHrgDIh3VlGmI0B5AsYayjcryOoVE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Pagination helper ──────────────────────────────────────────────
// Supabase/PostgREST silently caps any query at 1000 rows by default.
// Once a table (ledger, attendance, etc.) grows past 1000 rows, plain
// `.select()` calls start missing older or newer rows depending on
// order — which is exactly what caused "old attendance missing" and
// "balance not updating" once data grew. This helper pages through
// with `.range()` until every row has been fetched.
//
// Usage:
//   const rows = await fetchAllRows((from, to) =>
//     supabase.from("ledger").select("*").is("deleted_at", null).range(from, to)
//   );
export async function fetchAllRows(queryFactory, pageSize = 1000) {
  let from = 0;
  let all = [];
  while (true) {
    const { data, error } = await queryFactory(from, from + pageSize - 1);
    if (error) {
      console.error("fetchAllRows error:", error);
      break;
    }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
