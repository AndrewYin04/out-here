// Creates the public-read Storage buckets the app uploads to, if missing. Idempotent.
// Usage: npm run storage:setup            (dev project)
//        npm run storage:setup -- demo    (demo project; the last dev|demo argument wins)
// Uses the secret key from .env.local (loaded by the npm script). Never prints keys or URLs.
import { createClient } from "@supabase/supabase-js";

const target = process.argv.slice(2).filter((a) => a === "dev" || a === "demo").pop();
const names = {
  dev: ["NEXT_PUBLIC_SUPABASE_URL_DEV", "SUPABASE_SERVICE_ROLE_KEY_DEV"],
  demo: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
}[target];
if (!names) {
  console.error("usage: node scripts/storage-setup.mjs <dev|demo>");
  process.exit(2);
}
const missing = names.filter((n) => !process.env[n]);
if (missing.length) {
  console.error(`${missing.join(", ")}: MISSING`);
  process.exit(2);
}

const BUCKETS = [
  { id: "memories", note: "crew album photos" },
  { id: "uploads", note: "feed post photos" },
];
const OPTIONS = {
  public: true,
  fileSizeLimit: "10MB",
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/gif"],
};

const supabase = createClient(process.env[names[0]], process.env[names[1]], {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: existing, error: listError } = await supabase.storage.listBuckets();
if (listError) {
  console.error(`listBuckets failed: ${listError.message}`);
  process.exit(1);
}
const byId = new Map((existing ?? []).map((b) => [b.id, b]));
let failed = 0;
for (const b of BUCKETS) {
  const found = byId.get(b.id);
  const { error } = found
    ? await supabase.storage.updateBucket(b.id, OPTIONS)
    : await supabase.storage.createBucket(b.id, OPTIONS);
  if (error) {
    failed++;
    console.error(`${b.id}: ${found ? "update" : "create"} failed: ${error.message}`);
  } else {
    console.log(`${b.id}: ${found ? "exists, settings ensured" : "created"} (public read, ${b.note})`);
  }
}
console.log(`storage setup on ${target}: ${BUCKETS.length - failed}/${BUCKETS.length} ok`);
process.exitCode = failed ? 1 : 0;
