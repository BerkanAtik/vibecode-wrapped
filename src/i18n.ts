export type Lang = "en" | "tr";
export const LANGS: Lang[] = ["en", "tr"];

/** Turkish when the system says so, English otherwise. LC_ALL and LANG win over the OS locale. */
export function detectLang(env: NodeJS.ProcessEnv = process.env): Lang {
  const raw = env.LC_ALL || env.LC_MESSAGES || env.LANG || Intl.DateTimeFormat().resolvedOptions().locale || "";
  return raw.toLowerCase().startsWith("tr") ? "tr" : "en";
}

/** Turkish possessive suffix for a written number, as in "%32'si" or "%40'ı". */
export function trSuffix(n: number): string {
  const ones = ["ı", "i", "si", "ü", "ü", "i", "sı", "si", "i", "u"];
  const tens = ["", "u", "si", "u", "ı", "si", "ı", "i", "i", "ı"];
  n = Math.abs(Math.round(n));
  if (n === 0) return "'ı";
  if (n % 100 === 0) return n % 1000 === 0 ? "'i" : "'ü";
  return "'" + (n % 10 ? ones[n % 10] : tens[(n / 10) % 10]);
}

export interface PersonaText {
  title: string;
  reason: string;
}

/** Title and one-line reason for a persona. `value` is a share (0..1), hours, days or sessions, depending on the persona. */
export function personaText(id: string, value: number, lang: Lang): PersonaText {
  const p = Math.round(value * 100);
  if (lang === "tr") {
    const pct = `%${p}${trSuffix(p)}`;
    const tr: Record<string, PersonaText> = {
      "night-owl": { title: "Gece Kuşu", reason: `Kodlama sürenin ${pct} gece 23:00 ile 05:00 arasında geçti` },
      "early-bird": { title: "Erkenci Kuş", reason: `Kodlama sürenin ${pct} sabah 09:00'dan önce geçti` },
      "weekend-warrior": { title: "Hafta Sonu Savaşçısı", reason: `Kodlama sürenin ${pct} hafta sonlarına denk geldi` },
      marathoner: { title: "Maratoncu", reason: `En uzun oturumun gerçek bir mola vermeden ${value} saat sürdü` },
      streaker: { title: "Seri Ustası", reason: `${value} gün üst üste hiç ara vermedin` },
      orchestrator: { title: "Orkestra Şefi", reason: `Araç çağrılarının ${pct} işi başka ajanlara devretti` },
      "terminal-native": { title: "Terminal Kurdu", reason: `Araç çağrılarının ${pct} terminal komutuydu` },
      refactorer: { title: "Refactor Ustası", reason: `Yazdığın her 100 satıra karşılık ${p} satır sildin` },
      builder: { title: "İnşaatçı", reason: `${value} oturum, tek bir istikrarlı ritim` },
    };
    return tr[id] ?? tr.builder;
  }
  const en: Record<string, PersonaText> = {
    "night-owl": { title: "The Night Owl", reason: `${p}% of your coding happened between 11pm and 5am` },
    "early-bird": { title: "The Early Bird", reason: `${p}% of your coding happened before 9am` },
    "weekend-warrior": { title: "The Weekend Warrior", reason: `${p}% of your coding happened on weekends` },
    marathoner: { title: "The Marathoner", reason: `your longest session ran ${value} hours without a real break` },
    streaker: { title: "The Streaker", reason: `you showed up ${value} days in a row` },
    orchestrator: { title: "The Orchestrator", reason: `${p}% of your tool calls sent other agents to do the work` },
    "terminal-native": { title: "The Terminal Native", reason: `${p}% of your tool calls were shell commands` },
    refactorer: { title: "The Refactorer", reason: `you deleted ${p}% as many lines as you wrote` },
    builder: { title: "The Builder", reason: `${value} sessions, one steady rhythm` },
  };
  return en[id] ?? en.builder;
}

