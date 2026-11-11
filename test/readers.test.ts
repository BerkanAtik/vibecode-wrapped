import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { Aggregator } from "../src/aggregate.js";
import { readClaude } from "../src/readers/claude.js";
import { readCodex } from "../src/readers/codex.js";
import { buildWrapped } from "../src/stats.js";

const jsonl = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const usage = (output: number) => ({ input_tokens: 10, output_tokens: output, cache_read_input_tokens: 100, cache_creation_input_tokens: 5 });

test("claude: dedupes repeated message lines, counts tools, edits and active time", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aw-claude-"));
  mkdirSync(join(dir, "projects", "p"), { recursive: true });
  const base = { cwd: "C:\\work\\myapp", sessionId: "s1" };
  writeFileSync(
    join(dir, "projects", "p", "s1.jsonl"),
    jsonl([
      { ...base, type: "user", timestamp: "2026-03-01T10:00:00Z", message: { role: "user", content: "fix the bug" } },
      { ...base, type: "assistant", timestamp: "2026-03-01T10:01:00Z", message: { id: "m1", model: "claude-opus-5-5", usage: usage(1), content: [{ type: "text", text: "ok" }] } },
      { ...base, type: "assistant", timestamp: "2026-03-01T10:02:00Z", message: { id: "m1", model: "claude-opus-5-5", usage: usage(50), content: [{ type: "tool_use", id: "t1", name: "Edit", input: {} }] } },
      { ...base, type: "user", timestamp: "2026-03-01T10:03:00Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1" }] }, toolUseResult: { filePath: "C:\\work\\myapp\\src\\auth.ts", structuredPatch: [{ lines: [" a", "+b", "+c", "-d"] }] } },
      // an hour later: a new burst, the gap must not count as work
      { ...base, type: "user", timestamp: "2026-03-01T11:30:00Z", message: { role: "user", content: "thanks" } },
      { ...base, type: "assistant", timestamp: "2025-01-01T00:00:00Z", message: { id: "old", model: "claude-opus-5-5", usage: usage(999), content: [] } },
    ]) + "{ truncated line\n",
  );

  const agg = new Aggregator(Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1));
  await readClaude(agg, dir);
  const w = buildWrapped(agg, "2026");

  expect(w.totals.sessions).toBe(1);
  expect(w.totals.prompts).toBe(2);
  expect(w.totals.outputTokens).toBe(50); // last line of m1 wins, 2025 message excluded
  expect(w.totals.tokens).toBe(165);
  expect(w.tools).toEqual([{ name: "Edit", count: 1 }]);
  expect(w.totals.linesAdded).toBe(2);
  expect(w.totals.linesRemoved).toBe(1);
  expect(w.languages[0].name).toBe(".ts");
  expect(w.totals.activeMinutes).toBe(5); // 10:00-10:03 plus the lone 11:30 minute
  expect(w.projects).toEqual([{ name: "myapp", count: 1 }]);
});

test("codex: reads tokens, tools and apply_patch edits", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aw-codex-"));
  mkdirSync(join(dir, "sessions", "2026", "05", "02"), { recursive: true });
  writeFileSync(
    join(dir, "sessions", "2026", "05", "02", "rollout-x.jsonl"),
    jsonl([
      { timestamp: "2026-05-02T08:00:00Z", type: "session_meta", payload: { cwd: "/home/me/api" } },
      { timestamp: "2026-05-02T08:00:01Z", type: "turn_context", payload: { model: "gpt-5-codex" } },
      { timestamp: "2026-05-02T08:00:02Z", type: "event_msg", payload: { type: "task_started" } },
      { timestamp: "2026-05-02T08:00:30Z", type: "response_item", payload: { type: "custom_tool_call", call_id: "c1", name: "apply_patch", input: "*** Begin Patch\n*** Update File: app/main.py\n@@\n-old\n+new\n+more\n*** End Patch" } },
      { timestamp: "2026-05-02T08:01:00Z", type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 1000, cached_input_tokens: 400, output_tokens: 20 } } } },
    ]),
  );

  const agg = new Aggregator(0, Infinity);
  await readCodex(agg, dir);
  const w = buildWrapped(agg, "all time");

  expect(w.sources.codex.sessions).toBe(1);
  expect(w.totals.prompts).toBe(1);
  expect(w.totals.inputTokens).toBe(600);
  expect(w.totals.cacheTokens).toBe(400);
  expect(w.tools).toEqual([{ name: "apply_patch", count: 1 }]);
  expect(w.totals.linesAdded).toBe(2);
  expect(w.totals.linesRemoved).toBe(1);
  expect(w.models[0].name).toBe("gpt-5-codex");
});

test("missing log folders are not an error", async () => {
  const agg = new Aggregator(0, Infinity);
  expect(await readClaude(agg, join(tmpdir(), "aw-nope"))).toBe(0);
  expect(await readCodex(agg, join(tmpdir(), "aw-nope"))).toBe(0);
});
