import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/** Yields each parseable JSON object of a .jsonl file, streaming so huge logs never sit in memory. */
export async function* readJsonl(file: string): AsyncGenerator<any> {
  let rest = "";
  const stream = createReadStream(file, { encoding: "utf8", highWaterMark: 1 << 20 });
  for await (const chunk of stream) {
    const text = rest + chunk;
    let start = 0;
    let nl: number;
    while ((nl = text.indexOf("\n", start)) !== -1) {
      const obj = parse(text.slice(start, nl));
      if (obj) yield obj;
      start = nl + 1;
    }
    rest = text.slice(start);
  }
  const obj = parse(rest);
  if (obj) yield obj;
}

function parse(line: string): any {
  if (line.length < 2) return null;
  try {
    const v = JSON.parse(line);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null; // truncated or corrupt line: skip, never crash
  }
}

/** Recursively lists .jsonl files; a missing directory is just an empty list. */
export async function findJsonl(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith(".jsonl")) out.push(p);
    }
  }
  await walk(dir);
  return out;
}
