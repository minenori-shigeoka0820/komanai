// lib/normalize.ts
const zenkakuToHankaku = (s: string) =>
  s
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");

const hiraToKata = (s: string) =>
  s.replace(/[\u3041-\u3096]/g, (m) => String.fromCharCode(m.charCodeAt(0) + 0x60));

export function kanjiNumToArabic(s: string) {
  const map: Record<string, string> = { "〇":"0","零":"0","一":"1","二":"2","三":"3","四":"4","五":"5","六":"6","七":"7","八":"8","九":"9" };
  return s.replace(/[〇零一二三四五六七八九]/g, (m) => map[m] ?? m);
}

export function normalizeName(s: string) {
  return kanjiNumToArabic(
    hiraToKata(
      zenkakuToHankaku(s)
        .toLowerCase()
        .replace(/[（）\(\)\[\]【】]/g, "") // 括弧除去
        .replace(/\s+/g, "")               // 空白除去
    )
  );
}

export function variants(input: string) {
  const raw = input.trim();
  const city = (raw.match(/([^\s　]+[市区町村])$/)?.[1]) || "";
  const base = city ? raw.replace(new RegExp(`[\\s　]*${city}$`), "") : raw;

  const shapes = new Set<string>([
    raw,
    `${base} ${city}`.trim(),
    base.trim(),
  ]);

  return [...shapes].filter(Boolean);
}
