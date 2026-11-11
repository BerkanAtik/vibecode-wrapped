import { homedir } from "node:os";
import { join } from "node:path";
import type { Aggregator } from "../aggregate.js";
import { findJsonl, readJsonl } from "../jsonl.js";

export function codexDir(): string {
  return process.env.CODEX_HOME || join(homedir(), ".codex");
}

const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);
const TOOL_CALLS = new Set(["function_call", "custom_tool_call", "local_shell_call"]);

/** Reads Codex rollout files under <dir>/sessions and archived_sessions. Returns the number of files read. */
export async function readCodex(agg: Aggregator, dir = codexDir()): Promise<number> {
  const files = [
    ...(await findJsonl(join(dir, "sessions"))),
    ...(await findJsonl(join(dir, "archived_sessions"))),
  ];
  for (const file of files) await readFile(agg, file);
  return files.length;
}

async function readFile(agg: Aggregator, file: string) {
  const session = agg.session("codex");
  let model = "codex";

  for await (const o of readJsonl(file)) {
    const ts = typeof o.timestamp === "string" ? Date.parse(o.timestamp) : NaN;
    if (!isFinite(ts)) continue;
    const p = o.payload;
    if (!p || typeof p !== "object") continue;
    session.tick(ts);

    if (o.type === "session_meta") {
      session.setProject(p.cwd);
    } else if (o.type === "turn_context") {
      session.setProject(p.cwd);
      if (typeof p.model === "string" && p.model) model = p.model;
    } else if (o.type === "event_msg") {
      if (p.type === "task_started") {
        agg.prompt(ts);
      } else if (p.type === "token_count") {
        const u = p.info?.last_token_usage;
        if (u) {
          // Codex reports cached tokens as part of input_tokens.
          const cached = num(u.cached_input_tokens);
          agg.usage("codex", undefined, model, {
            input: Math.max(0, num(u.input_tokens) - cached),
            output: num(u.output_tokens),
            cacheRead: cached,
            cacheWrite: num(u.cache_write_input_tokens),
          }, ts);
        }
      }
    } else if (o.type === "response_item" && TOOL_CALLS.has(p.type)) {
      const name = typeof p.name === "string" && p.name ? p.name : "shell";
      agg.tool(p.call_id ?? p.id, name, ts);
      if (name === "apply_patch" && typeof p.input === "string") countPatch(agg, p.input, ts);
    }
  }
  session.end();
}

/** Counts added/removed lines per file in Codex's "*** Update File: x" patch format. */
function countPatch(agg: Aggregator, patch: string, ts: number) {
  let file = "";
  let added = 0;
  let removed = 0;
  const flush = () => {
    if (file) agg.edit(file, added, removed, ts);
    added = removed = 0;
  };
  for (const line of patch.split("\n")) {
    const header = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/.exec(line);
    if (header) {
      flush();
      file = header[1].trim();
    } else if (line[0] === "+") added++;
    else if (line[0] === "-") removed++;
  }
  flush();
}
