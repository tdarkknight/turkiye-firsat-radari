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

// ── Atom feed desteği (Product Hunt gibi) ──
export interface AtomEntry {
  title: string;
  link: string;
  published?: string;
  ozet?: string;
}

export function atomEntryleriCoz(xml: string): AtomEntry[] {
  const entryler: AtomEntry[] = [];
  const bloklar = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];

  for (const blok of bloklar) {
    const titleM = blok.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!titleM) continue;
    const linkM =
      blok.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ??
      blok.match(/<link[^>]*href=["']([^"']+)["']/i);
    const publishedM = blok.match(/<(published|updated)[^>]*>([\s\S]*?)<\/\1>/i);
    const contentM = blok.match(/<(content|summary)[^>]*>([\s\S]*?)<\/\1>/i);

    entryler.push({
      title: entityCoz(titleM[1]),
      link: linkM ? entityCoz(linkM[1]) : "",
      published: publishedM ? entityCoz(publishedM[2]) : undefined,
      ozet: contentM
        ? entityCoz(contentM[2]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)
        : undefined,
    });
  }
  return entryler;
}

/** Makale HTML'inden ilk anlamlı paragrafları çıkarır (derin kanıt için). */
export function paragrafCikar(html: string, maksKarakter = 400): string | undefined {
  // script/style bloklarını at
  const temiz = html.replace(/<(script|style|nav|header|footer)[\s\S]*?<\/\1>/gi, "");
  const paragraflar = temiz.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) ?? [];

  const metinler: string[] = [];
  for (const p of paragraflar) {
    const metin = entityCoz(p.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    // çerez bildirimi / menü kırıntısı gibi kısa parçaları ele
    if (metin.length >= 80) metinler.push(metin);
    if (metinler.join(" ").length >= maksKarakter) break;
  }
  if (metinler.length === 0) return undefined;
  const birlesik = metinler.join(" ");
  return birlesik.length > maksKarakter ? `${birlesik.slice(0, maksKarakter)}…` : birlesik;
}
