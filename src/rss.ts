// ── Bağımlılıksız, hafif RSS/HTML ayrıştırıcı ──
// Tam XML parser değil; RSS 2.0 feed'lerindeki <item> bloklarını çıkarmak için yeterli.

export interface RssItem {
  title: string;
  link: string;
  pubDate?: string;
  source?: string;
  extra: Record<string, string>;
}

export function entityCoz(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function tagIcerik(blok: string, tag: string): string | undefined {
  // Namespace'li tag'ler için ht:approx_traffic gibi adları da destekle
  const desen = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = blok.match(desen);
  return m ? entityCoz(m[1]) : undefined;
}

export function rssItemleriCoz(xml: string, ekstraTaglar: string[] = []): RssItem[] {
  const itemler: RssItem[] = [];
  const bloklar = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

  for (const blok of bloklar) {
    const title = tagIcerik(blok, "title");
    const link = tagIcerik(blok, "link");
    if (!title) continue;

    const extra: Record<string, string> = {};
    for (const t of ekstraTaglar) {
      const v = tagIcerik(blok, t);
      if (v) extra[t] = v;
    }

    itemler.push({
      title,
      link: link ?? "",
      pubDate: tagIcerik(blok, "pubDate"),
      source: tagIcerik(blok, "source"),
      extra,
    });
  }
  return itemler;
}

export function pubDateToISO(pubDate?: string): string | undefined {
  if (!pubDate) return undefined;
  const t = new Date(pubDate);
  return Number.isNaN(t.getTime()) ? undefined : t.toISOString();
}

/** HTML'den <a href="...">metin</a> çiftlerini çıkarır (Resmî Gazete fihristi için). */
export function htmlLinkleriCoz(html: string): Array<{ href: string; metin: string }> {
  const sonuc: Array<{ href: string; metin: string }> = [];
  const desen = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = desen.exec(html)) !== null) {
    const metin = entityCoz(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    if (metin.length > 5) sonuc.push({ href: m[1], metin });
  }
  return sonuc;
}
