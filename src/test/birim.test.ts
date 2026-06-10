// ── Birim testleri — node:test, ağa çıkmaz, fetch mock'lanır ──
import { test } from "node:test";
import assert from "node:assert/strict";

import { canliVeriyleBirlestir, fikriAnalizEt } from "../analiz.js";
import { gunlukFirsatRadari, pazarArastir, rakipAnaliz, regulasyonKontrol, ticariTrendleriSec } from "../arastirma.js";
import { cacheTemizle, guvenliFetch, KaynakHatasi, type FetchFn } from "../fetcher.js";
import { birimEkonomiHesapla, dogrulamaPlaniOlustur, fikirleriKarsilastir } from "../karar.js";
import { haberAra, resmiGazeteAra, trendlerTR, tuikDene } from "../kaynaklar.js";
import { entityCoz, htmlLinkleriCoz, rssItemleriCoz } from "../rss.js";
import { kaynakGuvenilirligi, tazelikPuani, veriKalitesiPuani } from "../tipler.js";

// ── yardımcılar ──
function mockFetch(yanitlar: Record<string, { status?: number; body?: string }>): FetchFn {
  return (async (girdi: any) => {
    const url = String(girdi);
    const anahtar = Object.keys(yanitlar).find((k) => url.includes(k));
    if (!anahtar) return new Response("not found", { status: 404 });
    const y = yanitlar[anahtar];
    return new Response(y.body ?? "", { status: y.status ?? 200 });
  }) as FetchFn;
}

const ORNEK_RSS = `<?xml version="1.0"?><rss><channel>
<item><title>Fintech girişimi 10 milyon dolar yatırım aldı</title><link>https://webrazzi.com/ornek</link><pubDate>${new Date().toUTCString()}</pubDate><source url="https://webrazzi.com">Webrazzi</source></item>
<item><title>BDDK&apos;dan yeni ödeme kuruluşu lisansı</title><link>https://www.aa.com.tr/ornek</link><pubDate>${new Date().toUTCString()}</pubDate><source url="https://aa.com.tr">AA</source></item>
</channel></rss>`;

const ORNEK_TRENDS = `<?xml version="1.0"?><rss xmlns:ht="https://trends.google.com/trending/rss"><channel>
<item><title>yapay zeka</title><ht:approx_traffic>5000+</ht:approx_traffic><pubDate>${new Date().toUTCString()}</pubDate><ht:news_item><ht:news_item_title>AI haberi</ht:news_item_title><ht:news_item_url>https://ntv.com.tr/ai</ht:news_item_url></ht:news_item></item>
<item><title>arda turan</title><ht:approx_traffic>20000+</ht:approx_traffic><pubDate>${new Date().toUTCString()}</pubDate><ht:news_item><ht:news_item_title>Transfer haberi</ht:news_item_title><ht:news_item_url>https://spor.test/transfer</ht:news_item_url></ht:news_item></item>
<item><title>e devlet çöktü mü</title><ht:approx_traffic>1000+</ht:approx_traffic><pubDate>${new Date().toUTCString()}</pubDate><ht:news_item><ht:news_item_title>Erişim problemi</ht:news_item_title><ht:news_item_url>https://haber.test/edevlet</ht:news_item_url></ht:news_item></item>
</channel></rss>`;

const ORNEK_GAZETE = `<html><body>
<a href="/eskiler/2026/06/1.htm">Elektronik Ticarette Hizmet Sağlayıcılar Hakkında Yönetmelikte Değişiklik</a>
<a href="/eskiler/2026/06/2.htm">Atama Kararları</a>
</body></html>`;

// ── tipler ──
test("kaynakGuvenilirligi: gov.tr=1.0, bilinmeyen=0.5", () => {
  assert.equal(kaynakGuvenilirligi("https://www.resmigazete.gov.tr/x"), 1.0);
  assert.equal(kaynakGuvenilirligi("https://rastgele-blog.com/x"), 0.5);
});

test("tazelikPuani: yeni=1.0, tarihsiz=0.4, eski düşük", () => {
  assert.equal(tazelikPuani(new Date().toISOString()), 1.0);
  assert.equal(tazelikPuani(undefined), 0.4);
  assert.ok(tazelikPuani("2020-01-01T00:00:00Z") <= 0.2);
});

test("veriKalitesiPuani: kanıt yoksa 0", () => {
  assert.equal(veriKalitesiPuani([]), 0);
});

