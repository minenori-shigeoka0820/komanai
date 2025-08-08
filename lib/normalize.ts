export function kanjiNumToArabic(s: string) {
  const map: Record<string, string> = {
    "一": "1", "二": "2", "三": "3", "四": "4", "五": "5",
    "六": "6", "七": "7", "八": "8", "九": "9", "〇": "0", "零": "0"
  };
  return s.replace(/[一二三四五六七八九〇零]/g, (m) => map[m] || m);
}

export function normalizeName(raw: string) {
  if (!raw) return "";
  const noSpace = raw.replace(/\s+/g, "");
  const num = kanjiNumToArabic(noSpace);
  return num.replace(/交差点$/, "");
}

export function variants(raw: string) {
  const base = normalizeName(raw);
  return Array.from(new Set([base, base + "交差点"]));
}
