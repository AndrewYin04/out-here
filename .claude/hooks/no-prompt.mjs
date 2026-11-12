// PermissionRequest hook. When .verify/ARMED exists (unattended run), every permission
// prompt is denied and logged instead of waiting for a human. Without ARMED it stays silent,
// so prompts reach the person at the keyboard.
import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
try {
  if (!existsSync(join(root, ".verify", "ARMED"))) process.exit(0);
  let input = {};
  try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch {}
  mkdirSync(join(root, ".verify"), { recursive: true });
  appendFileSync(
    join(root, ".verify", "prompts.jsonl"),
    JSON.stringify({ time: new Date().toISOString(), tool_name: input.tool_name, tool_input: input.tool_input }) + "\n",
  );
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: {
        behavior: "deny",
        message: "Unattended run, no human available. Log this in docs/PROGRESS.md under Known issues, take the default, and continue with other work.",
      },
    },
  }));
  process.exit(0);
} catch {
  process.exit(0);
}
