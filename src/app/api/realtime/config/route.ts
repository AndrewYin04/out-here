import { supabaseEnv } from '@/features/data/server';
import { json } from '@/lib/api';

export const dynamic = 'force-dynamic';

// GET /api/realtime/config -> { mode: 'supabase', url, key } | { mode: 'sse' }
// key is the publishable (anon) key, which is meant for browsers; RLS has no anon policies.
export function GET() {
  const env = supabaseEnv();
  if (env && env.anonKey) return json({ mode: 'supabase', url: env.url, key: env.anonKey });
  return json({ mode: 'sse' });
}
