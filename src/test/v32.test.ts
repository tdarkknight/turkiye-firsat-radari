// ── v3.2 testleri: klon radarı, derin kanıt, radar hafızası ──
import { test } from "node:test";
import assert from "node:assert/strict";

import { klonRadar } from "../arastirma.js";
import { cacheTemizle, type FetchFn } from "../fetcher.js";
import { derinKanitEkle, hackerNewsShow, productHuntYeniler } from "../kaynaklar.js";
import { hafizaRaporu, notionGecmis } from "../notion.js";
import { atomEntryleriCoz, paragrafCikar } from "../rss.js";
import type { Kanit } from "../tipler.js";

function mockFetch(yanitlar: Record<string, { status?: number; body?: string }>): FetchFn {
  return (async (girdi: any) => {
    const url = String(girdi);
    const anahtar = Object.keys(yanitlar).find((k) => url.includes(k));
    if (!anahtar) return new Response("not found", { status: 404 });
    const y = yanitlar[anahtar];
    return new Response(y.body ?? "", { status: y.status ?? 200 });
  }) as FetchFn;
}

const ORNEK_ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>SuperTool — AI for invoices</title><link rel="alternate" href="https://www.producthunt.com/posts/supertool"/><published>${new Date().toISOString()}</published><content type="html">&lt;p&gt;Automates invoice processing for small businesses with AI magic.&lt;/p&gt;</content></entry>
<entry><title>NoteWiz</title><link href="https://www.producthunt.com/posts/notewiz"/><published>${new Date().toISOString()}</published><summary>Smart note taking app</summary></entry>
</feed>`;

const ORNEK_HN = `<?xml version="1.0"?><rss><channel>
<item><title>Show HN: PdfMagic – convert anything to PDF</title><link>https://news.ycombinator.com/item?id=1</link><pubDate>${new Date().toUTCString()}</pubDate></item>
</channel></rss>`;

const ORNEK_MAKALE = `<html><head><script>var x=1;</script></head><body>
<nav><p>Menü menü menü</p></nav>
<p>Bu, seksen karakterden uzun gerçek bir makale paragrafıdır ve derin kanıt çıkarımının düzgün çalıştığını doğrulamak için yazılmıştır.</p>
<p>kısa</p>
</body></html>`;

const ORNEK_TR_RSS = `<?xml version="1.0"?><rss><channel>
<item><title>SuperTool Türkiye pazarına girdi</title><link>https://webrazzi.com/supertool</link><pubDate>${new Date().toUTCString()}</pubDate><source>Webrazzi</source></item>
</channel></rss>`;

// ── atom parser ──
test("atomEntryleriCoz: entry, link href ve içerik özeti çözer", () => {
  const entryler = atomEntryleriCoz(ORNEK_ATOM);
  assert.equal(entryler.length, 2);
  assert.equal(entryler[0].title, "SuperTool — AI for invoices");
  assert.equal(entryler[0].link, "https://www.producthunt.com/posts/supertool");
  assert.ok(entryler[0].ozet?.includes("Automates invoice"));
});

// ── paragraf çıkarma ──
test("paragrafCikar: script/nav eler, uzun paragrafı alır, kısayı atar", () => {
  const ozet = paragrafCikar(ORNEK_MAKALE);
  assert.ok(ozet);
  assert.ok(ozet!.includes("gerçek bir makale paragrafı"));
  assert.ok(!ozet!.includes("Menü"));
  assert.ok(!ozet!.includes("var x"));
});

test("paragrafCikar: paragraf yoksa undefined — uydurma yok", () => {
  assert.equal(paragrafCikar("<html><body><div>sadece div</div></body></html>"), undefined);
});

// ── PH / HN adaptörleri ──
test("productHuntYeniler: atom feed'den ürün listesi", async () => {
  cacheTemizle();
  const sonuc = await productHuntYeniler({ fetchFn: mockFetch({ "producthunt.com": { body: ORNEK_ATOM } }) });
  assert.equal(sonuc.durum, "ok");
  assert.equal(sonuc.urunler.length, 2);
  assert.equal(sonuc.urunler[0].kaynak, "Product Hunt");
});

test("hackerNewsShow: 'Show HN:' önekini temizler", async () => {
  cacheTemizle();
  const sonuc = await hackerNewsShow({ fetchFn: mockFetch({ "hnrss.org": { body: ORNEK_HN } }) });
  assert.equal(sonuc.durum, "ok");
  assert.equal(sonuc.urunler[0].ad, "PdfMagic – convert anything to PDF");
});

test("PH/HN: feed çökerse 'hata' + boş ürün listesi, fırlatmaz", async () => {
  cacheTemizle();
  const olu: FetchFn = (async () => {
    throw new Error("yok");
  }) as FetchFn;
  const ph = await productHuntYeniler({ fetchFn: olu, retry: 0 });
  assert.equal(ph.durum, "hata");
  assert.equal(ph.urunler.length, 0);
});

// ── derin kanıt ──
test("derinKanitEkle: gerçek paragrafı alıntı olarak ekler, google news linkini atlar", async () => {
  cacheTemizle();
  const kanitlar: Kanit[] = [
    { iddia: "a", url: "https://ornek.com/makale", kaynak: "X", erisimTarihi: "2026-06-10", guvenilirlik: 0.7 },
    { iddia: "b", url: "https://news.google.com/rss/articles/xyz", kaynak: "Y", erisimTarihi: "2026-06-10", guvenilirlik: 0.7 },
  ];
  await derinKanitEkle(kanitlar, { fetchFn: mockFetch({ "ornek.com": { body: ORNEK_MAKALE } }), retry: 0 });
  assert.ok(kanitlar[0].alinti?.includes("gerçek bir makale"));
  assert.equal(kanitlar[1].alinti, undefined);
});

test("derinKanitEkle: sayfa çökerse alıntısız devam eder", async () => {
  cacheTemizle();
  const kanitlar: Kanit[] = [
    { iddia: "a", url: "https://patlak.com/x", kaynak: "X", erisimTarihi: "2026-06-10", guvenilirlik: 0.7 },
  ];
  const olu: FetchFn = (async () => {
    throw new Error("çöktü");
  }) as FetchFn;
  await derinKanitEkle(kanitlar, { fetchFn: olu, retry: 0 });
  assert.equal(kanitlar[0].alinti, undefined);
});

// ── klon radarı ──
test("klonRadar: TR sinyali olmayan ürün 'boşluk adayı', olan 'TR'de sinyal var'", async () => {
  cacheTemizle();
  const f = mockFetch({
    "producthunt.com": { body: ORNEK_ATOM },
    "hnrss.org": { body: ORNEK_HN },
    // SuperTool için TR haberi VAR, diğerleri için boş feed
    "SuperTool": { body: ORNEK_TR_RSS },
    "news.google.com": { body: "<rss><channel></channel></rss>" },
  });
  // Not: mockFetch ilk eşleşen anahtarı kullanır; SuperTool sorgusu URL'de geçer
  const { rapor } = await klonRadar({ fetchFn: f }, 4);
  assert.ok(rapor.includes("KLON RADARI"));
  assert.ok(rapor.includes("BOŞLUK ADAYI"));
  assert.ok(rapor.includes("TR'DE SİNYAL VAR"));
  assert.ok(rapor.includes("≠"));
  assert.ok(rapor.includes("producthunt.com"));
});

test("klonRadar: feed'ler tamamen çökünce 'veri bulunamadı'", async () => {
  cacheTemizle();
  const olu: FetchFn = (async () => {
    throw new Error("internet yok");
  }) as FetchFn;
  const { rapor, veriKalitesi } = await klonRadar({ fetchFn: olu, retry: 0 }, 4);
  assert.ok(rapor.includes("veri bulunamadı"));
  assert.equal(veriKalitesi, 0);
});

// ── radar hafızası ──
test("notionGecmis: env yoksa null (hafıza kapalı)", async () => {
  delete process.env.NOTION_TOKEN;
  delete process.env.NOTION_DATABASE_ID;
  assert.equal(await notionGecmis("test fikri"), null);
});

test("notionGecmis: Notion sonuçlarını GecmisKayit'a çevirir", async () => {
  process.env.NOTION_TOKEN = "test-token";
  process.env.NOTION_DATABASE_ID = "test-db";
  const f = mockFetch({
    "api.notion.com": {
      body: JSON.stringify({
        results: [
          { properties: { Puan: { number: 62 }, Karar: { select: { name: "ORTA" } }, Tarih: { date: { start: "2026-05-20" } } } },
        ],
      }),
    },
  });
  const gecmis = await notionGecmis("KOBİ chatbot fikri", f);
  assert.equal(gecmis?.length, 1);
  assert.equal(gecmis![0].puan, 62);
  delete process.env.NOTION_TOKEN;
  delete process.env.NOTION_DATABASE_ID;
});

test("hafizaRaporu: skor artışında pencere mesajı, ilk kayıtta kayıt mesajı", () => {
  assert.ok(hafizaRaporu([{ puan: 62, tarih: "2026-05-20" }], 78).includes("+16"));
  assert.ok(hafizaRaporu([], 70).includes("ilk analiz"));
  assert.equal(hafizaRaporu(null, 70), "");
  assert.ok(hafizaRaporu([{ puan: 80 }], 70).includes("-10"));
});
