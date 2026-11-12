// Regression test for .claude/hooks/guard.mjs: node scripts/test-guard.cjs [guard.mjs]. Exit 0 = all pass.
const { execFileSync } = require("child_process");
const g = process.argv[2] || require("path").join(__dirname, "..", ".claude", "hooks", "guard.mjs");
const cases = [
  [0, 'git commit -q -m "mentions git clean -fdx, reset --hard and push --force origin main"'],
  [0, "git commit -q -F - <<'EOF'\nmentions git clean -fdx and vercel --prod\nEOF"],
  [0, 'gh pr create --title "x" --body "never run vercel --prod or cat .env.local"'],
  [0, "git push origin overnight"],
  [0, "git push -u origin overnight"],
  [0, "node --env-file=.env.local scripts/seed.mjs"],
  [0, "rm -rf node_modules .next"],
  [0, "rm -rf /c/Users/andre/AppData/Local/Temp/claude/x/wt"],
  [0, "npm run build"],
  [0, "grep -n foo src/app/page.tsx"],
  [2, "git push --force origin overnight"],
  [2, "git push origin main"],
  [2, "git push origin HEAD:main"],
  [2, "git reset --hard HEAD~1"],
  [2, "git clean -fdx"],
  [2, "cat .env.local"],
  [2, "Get-Content .env.local"],
  [2, 'cat ".env.local"'],
  [2, "type .env.local | findstr KEY"],
  [2, "vercel deploy --prod --yes"],
  [2, 'rm -rf "C:/Users/andre/Documents"'],
  [2, "rm -rf /c/Users/andre/Documents"],
  [2, "rm -rf /"],
  [2, 'git commit -m "x"; git push -f origin overnight'],
];
let bad = 0;
const run = (input) => { try { execFileSync("node", [g], { input, stdio: ["pipe", "ignore", "ignore"] }); return 0; } catch (e) { return e.status; } };
for (const [want, cmd] of cases) {
  const got = run(JSON.stringify({ tool_input: { command: cmd } }));
  if (got !== want) bad++;
  console.log(`${got === want ? "ok  " : "FAIL"} want ${want} got ${got} :: ${cmd.replace(/\n/g, " / ").slice(0, 70)}`);
}
const m = run("not json");
if (m !== 2) bad++;
console.log(`${m === 2 ? "ok  " : "FAIL"} malformed input -> ${m}`);
console.log(bad ? `${bad} FAILED` : "ALL PASS");
process.exit(bad ? 1 : 0);
