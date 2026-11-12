// StopFailure / PermissionDenied logger. Appends the raw hook input to .verify/failures.jsonl
// so the morning handoff can list every API failure and auto-mode denial.
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
try {
  const raw = readFileSync(0, "utf8");
  let input = {};
  try { input = JSON.parse(raw || "{}"); } catch { input = { raw }; }
  mkdirSync(join(root, ".verify"), { recursive: true });
  appendFileSync(join(root, ".verify", "failures.jsonl"), JSON.stringify({ time: new Date().toISOString(), ...input }) + "\n");
} catch {}
process.exit(0);
