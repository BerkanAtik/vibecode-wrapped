#!/usr/bin/env node
import { Aggregator } from "./aggregate.js";
import { readClaude } from "./readers/claude.js";
import { readCodex } from "./readers/codex.js";
import { demoWrapped } from "./demo.js";
import { serve } from "./serve.js";
import { buildWrapped, type Wrapped } from "./stats.js";

const HELP = `agent-wrapped - your year with AI coding agents, wrapped

Usage: npx agent-wrapped [options]

  --year <yyyy>   Year to wrap (default: current year)
  --all           All time instead of one year
  --demo          Show the cards with made-up sample data
  --text          Print a text summary instead of opening the cards
  --json          Print the stats as JSON
  --no-open       Start the local page without opening a browser
  --show-names    Include file and project names (hidden by default)
  -h, --help      Show this help

Everything runs locally. Nothing leaves your machine.`;

interface Options {
  year: number;
  all: boolean;
  json: boolean;
  text: boolean;
  demo: boolean;
  open: boolean;
  showNames: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { year: new Date().getFullYear(), all: false, json: false, text: false, demo: false, open: true, showNames: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      console.log(HELP);
      process.exit(0);
    } else if (a === "--all") opts.all = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--text") opts.text = true;
    else if (a === "--demo") opts.demo = true;
    else if (a === "--no-open") opts.open = false;
    else if (a === "--show-names") opts.showNames = true;
    else if (a === "--year") {
      const y = Number(argv[++i]);
      if (!Number.isInteger(y) || y < 2020 || y > 2100) fail(`--year needs a year like 2026`);
      opts.year = y;
    } else fail(`Unknown option: ${a}\n\n${HELP}`);
  }
  return opts;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const fmt = (n: number) => n.toLocaleString("en-US");
const compact = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);

function printSummary(w: Wrapped, showNames: boolean) {
  const t = w.totals;
  const list = (items: { name: string; count: number }[]) =>
    items.map((i) => `${i.name} (${compact(i.count)})`).join(", ") || "-";
  const lines = [
    "",
    `  Agent Wrapped ${w.label}`,
    `  ${w.persona.title}: ${w.persona.reason}`,
    "",
    `  Time coding      ${Math.round(t.activeMinutes / 60)} hours across ${t.activeDays} days`,
    `  Sessions         ${fmt(t.sessions)} (Claude Code ${fmt(w.sources.claude.sessions)}, Codex ${fmt(w.sources.codex.sessions)})`,
    `  Prompts          ${fmt(t.prompts)}`,
    `  Tool calls       ${fmt(t.toolCalls)}`,
    `  Tokens           ${compact(t.tokens)} (~$${fmt(Math.round(t.costUSD))} at API prices)`,
    `  Lines            +${fmt(t.linesAdded)} / -${fmt(t.linesRemoved)}`,
    `  Longest streak   ${w.longestStreak} days`,
    w.busiestDay ? `  Busiest day      ${w.busiestDay.date} (${(w.busiestDay.minutes / 60).toFixed(1)} h)` : "",
    w.longestSession ? `  Longest session  ${(w.longestSession.minutes / 60).toFixed(1)} h on ${w.longestSession.date}` : "",
    `  Top tools        ${list(w.tools.slice(0, 5))}`,
    `  Top models       ${list(w.models.slice(0, 3))}`,
    `  Top file types   ${list(w.languages.slice(0, 5))}`,
  ];
  if (showNames) {
    lines.push(`  Top files        ${list(w.files)}`, `  Top projects     ${list(w.projects)}`);
  }
  console.log(lines.filter((l, i) => l || i === 0 || i === 3).join("\n") + "\n");
}

async function collect(opts: Options): Promise<Wrapped> {
  if (opts.demo) return demoWrapped(opts.year);
  const from = opts.all ? 0 : new Date(opts.year, 0, 1).getTime();
  const to = opts.all ? Infinity : new Date(opts.year + 1, 0, 1).getTime();
  const agg = new Aggregator(from, to);

  if (!opts.json) process.stderr.write("Reading your local agent logs...\n");
  const [claudeFiles, codexFiles] = [await readClaude(agg), await readCodex(agg)];

  if (agg.sessions.length === 0) {
    fail(
      claudeFiles + codexFiles === 0
        ? "No Claude Code or Codex logs found on this machine (looked in ~/.claude and ~/.codex). Try --demo to see sample cards."
        : `No activity found for ${opts.all ? "any year" : opts.year}. Try --all or --year <yyyy>.`,
    );
  }

  const wrapped = buildWrapped(agg, opts.all ? "all time" : String(opts.year));
  if (!opts.showNames) {
    wrapped.files = [];
    wrapped.projects = [];
  }
  return wrapped;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const wrapped = await collect(opts);
  if (opts.json) return console.log(JSON.stringify(wrapped, null, 2));
  if (opts.text) return printSummary(wrapped, opts.showNames);

  const url = await serve(wrapped, opts.open);
  console.log(`
  Your Agent Wrapped is ready: ${url}
  Served from this machine only. Press Ctrl+C to stop.
`);
}

main().catch((err) => fail(`agent-wrapped failed: ${err?.message ?? err}`));
