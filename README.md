# 🇹🇷 Türkiye Fırsat Radarı — MCP Server

Poke uyumlu MCP server. AI/startup/internet iş fikirlerini Türkiye pazarına göre analiz eder,
kötü fikirleri eler, iyi fikirleri 100 üzerinden puanlar ve istersen Notion database'ine kaydeder.

- **TypeScript + Node.js 18+**, Streamable HTTP transport (`/mcp`)
- **Full lokal çalışır** — analiz için hiçbir harici API gerekmez
- **Notion opsiyonel** — token yoksa analiz aracı yine çalışır
- **Cloud'a da atılabilir** — Render free tier config'i hazır

## Araçlar

| Araç | Ne yapar |
|---|---|
| `firsat_analiz` | Fikri analiz eder: pazar potansiyeli (25), Türkiye uyumu (25), rekabet (20), regülasyon riski (15), gelir modeli (15). Toplam 100. **<40 = ELENDİ, 40-69 = ORTA, 70+ = FIRSAT** |
| `notion_kaydet` | Analiz edip sonucu Notion database'ine yazar (token gerekir) |
| `radar_durum` | Server ve Notion bağlantı durumunu gösterir |

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
  index.ts    → Express + Streamable HTTP MCP server (stateless, /mcp)
  analiz.ts   → Deterministik skorlama motoru (keyword tabanlı, harici API yok)
  notion.ts   → Opsiyonel Notion API entegrasyonu (native fetch, ekstra paket yok)
```
