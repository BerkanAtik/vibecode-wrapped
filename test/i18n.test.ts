import { describe, expect, it } from "vitest";
import { detectLang, personaText, trSuffix } from "../src/i18n.js";

describe("i18n", () => {
  it("picks Turkish only for Turkish locales", () => {
    expect(detectLang({ LANG: "tr_TR.UTF-8" })).toBe("tr");
    expect(detectLang({ LC_ALL: "en_US.UTF-8", LANG: "tr_TR.UTF-8" })).toBe("en");
    expect(detectLang({ LANG: "de_DE.UTF-8" })).toBe("en");
  });

  it("adds the right Turkish suffix to percentages", () => {
    const cases: [number, string][] = [[1, "'i"], [2, "'si"], [3, "'ü"], [5, "'i"], [6, "'sı"], [9, "'u"], [10, "'u"], [20, "'si"], [32, "'si"], [40, "'ı"], [60, "'ı"], [90, "'ı"], [100, "'ü"]];
    for (const [n, suffix] of cases) expect(trSuffix(n)).toBe(suffix);
  });

  it("writes persona text in both languages", () => {
    expect(personaText("night-owl", 0.32, "en").reason).toBe("32% of your coding happened between 11pm and 5am");
    expect(personaText("night-owl", 0.32, "tr").reason).toBe("Kodlama sürenin %32'si gece 23:00 ile 05:00 arasında geçti");
    expect(personaText("unknown", 4, "tr").title).toBe("İnşaatçı");
  });
});
