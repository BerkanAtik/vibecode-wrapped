import type { Tokens } from "./aggregate.js";

// USD per million tokens: [model substring, input, output, cache read]. First hit wins,
// so newer, more specific names come before their family fallback.
// This is an API list-price estimate, not what a subscription user actually paid.
// Anthropic rows checked against the public price list in November 2026; OpenAI rows are approximate.
const PRICES: [string, number, number, number][] = [
  ["fable-5-2", 8, 40, 0.2],
  ["mythos-5-2", 8, 40, 0.2],
  ["fable", 10, 50, 1],
  ["mythos", 10, 50, 1],
  ["opus-5-5", 4, 20, 0.2],
  ["opus", 5, 25, 0.5],
  ["sonnet-5-5", 2, 10, 0.1],
  ["sonnet-5", 2, 10, 0.2],
  ["sonnet", 3, 15, 0.3],
  ["haiku-5-5", 0.1, 0.5, 0.01],
  ["haiku", 1, 5, 0.1],
  ["mini", 0.25, 2, 0.025],
  ["nano", 0.05, 0.4, 0.005],
  ["gpt", 1.25, 10, 0.125],
  ["codex", 1.25, 10, 0.125],
  ["o3", 2, 8, 0.5],
];
const FALLBACK = [3, 15, 0.3] as const;

export function estimateCost(model: string, t: Tokens): number {
  const m = model.toLowerCase();
  const hit = PRICES.find(([key]) => m.includes(key));
  const [inp, out, read] = hit ? hit.slice(1) as [number, number, number] : FALLBACK;
  return (t.input * inp + t.cacheWrite * inp * 1.25 + t.cacheRead * read + t.output * out) / 1e6;
}
