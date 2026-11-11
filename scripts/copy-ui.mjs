// Copies the card page and its font next to the compiled CLI.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("dist/ui", { recursive: true });
copyFileSync("ui/index.html", "dist/ui/index.html");
copyFileSync("node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2", "dist/ui/archivo.woff2");
