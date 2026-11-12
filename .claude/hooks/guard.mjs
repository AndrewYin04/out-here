// PreToolUse guard for Bash and PowerShell. Exit 2 blocks the call; stderr is the reason.
// Fails closed: any internal error also exits 2.
import { readFileSync } from "node:fs";

const block = (why) => {
  process.stderr.write(`guard: blocked (${why}). See .claude/rules/40-safety.md.\n`);
  process.exit(2);
};

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const cmd = String(input?.tool_input?.command ?? "");
  if (!cmd) process.exit(0);

  // git/vercel/env checks ignore heredoc bodies and quoted strings (commit messages,
  // PR bodies), so describing a command never triggers its rule. Recursive-delete
  // checks read the raw command, so quoted paths still count there.
  const noHeredoc = cmd.replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\s*\1\b/g, " ");
  const c = noHeredoc
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'[^']*'/g, "''")
    .replace(/\s+/g, " ");
  const raw = noHeredoc.replace(/\s+/g, " ");

  // git: force pushes, pushes to main, history rewrites, destructive cleans.
  if (/\bgit\b[^;&|]*\bpush\b[^;&|]*(--force\b|--force-with-lease\b|\s-f\b|\s\+[\w./-]+)/i.test(c)) block("force push");
  if (/\bgit\b[^;&|]*\bpush\b[^;&|]*(\s|:)main\b/i.test(c)) block("push to main");
  if (/\bgit\b[^;&|]*\breset\b[^;&|]*--hard\b/i.test(c)) block("git reset --hard");
  if (/\bgit\b[^;&|]*\bclean\b[^;&|]*-[a-z]*f/i.test(c)) block("git clean");
  if (/\bgit\b[^;&|]*\bpush\b[^;&|]*--delete\b/i.test(c)) block("remote branch delete");

  // Vercel: previews only overnight.
  if (/\bvercel\b[^;&|]*--prod\b/i.test(c)) block("vercel --prod (previews only)");

  // Secrets: no reading env files. `node --env-file=.env.local` (loads, never prints) is allowed.
  // Quoted strings containing whitespace are prose (messages); short quoted paths stay.
  const prose = (q) => (/\s/.test(q) ? (q[0] + q[0]) : q);
  const stripped = raw
    .replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, prose)
    .replace(/--env-file[= ]\S*\.env[\w.]*/gi, "");
  if (/\b(cat|type|get-content|gc|head|tail|less|more|grep|rg|sed|awk|findstr|select-string|cp|copy|copy-item|mv|move|xxd|od|strings|base64|bat)\b[^;&|]*\.env(\.local|\.production)?\b/i.test(stripped)) block("reading an env file");
  if (/\bvercel\b[^;&|]*\benv\b[^;&|]*\bpull\b/i.test(c)) block("vercel env pull");

  // Recursive deletes outside the repo / scratch dirs.
  const del = /\b(rm\s+-[a-z]*r[a-z]*|remove-item\b[^;&|]*-recurse|rmdir\s+\/s|rd\s+\/s)\s+([^;&|]+)/i.exec(raw);
  if (del) {
    const target = del[2].toLowerCase();
    const safe = /(out-here|appdata[\\/]+local[\\/]+temp|\/tmp\/|\$tmp|node_modules|\.next|\.verify|test-results|playwright-report|oh-wt|oh-scaffold)/.test(target);
    const relative = !/^\s*["']?([a-z]:|\/|~|\\|\.\.)/.test(target);
    if (!safe && !relative) block("recursive delete outside the repo");
    if (/^\s*["']?(\/|~|[a-z]:[\\/]?)\s*["']?\s*$/.test(target)) block("recursive delete of a root");
  }
  process.exit(0);
} catch (e) {
  block(`guard error: ${e?.message ?? e}`);
}
