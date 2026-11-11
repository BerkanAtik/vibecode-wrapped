import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { Wrapped } from "./stats.js";

const UI = new URL("./ui/", import.meta.url);

/** Serves the cards on localhost only and opens the browser. Resolves with the URL; runs until Ctrl+C. */
export async function serve(wrapped: Wrapped, open: boolean): Promise<string> {
  const data = JSON.stringify(wrapped).replace(/</g, "\\u003c");
  const html = (await readFile(new URL("index.html", UI), "utf8")).replace("/*DATA*/null", () => data);
  const font = await readFile(new URL("archivo.woff2", UI));

  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(html);
    } else if (path === "/archivo.woff2") {
      res.writeHead(200, { "content-type": "font/woff2" });
      res.end(font);
    } else {
      res.writeHead(404).end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const url = `http://localhost:${typeof address === "object" && address ? address.port : 0}`;
  if (open) openBrowser(url);
  return url;
}

function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  // If no browser can be opened the URL is still printed, so failure here is fine.
  spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}
