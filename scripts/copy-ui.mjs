// Copies the card page and its fonts next to the compiled CLI.
// latin-ext carries the Turkish letters (ğ, ş, İ) that the basic latin file lacks.
import { copyFileSync, mkdirSync } from "node:fs";

const fonts = "node_modules/@fontsource-variable/archivo/files/";
mkdirSync("dist/ui", { recursive: true });
copyFileSync("ui/index.html", "dist/ui/index.html");
copyFileSync(fonts + "archivo-latin-wdth-normal.woff2", "dist/ui/archivo.woff2");
copyFileSync(fonts + "archivo-latin-ext-wdth-normal.woff2", "dist/ui/archivo-ext.woff2");
