// ── Veri kaynağı adaptörleri ──
// Hepsi ücretsiz, API anahtarı gerektirmez. Her adaptör KaynakSonuc döndürür:
// veri yoksa "veri bulunamadı" — asla tahmin/uydurma üretilmez.
//
// Kaynaklar:
//  • Google News RSS  — Türkiye odaklı haber araması (resmî, herkese açık feed)
//  • Google Trends RSS — Türkiye günlük arama trendleri (resmî feed)
//  • Resmî Gazete     — günün fihristi (sunucu taraflı HTML, herkese açık)
//  • TÜİK             — portal JS gerektirdiği için sunucu taraflı erişim sınırlı;
//                       erişilemezse dürüstçe "veri bulunamadı" döner.

import { guvenliFetch, KaynakHatasi, type FetchSecenek } from "./fetcher.js";
import { rssItemleriCoz, pubDateToISO, htmlLinkleriCoz } from "./rss.js";
import { bugunISO, kaynakGuvenilirligi, type Kanit, type KaynakSonuc } from "./tipler.js";

function hataSonucu(e: unknown, kaynakAdi: string): KaynakSonuc {
  const mesaj = e instanceof KaynakHatasi ? `${e.tur}: ${e.message}` : String(e);
  return { durum: "hata", kanitlar: [], not: `${kaynakAdi} erişilemedi — ${mesaj}. Veri bulunamadı.` };
}

// ── Google News RSS ──
export async function haberAra(sorgu: string, secenek: FetchSecenek = {}): Promise<KaynakSonuc> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(sorgu)}&hl=tr&gl=TR&ceid=TR:tr`;
  try {
    const xml = await guvenliFetch(url, secenek);
    const itemler = rssItemleriCoz(xml).slice(0, 8);
    if (itemler.length === 0) {
      return { durum: "veri bulunamadı", kanitlar: [], not: `Google News'te "${sorgu}" için sonuç yok.` };
    }
    const kanitlar: Kanit[] = itemler.map((i) => ({
      iddia: i.title,
      url: i.link,
      kaynak: i.source ?? "Google News",
      yayinTarihi: pubDateToISO(i.pubDate),
      erisimTarihi: bugunISO(),
      guvenilirlik: kaynakGuvenilirligi(i.link) * 0.95, // haber ikincil kaynaktır, hafif kırp
    }));
    return { durum: "ok", kanitlar };
  } catch (e) {
    return hataSonucu(e, "Google News RSS");
  }
}

// ── Google Trends RSS (Türkiye günlük trendler) ──
export interface TrendMaddesi {
  baslik: string;
  yaklasikTrafik?: string;
  haberBasligi?: string;
  haberUrl?: string;
}

export async function trendlerTR(secenek: FetchSecenek = {}): Promise<KaynakSonuc & { trendler: TrendMaddesi[] }> {
  const url = "https://trends.google.com/trending/rss?geo=TR";
  try {
    const xml = await guvenliFetch(url, secenek);
    const itemler = rssItemleriCoz(xml, ["ht:approx_traffic", "ht:news_item_title", "ht:news_item_url"]);
    if (itemler.length === 0) {
      return { durum: "veri bulunamadı", kanitlar: [], trendler: [], not: "Trends feed'i boş döndü." };
    }
    const trendler: TrendMaddesi[] = itemler.map((i) => ({
      baslik: i.title,
      yaklasikTrafik: i.extra["ht:approx_traffic"],
      haberBasligi: i.extra["ht:news_item_title"],
      haberUrl: i.extra["ht:news_item_url"],
    }));
    const kanitlar: Kanit[] = itemler.map((i) => ({
      iddia: `"${i.title}" Türkiye'de trend (${i.extra["ht:approx_traffic"] ?? "trafik bilinmiyor"})`,
      url: i.extra["ht:news_item_url"] ?? url,
      kaynak: "Google Trends TR",
      yayinTarihi: pubDateToISO(i.pubDate),
      erisimTarihi: bugunISO(),
      guvenilirlik: 0.8,
    }));
    return { durum: "ok", kanitlar, trendler };
  } catch (e) {
    return { ...hataSonucu(e, "Google Trends RSS"), trendler: [] };
  }
}

// ── Resmî Gazete (günün fihristi) ──
export async function resmiGazeteAra(anahtarKelimeler: string[], secenek: FetchSecenek = {}): Promise<KaynakSonuc> {
  const url = "https://www.resmigazete.gov.tr/";
  try {
    const html = await guvenliFetch(url, secenek);
    const linkler = htmlLinkleriCoz(html);
    const kucukKelimeler = anahtarKelimeler.map((k) => k.toLocaleLowerCase("tr"));
    const eslesen = linkler.filter((l) => {
      const metin = l.metin.toLocaleLowerCase("tr");
      return kucukKelimeler.some((k) => metin.includes(k));
    });
    if (eslesen.length === 0) {
      return {
        durum: "veri bulunamadı",
        kanitlar: [],
        not: `Bugünkü Resmî Gazete fihristinde [${anahtarKelimeler.join(", ")}] ile eşleşen madde yok (erişim: ${bugunISO()}).`,
      };
    }
    const kanitlar: Kanit[] = eslesen.slice(0, 10).map((l) => ({
      iddia: l.metin.slice(0, 200),
      url: l.href.startsWith("http") ? l.href : `https://www.resmigazete.gov.tr${l.href}`,
      kaynak: "Resmî Gazete",
      yayinTarihi: new Date().toISOString(),
      erisimTarihi: bugunISO(),
      guvenilirlik: 1.0,
    }));
    return { durum: "ok", kanitlar };
  } catch (e) {
    return hataSonucu(e, "Resmî Gazete");
  }
}

// ── TÜİK ──
// Veri portalı istemci taraflı render edildiği için sunucudan ham veri çekilemiyor.
// Yine de deniyoruz; gövdede "JavaScript" duvarı görürsek dürüstçe raporluyoruz.
export async function tuikDene(secenek: FetchSecenek = {}): Promise<KaynakSonuc> {
  const url = "https://data.tuik.gov.tr/";
  try {
    const html = await guvenliFetch(url, secenek);
    if (/JavaScript (Gerekli|Required)/i.test(html) || html.length < 2000) {
      return {
        durum: "veri bulunamadı",
        kanitlar: [],
        not: "TÜİK veri portalı JavaScript gerektiriyor; sunucu taraflı ham veri çekilemiyor. İstatistik gerekiyorsa https://data.tuik.gov.tr adresinden manuel kontrol önerilir. Tahmin üretilmedi.",
      };
    }
    // Portal bir gün sunucu taraflı içerik dönerse bülten linklerini yakala
    const linkler = htmlLinkleriCoz(html).filter((l) => /bulten|haber/i.test(l.href)).slice(0, 5);
    if (linkler.length === 0) {
      return { durum: "veri bulunamadı", kanitlar: [], not: "TÜİK sayfasında ayrıştırılabilir bülten bulunamadı." };
    }
    return {
      durum: "ok",
      kanitlar: linkler.map((l) => ({
        iddia: l.metin.slice(0, 200),
        url: l.href.startsWith("http") ? l.href : `https://data.tuik.gov.tr${l.href}`,
        kaynak: "TÜİK",
        erisimTarihi: bugunISO(),
        guvenilirlik: 1.0,
      })),
    };
  } catch (e) {
    return hataSonucu(e, "TÜİK");
  }
}
