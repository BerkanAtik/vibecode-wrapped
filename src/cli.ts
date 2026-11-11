#!/usr/bin/env node
import { Aggregator } from "./aggregate.js";
import { readClaude } from "./readers/claude.js";
import { readCodex } from "./readers/codex.js";
import { demoWrapped } from "./demo.js";
import { detectLang, LANGS, MESSAGES, type Lang } from "./i18n.js";
import { serve } from "./serve.js";
import { buildWrapped, type Wrapped } from "./stats.js";

interface Options {
  year: number;
  all: boolean;
  json: boolean;
  text: boolean;
  demo: boolean;
  open: boolean;
  showNames: boolean;
  lang: Lang;
}

let lang: Lang = detectLang();
const msg = () => MESSAGES[lang];

function parseArgs(argv: string[]): Options {
  // --lang is read first so every other message, including errors, uses it.
  const li = argv.indexOf("--lang");
  if (li !== -1) {
    const value = argv[li + 1] as Lang;
    if (!LANGS.includes(value)) fail(MESSAGES[lang].badLang);
    lang = value;
  }
  const opts: Options = { year: new Date().getFullYear(), all: false, json: false, text: false, demo: false, open: true, showNames: false, lang };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      console.log(msg().help);
      process.exit(0);
    } else if (a === "--all") opts.all = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--text") opts.text = true;
    else if (a === "--demo") opts.demo = true;
    else if (a === "--no-open") opts.open = false;
    else if (a === "--show-names") opts.showNames = true;
    else if (a === "--lang") i++;
    else if (a === "--year") {
      const y = Number(argv[++i]);
      if (!Number.isInteger(y) || y < 2020 || y > 2100) fail(msg().badYear);
      opts.year = y;
    } else fail(`${msg().unknown(a)}\n\n${msg().help}`);
  }
  return opts;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function printSummary(w: Wrapped, showNames: boolean) {
  const locale = lang === "tr" ? "tr-TR" : "en-US";
  const fmt = (n: number) => Math.round(n).toLocaleString(locale);
  const dec = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const compact = (n: number) => {
    const units: [number, string][] = lang === "tr" ? [[1e9, " Mr"], [1e6, " Mn"], [1e3, " B"]] : [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
    for (const [v, s] of units) if (n >= v) return dec(n / v) + s;
    return String(n);
  };
  const s = msg().summary;
  const t = w.totals;
  const list = (items: { name: string; count: number }[]) => items.map((i) => `${i.name} (${compact(i.count)})`).join(", ") || "-";
  const rows: [string, string][] = [
    [s.time, s.hoursAcross(fmt(t.activeMinutes / 60), fmt(t.activeDays))],
    [s.sessions, `${fmt(t.sessions)} (Claude Code ${fmt(w.sources.claude.sessions)}, Codex ${fmt(w.sources.codex.sessions)})`],
    [s.prompts, fmt(t.prompts)],
    [s.toolCalls, fmt(t.toolCalls)],
    [s.tokens, `${compact(t.tokens)} (${s.atApi(fmt(t.costUSD))})`],
    [s.lines, `+${fmt(t.linesAdded)} / -${fmt(t.linesRemoved)}`],
    [s.streak, s.days(fmt(w.longestStreak))],
  ];
  if (w.busiestDay) rows.push([s.busiest, `${w.busiestDay.date} (${s.hoursShort(dec(w.busiestDay.minutes / 60))})`]);
  if (w.longestSession) rows.push([s.longest, s.hoursOn(dec(w.longestSession.minutes / 60), w.longestSession.date)]);
  rows.push([s.tools, list(w.tools.slice(0, 5))], [s.models, list(w.models.slice(0, 3))], [s.types, list(w.languages.slice(0, 5))]);
  if (showNames) rows.push([s.files, list(w.files)], [s.projects, list(w.projects)]);

  const width = Math.max(...rows.map(([k]) => k.length)) + 3;
  const label = /^\d{4}$/.test(w.label) ? w.label : msg().allTime;
  const p = w.persona.text[lang];
  console.log(
    ["", `  Vibe Wrapped ${label}`, `  ${p.title}: ${p.reason}`, "", ...rows.map(([k, v]) => `  ${k.padEnd(width)}${v}`)].join("\n") + "\n",
  );
}

async function collect(opts: Options): Promise<Wrapped> {
  if (opts.demo) return demoWrapped(opts.year);
  const from = opts.all ? 0 : new Date(opts.year, 0, 1).getTime();
  const to = opts.all ? Infinity : new Date(opts.year + 1, 0, 1).getTime();
  const agg = new Aggregator(from, to);

  if (!opts.json) process.stderr.write(msg().reading + "\n");
  const [claudeFiles, codexFiles] = [await readClaude(agg), await readCodex(agg)];

  if (agg.sessions.length === 0) {
    fail(claudeFiles + codexFiles === 0 ? msg().noLogs : msg().noActivity(opts.all ? msg().anyYear : String(opts.year)));
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

  const url = await serve(wrapped, opts.lang, opts.open);
  console.log(`\n  ${msg().ready(url)}\n`);
}

main().catch((err) => fail(msg().failed(err?.message ?? String(err))));
