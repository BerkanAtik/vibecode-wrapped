import { basename, extname } from "node:path";
import { estimateCost } from "./pricing.js";

export type Source = "claude" | "codex";

export interface Tokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface SessionSummary {
  source: Source;
  project: string;
  start: number;
  end: number;
  activeMs: number;
}

const IDLE_GAP_MS = 5 * 60_000; // longer silence than this is a break, not work

const add = (map: Map<string, number>, key: string, n = 1) => map.set(key, (map.get(key) ?? 0) + n);

/**
 * Collects everything the readers see, restricted to a time range.
 * Readers push small events; nothing here keeps message text.
 */
export class Aggregator {
  readonly activeMinutes = new Set<number>(); // minute-of-epoch, so parallel sessions don't double count
  readonly sessions: SessionSummary[] = [];
  readonly tools = new Map<string, number>();
  readonly models = new Map<string, number>();
  readonly files = new Map<string, number>();
  readonly languages = new Map<string, number>();
  readonly sourceTokens = new Map<Source, number>();
  readonly tokens: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  prompts = 0;
  costUSD = 0;
  linesAdded = 0;
  linesRemoved = 0;

  private seenMessages = new Set<string>();
  private seenTools = new Set<string>();

  constructor(readonly from: number, readonly to: number) {}

  inRange(ts: number): boolean {
    return ts >= this.from && ts < this.to;
  }

  /** Tracks one session file's activity; call end() when the file is done. */
  session(source: Source) {
    let project = "";
    let start = 0;
    let last = 0;
    let activeMs = 0;
    return {
      setProject: (cwd: unknown) => {
        if (!project && typeof cwd === "string" && cwd) project = cwd;
      },
      tick: (ts: number) => {
        if (!this.inRange(ts)) return;
        const minute = Math.floor(ts / 60_000);
        if (last && ts >= last && ts - last <= IDLE_GAP_MS) {
          activeMs += ts - last;
          for (let m = Math.floor(last / 60_000); m <= minute; m++) this.activeMinutes.add(m);
        } else {
          this.activeMinutes.add(minute);
        }
        if (!start) start = ts;
        if (ts > last) last = ts;
      },
      end: () => {
        if (start) this.sessions.push({ source, project, start, end: last, activeMs });
      },
    };
  }

  prompt(ts: number) {
    if (this.inRange(ts)) this.prompts++;
  }

  /** `id` dedupes messages that appear in several files (resumed or forked sessions). */
  usage(source: Source, id: string | undefined, model: string, t: Tokens, ts: number) {
    if (!this.inRange(ts)) return;
    if (id) {
      if (this.seenMessages.has(id)) return;
      this.seenMessages.add(id);
    }
    this.tokens.input += t.input;
    this.tokens.output += t.output;
    this.tokens.cacheRead += t.cacheRead;
    this.tokens.cacheWrite += t.cacheWrite;
    const total = t.input + t.output + t.cacheRead + t.cacheWrite;
    add(this.models, model, total);
    this.sourceTokens.set(source, (this.sourceTokens.get(source) ?? 0) + total);
    this.costUSD += estimateCost(model, t);
  }

  tool(id: string | undefined, name: string, ts: number) {
    if (!this.inRange(ts) || !name) return;
    if (id) {
      if (this.seenTools.has(id)) return;
      this.seenTools.add(id);
    }
    add(this.tools, name);
  }

  edit(filePath: unknown, added: number, removed: number, ts: number) {
    if (!this.inRange(ts)) return;
    this.linesAdded += added;
    this.linesRemoved += removed;
    if (typeof filePath !== "string" || !filePath) return;
    const name = basename(filePath.replace(/\\/g, "/"));
    add(this.files, name);
    const ext = extname(name).toLowerCase();
    if (ext) add(this.languages, ext, added + removed || 1);
  }
}