// ── rss ──
test("rssItemleriCoz: başlık, link, pubDate ve namespace'li tag çözer", () => {
  const itemler = rssItemleriCoz(ORNEK_TRENDS, ["ht:approx_traffic", "ht:news_item_url"]);
  assert.equal(itemler.length, 3);
  assert.equal(itemler[0].title, "yapay zeka");
  assert.equal(itemler[0].extra["ht:approx_traffic"], "5000+");
  assert.equal(itemler[0].extra["ht:news_item_url"], "https://ntv.com.tr/ai");
});

test("entityCoz: HTML entity'leri çözer", () => {
  assert.equal(entityCoz("BDDK&apos;dan &amp; SPK"), "BDDK'dan & SPK");
});

test("htmlLinkleriCoz: anchor'ları çıkarır", () => {
  const linkler = htmlLinkleriCoz(ORNEK_GAZETE);
  assert.equal(linkler.length, 2);
  assert.ok(linkler[0].metin.includes("Elektronik Ticarette"));
});

// ── fetcher ──
test("guvenliFetch: HTTP hatasında KaynakHatasi fırlatır, retry yapmaz", async () => {
  cacheTemizle();
  let cagri = 0;
  const f: FetchFn = (async () => {
    cagri++;
    return new Response("yok", { status: 500 });
  }) as FetchFn;
  await assert.rejects(guvenliFetch("https://x.test/a", { fetchFn: f }), (e: any) => e instanceof KaynakHatasi && e.tur === "http");
  assert.equal(cagri, 1);
});

test("guvenliFetch: ağ hatasında retry yapar", async () => {
  cacheTemizle();
  let cagri = 0;
  const f: FetchFn = (async () => {
    cagri++;
    if (cagri === 1) throw new Error("ECONNRESET");
    return new Response("tamam", { status: 200 });
  }) as FetchFn;
  const govde = await guvenliFetch("https://x.test/b", { fetchFn: f });
  assert.equal(govde, "tamam");
  assert.equal(cagri, 2);
});

test("guvenliFetch: cache ikinci çağrıda ağa çıkmaz", async () => {
  cacheTemizle();
  let cagri = 0;
  const f: FetchFn = (async () => {
    cagri++;
    return new Response("veri", { status: 200 });
  }) as FetchFn;
  await guvenliFetch("https://x.test/c", { fetchFn: f });
  await guvenliFetch("https://x.test/c", { fetchFn: f });
  assert.equal(cagri, 1);
});

// ── kaynaklar ──
test("haberAra: RSS'i kanıta çevirir, URL + erişim tarihi dolu", async () => {
  cacheTemizle();
  const sonuc = await haberAra("fintech", { fetchFn: mockFetch({ "news.google.com": { body: ORNEK_RSS } }) });
  assert.equal(sonuc.durum, "ok");
  assert.equal(sonuc.kanitlar.length, 2);
  assert.ok(sonuc.kanitlar[0].url.startsWith("https://"));
  assert.match(sonuc.kanitlar[0].erisimTarihi, /^\d{4}-\d{2}-\d{2}$/);
});

test("haberAra: boş feed → 'veri bulunamadı', uydurma yok", async () => {
  cacheTemizle();
  const sonuc = await haberAra("hicbirsey", { fetchFn: mockFetch({ "news.google.com": { body: "<rss><channel></channel></rss>" } }) });
  assert.equal(sonuc.durum, "veri bulunamadı");
  assert.equal(sonuc.kanitlar.length, 0);
});

test("haberAra: ağ çökse de hata sonucu döner, fırlatmaz", async () => {
  cacheTemizle();
  const f: FetchFn = (async () => {
    throw new Error("ağ yok");
  }) as FetchFn;
  const sonuc = await haberAra("x", { fetchFn: f, retry: 0 });
  assert.equal(sonuc.durum, "hata");
  assert.ok(sonuc.not?.includes("veri bulunamadı") || sonuc.not?.includes("Veri bulunamadı"));
});

test("trendlerTR: trend maddelerini çözer", async () => {
  cacheTemizle();
  const sonuc = await trendlerTR({ fetchFn: mockFetch({ "trends.google.com": { body: ORNEK_TRENDS } }) });
  assert.equal(sonuc.durum, "ok");
  assert.equal(sonuc.trendler[0].baslik, "yapay zeka");
  assert.equal(sonuc.trendler[0].yaklasikTrafik, "5000+");
});

