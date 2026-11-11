import { homedir } from "node:os";
import { join, sep } from "node:path";
import type { Aggregator, Tokens } from "../aggregate.js";
import { findJsonl, readJsonl } from "../jsonl.js";

export function claudeDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

/** Reads Claude Code transcripts under <dir>/projects. Returns the number of files read. */
export async function readClaude(agg: Aggregator, dir = claudeDir()): Promise<number> {
  const files = await findJsonl(join(dir, "projects"));
  for (const file of files) {
    // Subagent transcripts run inside a parent session: count their tokens and tools, not their time.
    const isSubagent = file.includes(`${sep}subagents${sep}`);
    await readFile(agg, file, isSubagent);
  }
  return files.length;
}

async function readFile(agg: Aggregator, file: string, isSubagent: boolean) {
  const session = agg.session("claude");
  // A message is written once per content block, each line repeating the usage so far: keep the last.
  const usages = new Map<string, { model: string; tokens: Tokens; ts: number }>();

  for await (const o of readJsonl(file)) {
    const ts = typeof o.timestamp === "string" ? Date.parse(o.timestamp) : NaN;
    if (!isFinite(ts)) continue;
    const msg = o.message;

    if (o.type === "assistant" && msg && typeof msg === "object") {
      if (!isSubagent) {
        session.setProject(o.cwd);
        session.tick(ts);
      }
      const model = typeof msg.model === "string" ? msg.model : "";
      const u = msg.usage;
      if (u && model && model !== "<synthetic>") {
        usages.set(String(msg.id ?? o.uuid), {
          model,
          ts,
          tokens: {
            input: num(u.input_tokens),
            output: num(u.output_tokens),
            cacheRead: num(u.cache_read_input_tokens),
            cacheWrite: num(u.cache_creation_input_tokens),
          },
        });
      }
      if (Array.isArray(msg.content)) {
        for (const b of msg.content) {
          if (b && b.type === "tool_use" && typeof b.name === "string") agg.tool(b.id, b.name, ts);
        }
      }
    } else if (o.type === "user") {
      if (!isSubagent) {
        session.setProject(o.cwd);
        session.tick(ts);
        if (!o.isMeta && !o.isSidechain && isHumanPrompt(msg)) agg.prompt(ts);
      }
      const r = o.toolUseResult;
      if (r && typeof r === "object" && Array.isArray(r.structuredPatch)) {
        const [added, removed] = countPatch(r);
        agg.edit(r.filePath, added, removed, ts);
      }
    }
  }

  for (const [id, u] of usages) agg.usage("claude", id, u.model, u.tokens, u.ts);
  if (!isSubagent) session.end();
}

function isHumanPrompt(msg: any): boolean {
  const c = msg?.content;
  if (typeof c === "string") return c.trim().length > 0;
  return Array.isArray(c) && c.some((b) => b?.type === "text") && !c.some((b) => b?.type === "tool_result");
}

function countPatch(r: any): [number, number] {
  let added = 0;
  let removed = 0;
  for (const hunk of r.structuredPatch) {
    if (!Array.isArray(hunk?.lines)) continue;
    for (const line of hunk.lines) {
      if (typeof line !== "string") continue;
      if (line[0] === "+") added++;
      else if (line[0] === "-") removed++;
    }
  }
  // A brand-new file has an empty patch; its whole content counts as added.
  if (!added && !removed && r.type === "create" && typeof r.content === "string" && r.content) {
    added = r.content.split("\n").length;
  }
  return [added, removed];
}
