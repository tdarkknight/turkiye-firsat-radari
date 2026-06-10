# 🇹🇷 Türkiye Fırsat Radarı — MCP Server (v3)

Poke uyumlu MCP server. AI/startup/internet iş fikirlerini **güncel, kaynaklı Türkiye pazar
verisiyle** analiz eder, kötü fikirleri eler, iyi fikirleri 100 üzerinden puanlar ve istersen
Notion database'ine kaydeder.

- **TypeScript + Node.js 18+**, Streamable HTTP transport (`/mcp`)
- **Ücretsiz, API anahtarsız kaynaklar**: Google News RSS, Google Trends RSS, Resmî Gazete, TÜİK (best-effort)
- **Uydurma yok**: her iddia kaynak URL'si + erişim tarihiyle döner; kaynak yoksa açıkça `veri bulunamadı` yazar
- **Kaynak güvenilirliği ve veri güncelliği puana dahildir** (gov.tr=1.0 … bilinmeyen=0.5; <7 gün=1.0 … >1 yıl=0.2)
- **Dayanıklı**: timeout, retry, rate-limit ve bozuk kaynak durumlarında çökmeden `veri bulunamadı`'ya düşer
- **Notion opsiyonel** — token yoksa analiz araçları yine çalışır
- **Cloud'a da atılabilir** — Render free tier config'i hazır

## Araçlar

| Araç | Ne yapar |
|---|---|
| `firsat_analiz` | Statik skor (0.9x ölçekli: pazar 25, TR uyumu 25, rekabet 20, regülasyon 15, gelir 15) + canlı veri doğrulaması (10). **<40 = ELENDİ, 40-69 = ORTA, 70+ = FIRSAT** |
| `pazar_arastir` | Konu için haber + pazar büyüklüğü + yatırım sinyalleri + TÜİK denemesi. Özet + kanıtlar + riskler + önerilen MVP |
| `rakip_analiz` | Rakip / fiyat / müşteri şikayeti sinyalleri ve pazar boşlukları (haber kaynaklı) |
| `regulasyon_kontrol` | Bugünkü Resmî Gazete fihristi + regülasyon haberleri taraması (hukuki danışmanlık değildir) |
| `gunluk_firsat_radari` | Spor/siyaset/magazini eleyip Google Trends + AI/startup haberlerinden ticari fırsat adaylarını puanlar |
| `fikir_karsilastir` | 2-5 fikri aynı kriterlerle sıralar; kazananı, ana riski ve karar deneyini söyler |
| `birim_ekonomi` | LTV, CAC, LTV/CAC, geri ödeme süresi ve başa baş müşteri sayısını hesaplar |
| `dogrulama_plani` | 7-30 günlük görüşme + landing page + ödeme testi; başarı ve öldürme kriterleri |
| `notion_kaydet` | Analiz edip sonucu Notion database'ine yazar (token gerekir) |
| `radar_durum` | Server ve Notion bağlantı durumunu gösterir |

## Veri kaynakları ve dürüstlük kuralları

- **Google News RSS** (`news.google.com/rss/search`) — Türkiye odaklı haber araması
- **Google Trends RSS** (`trends.google.com/trending/rss?geo=TR`) — günlük arama trendleri
- **Resmî Gazete** (`resmigazete.gov.tr`) — günün fihristi, sunucu taraflı HTML
- **TÜİK** (`data.tuik.gov.tr`) — portal JavaScript gerektirdiği için sunucu taraflı erişim sınırlıdır;
  erişilemezse araç bunu açıkça söyler, tahmin üretmez
- Şikayet platformları (ör. Şikayetvar) kullanım şartları gereği **scrape edilmez**; şikayet sinyali
  haber kaynaklarından derlenir
- Sonuçlar 10 dk cache'lenir (kaynaklara nazik davranmak için)

## Test

```bash
npm test   # tsc build + node:test ile 30 birim testi (ağa çıkmaz, fetch mock'lanır)
```

## Kurulum (Lokal)