test("resmiGazeteAra: anahtar kelime eşleşir, gov.tr güvenilirliği 1.0", async () => {
  cacheTemizle();
  const sonuc = await resmiGazeteAra(["ticaret"], { fetchFn: mockFetch({ "resmigazete.gov.tr": { body: ORNEK_GAZETE } }) });
  assert.equal(sonuc.durum, "ok");
  assert.equal(sonuc.kanitlar[0].guvenilirlik, 1.0);
  assert.ok(sonuc.kanitlar[0].url.startsWith("https://www.resmigazete.gov.tr/"));
});

test("resmiGazeteAra: eşleşme yoksa 'veri bulunamadı'", async () => {
  cacheTemizle();
  const sonuc = await resmiGazeteAra(["uzaymadenciliği"], { fetchFn: mockFetch({ "resmigazete.gov.tr": { body: ORNEK_GAZETE } }) });
  assert.equal(sonuc.durum, "veri bulunamadı");
});

test("tuikDene: JS duvarında dürüstçe 'veri bulunamadı' der", async () => {
  cacheTemizle();
  const sonuc = await tuikDene({ fetchFn: mockFetch({ "tuik.gov.tr": { body: "<html>JavaScript Gerekli</html>" } }) });
  assert.equal(sonuc.durum, "veri bulunamadı");
  assert.ok(sonuc.not?.includes("Tahmin üretilmedi"));
});

// ── arastirma ──
const TUM_KAYNAK_MOCK = mockFetch({
  "news.google.com": { body: ORNEK_RSS },
  "trends.google.com": { body: ORNEK_TRENDS },
  "resmigazete.gov.tr": { body: ORNEK_GAZETE },
  "tuik.gov.tr": { body: "<html>JavaScript Gerekli</html>" },
});

test("pazarArastir: rapor özet+kanıt+risk+MVP içerir", async () => {
  cacheTemizle();
  const { rapor, veriKalitesi } = await pazarArastir("fintech", { fetchFn: TUM_KAYNAK_MOCK });
  assert.ok(rapor.includes("ÖZET"));
  assert.ok(rapor.includes("KANITLAR"));
  assert.ok(rapor.includes("RİSKLER"));
  assert.ok(rapor.includes("ÖNERİLEN MVP"));
  assert.ok(rapor.includes("erişim:"));
  assert.ok(veriKalitesi > 0);
});

test("rakipAnaliz: bölümler ve kaynak URL'leri var", async () => {
  cacheTemizle();
  const { rapor } = await rakipAnaliz("ödeme sistemi", { fetchFn: TUM_KAYNAK_MOCK });
  assert.ok(rapor.includes("Rakip sinyalleri"));
  assert.ok(rapor.includes("https://"));
});

test("regulasyonKontrol: Resmî Gazete + haber bölümleri", async () => {
  cacheTemizle();
  const { rapor } = await regulasyonKontrol("elektronik ticaret", { fetchFn: TUM_KAYNAK_MOCK });
  assert.ok(rapor.includes("Resmî Gazete"));
  assert.ok(rapor.includes("hukuki danışmanlık") || rapor.includes("Hukuki danışmanlık") || rapor.includes("hukuki danışmanlık değildir"));
});

test("gunlukFirsatRadari: trendler + haberler raporda", async () => {
  cacheTemizle();
  const { rapor } = await gunlukFirsatRadari({ fetchFn: TUM_KAYNAK_MOCK });
  assert.ok(rapor.includes("yapay zeka"));
  assert.ok(rapor.includes("GÜNLÜK FIRSAT RADARI"));
  assert.ok(rapor.includes("BİLDİRİMLİK TİCARİ FIRSAT ADAYLARI"));
  assert.ok(!rapor.includes("arda turan"));
});

test("ticariTrendleriSec: spor/siyaseti eler, ticari sinyalleri sıralar", () => {
  const adaylar = ticariTrendleriSec([
    { baslik: "arda turan", yaklasikTrafik: "20000+", haberBasligi: "transfer haberi" },
    { baslik: "yapay zeka", yaklasikTrafik: "5000+", haberBasligi: "AI agent yatırımı" },
    { baslik: "e devlet çöktü mü", yaklasikTrafik: "1000+", haberBasligi: "erişim problemi" },
  ]);
  assert.equal(adaylar.length, 2);
  assert.equal(adaylar[0].baslik, "yapay zeka");
  assert.ok(adaylar.every((aday) => aday.ticariPuan >= 5));
});

test("ticariTrendleriSec: ticari sinyal yoksa boş döner", () => {
  const adaylar = ticariTrendleriSec([
    { baslik: "ünlü oyuncu yeni dizisi", yaklasikTrafik: "20000+" },
    { baslik: "futbol transfer haberi", yaklasikTrafik: "50000+" },
  ]);
  assert.equal(adaylar.length, 0);
});

