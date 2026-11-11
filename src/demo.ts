import { persona, pickPersona, type Wrapped } from "./stats.js";

/** Made-up but believable data, so the cards can be tried (and screenshotted) without real logs. */
export function demoWrapped(year: number): Wrapped {
  let seed = 42;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  const days: Record<string, number> = {};
  const weekdays = new Array<number>(7).fill(0);
  let streak = 0;
  let longestStreak = 0;
  let busiestDay: Wrapped["busiestDay"] = null;
  for (const d = new Date(year, 0, 6); d < new Date(year, 11, 20); d.setDate(d.getDate() + 1)) {
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    if (rand() < (weekend ? 0.55 : 0.2)) {
      streak = 0;
      continue;
    }
    const minutes = Math.round(25 + rand() * rand() * 420);
    const key = `${year}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days[key] = minutes;
    weekdays[d.getDay()] += minutes;
    longestStreak = Math.max(longestStreak, ++streak);
    if (!busiestDay || minutes > busiestDay.minutes) busiestDay = { date: key, minutes };
  }
  const dayKeys = Object.keys(days);
  const activeMinutes = dayKeys.reduce((a, k) => a + days[k], 0);

  const shape = [3, 2, 1, 0.4, 0.2, 0.2, 0.5, 1, 3, 6, 8, 8, 5, 6, 8, 9, 8, 6, 4, 4, 6, 7, 6, 4];
  const shapeTotal = shape.reduce((a, b) => a + b, 0);
  const hours = shape.map((s) => Math.round((s / shapeTotal) * activeMinutes));

  const wrapped: Wrapped = {
    label: String(year),
    sources: { claude: { sessions: 612, tokens: 2_950_000_000 }, codex: { sessions: 231, tokens: 890_000_000 } },
    totals: {
      sessions: 843,
      prompts: 9_412,
      activeMinutes,
      activeDays: dayKeys.length,
      toolCalls: 96_530,
      tokens: 3_840_000_000,
      inputTokens: 41_000_000,
      outputTokens: 58_000_000,
      cacheTokens: 3_741_000_000,
      costUSD: 4_127.35,
      linesAdded: 418_260,
      linesRemoved: 171_904,
      projects: 23,
    },
    tools: [
      { name: "Bash", count: 31_870 },
      { name: "Read", count: 24_115 },
      { name: "Edit", count: 17_340 },
      { name: "Grep", count: 9_206 },
      { name: "apply_patch", count: 5_480 },
      { name: "Agent", count: 4_890 },
      { name: "Write", count: 3_629 },
    ],
    models: [
      { name: "claude-opus-5-5", count: 2_210_000_000 },
      { name: "gpt-6-codex", count: 890_000_000 },
      { name: "claude-sonnet-5-5", count: 705_000_000 },
      { name: "claude-haiku-5-5", count: 35_000_000 },
    ],
    languages: [
      { name: ".ts", count: 142_300 },
      { name: ".tsx", count: 98_750 },
      { name: ".py", count: 71_420 },
      { name: ".go", count: 40_260 },
      { name: ".md", count: 28_900 },
    ],
    files: [],
    projects: [],
    hours,
    weekdays,
    days,
    firstDay: dayKeys[0],
    busiestDay,
    longestStreak,
    longestSession: { date: busiestDay!.date, minutes: 312, source: "claude" },
    persona: persona("builder", 0), // replaced below
  };
  wrapped.persona = pickPersona(wrapped);
  return wrapped;
}