```bash
npm install
npm run build
npm start
```

Server `http://localhost:3000/mcp` adresinde ayağa kalkar. Test:

```bash
curl http://localhost:3000/
# {"status":"ok","server":"turkiye-firsat-radari","endpoint":"/mcp"}
```

## Poke'a Bağlama — Yöntem 1: Lokal + Tunnel

Server çalışırken ikinci bir terminalde:

```bash
npx poke@latest tunnel http://localhost:3000/mcp -n "Turkiye Firsat Radari MCP" --recipe
```

Bu komut lokal server'ını Poke'a tünelleyip Recipe içinde araç olarak kullanılabilir hale getirir.
Terminal açık kaldığı sürece bağlantı yaşar. Recipe editöründe `firsat_analiz` ve `notion_kaydet`
araçlarını göreceksin.

> Not: Tunnel sadece bilgisayarın açıkken çalışır. 7/24 istiyorsan aşağıdaki cloud yöntemine geç.

## Poke'a Bağlama — Yöntem 2: Ücretsiz Cloud (Render)

Bilgisayar kapalıyken de çalışsın istiyorsan:

1. Bu klasörü bir GitHub repo'suna pushla
2. [render.com](https://render.com) → ücretsiz hesap aç → **New → Web Service** → repo'yu seç
3. `render.yaml` otomatik algılanır (free plan, build & start komutları hazır)
4. Deploy bitince Render sana bir URL verir: `https://turkiye-firsat-radari-mcp.onrender.com`
5. Poke'ta **Settings → Integrations → Add MCP Server** (veya Recipe editöründe MCP ekleme ekranı)
   ve URL olarak şunu gir:

```
https://SENIN-RENDER-URLIN.onrender.com/mcp
```

Tunnel'a gerek kalmaz, Poke direkt cloud'daki server'a bağlanır.

> ⚠️ Render free tier 15 dk işlem yoksa uyur, ilk istekte ~30 sn'de uyanır. Sıfır maliyetin bedeli bu.
> Alternatif ücretsiz seçenekler: Railway (trial kredisi), Fly.io, Koyeb.

## Notion Kurulumu (Opsiyonel)

Token yoksa `firsat_analiz` yine tam çalışır; sadece `notion_kaydet` "yapılandırılmamış" der.

1. [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New integration** → token'ı kopyala
2. Notion'da bir database oluştur, şu kolonlarla:
   - **Fikir** (Title)
   - **Puan** (Number)
   - **Karar** (Select)
   - **Analiz** (Text)
   - **Tarih** (Date)
3. Database sayfasında **••• → Connections → integration'ını ekle**
4. Database ID'yi URL'den al: `notion.so/xxxxx?v=...` → `xxxxx` kısmı (32 karakter)
5. `.env.example`'ı `.env` olarak kopyala, doldur:

```bash
NOTION_TOKEN=secret_xxxx
NOTION_DATABASE_ID=xxxx
```

Lokalde: `.env`'i yüklemek için `node --env-file=.env dist/index.js` ile başlat
(veya değişkenleri shell'e export et). Render'da: dashboard → Environment sekmesinden ekle.

## Poke Recipe Örneği

Recipe prompt'una şöyle bir şey yazabilirsin:

> "Kullanıcı bir iş fikri attığında `firsat_analiz` aracıyla analiz et.
> Puan 70+ ise kullanıcıya 'Notion'a kaydedeyim mi?' diye sor,
> evet derse `notion_kaydet` ile kaydet. 40 altıysa fikri acımadan ele."

## Mimari

```
src/
  index.ts      → Express + Streamable HTTP MCP server (stateless, /mcp)
  analiz.ts     → Deterministik fırsat skorlama motoru
  arastirma.ts  → Kaynaklı canlı pazar/rakip/regülasyon araştırması
  karar.ts      → Fikir karşılaştırma, birim ekonomi ve doğrulama planı
  notion.ts     → Opsiyonel Notion API entegrasyonu
```