test("araştırma: tüm kaynaklar çökünce rapor 'veri bulunamadı' ile döner, fırlatmaz", async () => {
  cacheTemizle();
  const olu: FetchFn = (async () => {
    throw new Error("internet yok");
  }) as FetchFn;
  const { rapor, veriKalitesi } = await pazarArastir("fintech", { fetchFn: olu, retry: 0 });
  assert.ok(rapor.includes("veri bulunamadı"));
  assert.equal(veriKalitesi, 0);
});

// ── analiz + canlı veri birleşimi ──
test("canliVeriyleBirlestir: null → offline not eklenir, puan değişmez", () => {
  const statik = fikriAnalizEt("KOBİ'ler için Türkçe AI chatbot, aylık abonelik", "saas", "KOBİ", "abonelik");
  const sonuc = canliVeriyleBirlestir(statik, null);
  assert.equal(sonuc.puan, statik.puan);
  assert.ok(sonuc.riskler.some((r) => r.includes("offline")));
});

test("canliVeriyleBirlestir: veri kalitesi puana dahil, 0-100 sınırında", () => {
  const statik = fikriAnalizEt("KOBİ'ler için Türkçe AI chatbot, aylık abonelik", "saas", "KOBİ", "abonelik");
  const sonuc = canliVeriyleBirlestir(statik, 8);
  assert.equal(sonuc.puan, Math.min(100, Math.round(statik.puan * 0.9) + 8));
  assert.ok("Canlı Veri Doğrulaması" in sonuc.kirilim);
});

test("canliVeriyleBirlestir: düşük kanıt kalitesi risk olarak yazılır", () => {
  const statik = fikriAnalizEt("Bambaşka niş bir fikir hakkında uzun açıklama metni");
  const sonuc = canliVeriyleBirlestir(statik, 1);
  assert.ok(sonuc.riskler.some((r) => r.includes("kanıt kalitesi düşük")));
});

// ── v3 karar araçları ──
test("fikirleriKarsilastir: fikirleri sıralar ve karar önerir", () => {
  const rapor = fikirleriKarsilastir([
    {
      ad: "KOBİ AI",
      fikir: "Türkiye KOBİleri için Türkçe WhatsApp yapay zeka müşteri destek chatbotu",
      sektor: "B2B SaaS",
      hedefKitle: "KOBİ",
      gelirModeli: "aylık abonelik",
    },
    {
      ad: "Yemek",
      fikir: "Türkiye genelinde yeni yemek siparişi ve hızlı teslimat pazaryeri",
      sektor: "e-ticaret",
      hedefKitle: "herkes",
      gelirModeli: "komisyon",
    },
  ]);
  assert.ok(rapor.includes("KOBİ AI"));
  assert.ok(rapor.includes("SIRALAMA"));
  assert.ok(rapor.includes("KARAR"));
});

test("birimEkonomiHesapla: sağlıklı model için temel metrikleri hesaplar", () => {
  const rapor = birimEkonomiHesapla({
    aylikFiyat: 1000,
    brutMarjYuzde: 80,
    musteriEdinmeMaliyeti: 1500,
    aylikChurnYuzde: 5,
    aylikSabitGider: 100000,
  });
  assert.ok(rapor.includes("SAĞLIKLI"));
  assert.ok(rapor.includes("LTV/CAC"));
  assert.ok(rapor.includes("Başa baş"));
});

test("birimEkonomiHesapla: kötü ekonomi için tehlikeli kararı verir", () => {
  const rapor = birimEkonomiHesapla({
    aylikFiyat: 100,
    brutMarjYuzde: 30,
    musteriEdinmeMaliyeti: 1000,
    aylikChurnYuzde: 20,
    aylikSabitGider: 100000,
  });
  assert.ok(rapor.includes("TEHLİKELİ"));
});

test("dogrulamaPlaniOlustur: eşikler ve öldürme kriterleri üretir", () => {
  const rapor = dogrulamaPlaniOlustur({
    fikir: "KOBİler için Türkçe yapay zeka müşteri destek chatbotu",
    hedefKitle: "10-50 çalışanlı e-ticaret KOBİleri",
    gelirModeli: "aylık abonelik",
    gun: 14,
    butceTl: 4000,
  });
  assert.ok(rapor.includes("14 GÜNLÜK"));
  assert.ok(rapor.includes("ÖLDÜRME KRİTERLERİ"));
  assert.ok(rapor.includes("GO:"));
});