export const MESSAGES = {
  en: {
    help: `vibecode-wrapped - your year with AI coding agents, wrapped

Usage: npx vibecode-wrapped [options]

  --year <yyyy>   Year to wrap (default: current year)
  --all           All time instead of one year
  --demo          Show the cards with made-up sample data
  --text          Print a text summary instead of opening the cards
  --json          Print the stats as JSON
  --lang <en|tr>  Language for the cards and the text (default: your system language)
  --no-open       Start the local page without opening a browser
  --show-names    Include file and project names (hidden by default)
  -h, --help      Show this help

Everything runs locally. Nothing leaves your machine.`,
    badYear: "--year needs a year like 2026",
    badLang: "--lang must be en or tr",
    unknown: (a: string) => `Unknown option: ${a}`,
    reading: "Reading your local agent logs...",
    noLogs: "No Claude Code or Codex logs found on this machine (looked in ~/.claude and ~/.codex). Try --demo to see sample cards.",
    noActivity: (period: string) => `No activity found for ${period}. Try --all or --year <yyyy>.`,
    anyYear: "any year",
    allTime: "all time",
    ready: (url: string) => `Your Vibecode Wrapped is ready: ${url}\n  Served from this machine only. Press Ctrl+C to stop.`,
    failed: (m: string) => `vibecode-wrapped failed: ${m}`,
    summary: {
      time: "Time coding",
      hoursAcross: (h: string, d: string) => `${h} hours across ${d} days`,
      sessions: "Sessions",
      prompts: "Prompts",
      toolCalls: "Tool calls",
      tokens: "Tokens",
      atApi: (usd: string) => `~$${usd} at API prices`,
      lines: "Lines",
      streak: "Longest streak",
      days: (n: string) => `${n} days`,
      busiest: "Busiest day",
      longest: "Longest session",
      hoursOn: (h: string, date: string) => `${h} h on ${date}`,
      hoursShort: (h: string) => `${h} h`,
      tools: "Top tools",
      models: "Top models",
      types: "Top file types",
      files: "Top files",
      projects: "Top projects",
    },
  },
  tr: {
    help: `vibecode-wrapped - yapay zekâ kodlama ajanlarıyla geçen yılının özeti

Kullanım: npx vibecode-wrapped [seçenekler]

  --year <yyyy>   Özetlenecek yıl (varsayılan: bu yıl)
  --all           Tek bir yıl yerine tüm zamanlar
  --demo          Kartları uydurma örnek veriyle göster
  --text          Kartları açmak yerine terminalde yazılı özet ver
  --json          İstatistikleri JSON olarak yazdır
  --lang <en|tr>  Kartların ve yazıların dili (varsayılan: sistem dilin)
  --no-open       Yerel sayfayı tarayıcı açmadan başlat
  --show-names    Dosya ve proje adlarını da göster (varsayılan olarak gizli)
  -h, --help      Bu yardımı göster

Her şey bilgisayarında çalışır. Hiçbir veri dışarı çıkmaz.`,
    badYear: "--year için 2026 gibi bir yıl yazmalısın",
    badLang: "--lang en ya da tr olmalı",
    unknown: (a: string) => `Bilinmeyen seçenek: ${a}`,
    reading: "Bilgisayarındaki ajan kayıtları okunuyor...",
    noLogs: "Bu bilgisayarda Claude Code ya da Codex kaydı bulunamadı (~/.claude ve ~/.codex klasörlerine bakıldı). Örnek kartları görmek için --demo dene.",
    noActivity: (period: string) => `${period} için etkinlik bulunamadı. --all ya da --year <yyyy> dene.`,
    anyYear: "Hiçbir yıl",
    allTime: "tüm zamanlar",
    ready: (url: string) => `Vibecode Wrapped hazır: ${url}\n  Yalnız bu bilgisayardan sunuluyor. Durdurmak için Ctrl+C'ye bas.`,
    failed: (m: string) => `vibecode-wrapped çalışamadı: ${m}`,
    summary: {
      time: "Kodlama süresi",
      hoursAcross: (h: string, d: string) => `${h} saat, ${d} güne yayıldı`,
      sessions: "Oturumlar",
      prompts: "Prompt'lar",
      toolCalls: "Araç çağrıları",
      tokens: "Token",
      atApi: (usd: string) => `API fiyatlarıyla ~${usd} dolar`,
      lines: "Satırlar",
      streak: "En uzun seri",
      days: (n: string) => `${n} gün`,
      busiest: "En yoğun gün",
      longest: "En uzun oturum",
      hoursOn: (h: string, date: string) => `${date} günü ${h} saat`,
      hoursShort: (h: string) => `${h} saat`,
      tools: "Öne çıkan araçlar",
      models: "Öne çıkan modeller",
      types: "Öne çıkan dosya türleri",
      files: "Öne çıkan dosyalar",
      projects: "Öne çıkan projeler",
    },
  },
} as const;
