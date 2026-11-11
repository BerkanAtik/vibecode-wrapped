import { basename } from "node:path";
import type { Aggregator, Source } from "./aggregate.js";

export interface Ranked {
  name: string;
  count: number;
}

export interface Persona {
  id: string;
  title: string;
  reason: string;
}

export interface Wrapped {
  label: string;
  sources: Record<Source, { sessions: number; tokens: number }>;
  totals: {
    sessions: number;
    prompts: number;
    activeMinutes: number;
    activeDays: number;
    toolCalls: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
    costUSD: number;
    linesAdded: number;
    linesRemoved: number;
    projects: number;
  };
  tools: Ranked[];
  models: Ranked[];
  languages: Ranked[];
  files: Ranked[];
  projects: Ranked[];
  hours: number[]; // active minutes per local hour, 0-23
  weekdays: number[]; // active minutes per weekday, 0 = Sunday
  days: Record<string, number>; // local YYYY-MM-DD -> active minutes
  firstDay: string | null;
  busiestDay: { date: string; minutes: number } | null;
  longestStreak: number;
  longestSession: { date: string; minutes: number; source: Source } | null;
  persona: Persona;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function top(map: Map<string, number>, n: number): Ranked[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

export function buildWrapped(agg: Aggregator, label: string): Wrapped {
  const hours = new Array<number>(24).fill(0);
  const weekdays = new Array<number>(7).fill(0);
  const days: Record<string, number> = {};
  for (const minute of agg.activeMinutes) {
    const d = new Date(minute * 60_000);
    hours[d.getHours()]++;
    weekdays[d.getDay()]++;
    const key = dayKey(d);
    days[key] = (days[key] ?? 0) + 1;
  }
  const dayKeys = Object.keys(days).sort();

  let busiestDay: Wrapped["busiestDay"] = null;
  for (const date of dayKeys) {
    if (!busiestDay || days[date] > busiestDay.minutes) busiestDay = { date, minutes: days[date] };
  }

  let longestStreak = 0;
  let run = 0;
  let prev = 0;
  for (const key of dayKeys) {
    const [y, m, d] = key.split("-").map(Number);
    const dayNumber = Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
    run = dayNumber === prev + 1 ? run + 1 : 1;
    prev = dayNumber;
    if (run > longestStreak) longestStreak = run;
  }

  const sources: Wrapped["sources"] = {
    claude: { sessions: 0, tokens: agg.sourceTokens.get("claude") ?? 0 },
    codex: { sessions: 0, tokens: agg.sourceTokens.get("codex") ?? 0 },
  };
  const projects = new Map<string, number>();
  let longest: Wrapped["longestSession"] = null;
  for (const s of agg.sessions) {
    sources[s.source].sessions++;
    if (s.project) {
      const name = basename(s.project.replace(/\\/g, "/"));
      projects.set(name, (projects.get(name) ?? 0) + 1);
    }
    const minutes = Math.round(s.activeMs / 60_000);
    if (!longest || minutes > longest.minutes) {
      longest = { date: dayKey(new Date(s.start)), minutes, source: s.source };
    }
  }

  const t = agg.tokens;
  const toolCalls = [...agg.tools.values()].reduce((a, b) => a + b, 0);
  const wrapped: Wrapped = {
    label,
    sources,
    totals: {
      sessions: agg.sessions.length,
      prompts: agg.prompts,
      activeMinutes: agg.activeMinutes.size,
      activeDays: dayKeys.length,
      toolCalls,
      tokens: t.input + t.output + t.cacheRead + t.cacheWrite,
      inputTokens: t.input,
      outputTokens: t.output,
      cacheTokens: t.cacheRead + t.cacheWrite,
      costUSD: Math.round(agg.costUSD * 100) / 100,
      linesAdded: agg.linesAdded,
      linesRemoved: agg.linesRemoved,
      projects: projects.size,
    },
    tools: top(agg.tools, 10),
    models: top(agg.models, 6),
    languages: top(agg.languages, 8),
    files: top(agg.files, 5),
    projects: top(projects, 5),
    hours,
    weekdays,
    days,
    firstDay: dayKeys[0] ?? null,
    busiestDay,
    longestStreak,
    longestSession: longest,
    persona: { id: "", title: "", reason: "" },
  };
  wrapped.persona = pickPersona(wrapped);
  return wrapped;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Picks the trait that stands out most; each candidate scores 0..1+ against its own threshold. */
export function pickPersona(w: Wrapped): Persona {
  const total = w.totals.activeMinutes || 1;
  const share = (from: number, to: number) => w.hours.slice(from, to).reduce((a, b) => a + b, 0) / total;
  const night = share(0, 5) + share(23, 24);
  const morning = share(5, 9);
  const weekend = (w.weekdays[0] + w.weekdays[6]) / total;
  const toolCount = (re: RegExp) =>
    w.tools.filter((t) => re.test(t.name)).reduce((a, t) => a + t.count, 0) / (w.totals.toolCalls || 1);
  const shell = toolCount(/^(Bash|PowerShell|shell|exec_command|local_shell)/i);
  const delegate = toolCount(/^(Task|Agent|Workflow|spawn_agent)$/i);
  const longest = w.longestSession?.minutes ?? 0;
  const churn = w.totals.linesAdded ? w.totals.linesRemoved / w.totals.linesAdded : 0;

  const candidates: (Persona & { score: number })[] = [
    { id: "night-owl", title: "The Night Owl", score: night / 0.25, reason: `${pct(night)} of your coding happened between 11pm and 5am` },
    { id: "early-bird", title: "The Early Bird", score: morning / 0.25, reason: `${pct(morning)} of your coding happened before 9am` },
    { id: "weekend-warrior", title: "The Weekend Warrior", score: weekend / 0.4, reason: `${pct(weekend)} of your coding happened on weekends` },
    { id: "marathoner", title: "The Marathoner", score: longest / 300, reason: `your longest session ran ${Math.round(longest / 60)} hours without a real break` },
    { id: "streaker", title: "The Streaker", score: w.longestStreak / 21, reason: `you showed up ${w.longestStreak} days in a row` },
    { id: "orchestrator", title: "The Orchestrator", score: delegate / 0.04, reason: `${pct(delegate)} of your tool calls sent other agents to do the work` },
    { id: "terminal-native", title: "The Terminal Native", score: shell / 0.45, reason: `${pct(shell)} of your tool calls were shell commands` },
    { id: "refactorer", title: "The Refactorer", score: churn / 0.7, reason: `you deleted ${pct(churn)} as many lines as you wrote` },
  ];
  const best = candidates.sort((a, b) => b.score - a.score)[0];
  if (best.score < 1) {
    return { id: "builder", title: "The Builder", reason: `${w.totals.sessions} sessions, one steady rhythm` };
  }
  return { id: best.id, title: best.title, reason: best.reason };
}
