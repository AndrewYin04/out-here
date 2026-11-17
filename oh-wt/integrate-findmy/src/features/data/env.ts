// Server-side Supabase settings. DATA_TARGET=dev|demo (default dev) picks the variable set:
// dev reads the *_DEV names, demo the plain names. There is no fallback from dev to demo, so
// a missing dev key never makes a test write to the demo database.
// OUTHERE_STORE=memory forces the MemoryStore even when Supabase is configured.

export type SupabaseEnv = { target: 'dev' | 'demo'; url: string; serviceKey: string; anonKey: string | null };

const read = (name: string): string | undefined => {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};

export function supabaseEnv(): SupabaseEnv | null {
  if (read('OUTHERE_STORE') === 'memory') return null;
  const target = read('DATA_TARGET') === 'demo' ? 'demo' : 'dev';
  const sfx = target === 'demo' ? '' : '_DEV';
  const url = read(`NEXT_PUBLIC_SUPABASE_URL${sfx}`);
  const serviceKey = read(`SUPABASE_SERVICE_ROLE_KEY${sfx}`);
  if (!url || !serviceKey) return null;
  return { target, url, serviceKey, anonKey: read(`NEXT_PUBLIC_SUPABASE_ANON_KEY${sfx}`) ?? null };
}
