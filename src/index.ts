// ── Türkiye Fırsat Radarı MCP Server ──
// Streamable HTTP transport @ /mcp — Poke tunnel ve cloud deploy ile uyumlu.
// Lokal:  npm run dev  →  npx poke@latest tunnel http://localhost:3000/mcp -n "Turkiye Firsat Radari MCP" --recipe
// Cloud:  PORT env'den okunur, Render/Railway gibi platformlarda direkt çalışır.

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { canliVeriyleBirlestir, fikriAnalizEt, raporYaz } from "./analiz.js";
import { gunlukFirsatRadari, klonRadar, pazarArastir, rakipAnaliz, regulasyonKontrol } from "./arastirma.js";
import { birimEkonomiHesapla, dogrulamaPlaniOlustur, fikirleriKarsilastir } from "./karar.js";
import { hafizaRaporu, notionGecmis, notionaKaydet, notionHazirMi } from "./notion.js";

function serverOlustur(): McpServer {
  const server = new McpServer({
    name: "turkiye-firsat-radari",
    version: "3.2.0",
  });

  server.registerTool(
    "firsat_analiz",
    {
      title: "Türkiye Fırsat Analizi (canlı verili)",
      description:
        "Yeni bir AI/startup/internet iş fikrini Türkiye pazarına göre analiz eder. " +
        "Statik skorlamayı güncel haber/trend kanıtlarıyla birleştirir: pazar potansiyeli, Türkiye uyumu, " +
        "rekabet, regülasyon riski, gelir modeli + canlı veri doğrulaması (kaynak güvenilirliği ve güncellik puana dahil). " +
        "100 üzerinden puanlar: 40 altı ELENDİ, 70+ FIRSAT. Her kanıt için kaynak URL'si ve erişim tarihi döner; " +
        "kaynak bulunamazsa 'veri bulunamadı' yazar, tahmin üretmez.",
      inputSchema: {
        fikir: z.string().min(10).describe("İş fikrinin açıklaması (ne kadar detaylı o kadar iyi)"),
        sektor: z.string().optional().describe("Sektör (örn: fintech, edtech, oyun, e-ticaret)"),
        hedef_kitle: z.string().optional().describe("Hedef kitle (örn: KOBİ'ler, üniversite öğrencileri)"),
        gelir_modeli: z.string().optional().describe("Planlanan gelir modeli (örn: abonelik, komisyon)"),
      },
    },
    async ({ fikir, sektor, hedef_kitle, gelir_modeli }) => {
      const statik = fikriAnalizEt(fikir, sektor, hedef_kitle, gelir_modeli);
      const arastirmaKonusu = [sektor, fikir.slice(0, 80)].filter(Boolean).join(" ");

      let canliRapor = "";
      let veriKalitesi: number | null = null;
      try {
        const arastirma = await pazarArastir(arastirmaKonusu);
        veriKalitesi = arastirma.veriKalitesi;
        canliRapor = `\n\n${arastirma.rapor}`;
      } catch (e) {
        canliRapor = `\n\n⛔ Canlı veri araştırması başarısız: ${e instanceof Error ? e.message : String(e)} — skor offline modda.`;
      }

      const sonuc = canliVeriyleBirlestir(statik, veriKalitesi);

      // Radar hafızası (Notion yapılandırılmışsa): önceki skorla karşılaştır + otomatik kaydet
      let hafiza = "";
      if (notionHazirMi()) {
        const gecmis = await notionGecmis(fikir);
        hafiza = hafizaRaporu(gecmis, sonuc.puan);
        await notionaKaydet(fikir, sonuc); // hafıza için otomatik kayıt
      }

      return {
        content: [{ type: "text", text: `${raporYaz(fikir, sonuc)}${hafiza}${canliRapor}` }],
      };
    }
  );

  server.registerTool(
    "klon_radar",
    {
      title: "Klon Radarı (global → Türkiye)",
      description:
        "Dünyada yeni çıkan ürünleri (Product Hunt + Show HN) tarar, her biri için Türkçe haber taraması yapar " +
        "ve Türkiye'de görünür oyuncu sinyali olmayan ürünleri 'boşluk adayı' olarak işaretler. " +
        "Her bulgu kaynak URL'si ve erişim tarihiyle döner. 'TR'de haber yok ≠ rakip yok' uyarısını her zaman içerir.",
      inputSchema: {},
    },
    async () => {
      const { rapor } = await klonRadar();
      return { content: [{ type: "text", text: rapor }] };
    }
  );

  server.registerTool(
    "pazar_arastir",
    {
      title: "Pazar Araştırması (Türkiye)",
      description:
        "Bir konu/sektör için Türkiye odaklı güncel pazar araştırması yapar: haber sinyalleri, pazar büyüklüğü " +
        "haberleri, yatırım/girişim hareketliliği ve TÜİK açık verisi denemesi. Her iddia kaynak URL'si ve erişim " +
        "tarihiyle döner; veri yoksa 'veri bulunamadı' der. Kısa özet + kanıtlar + riskler + önerilen MVP formatında.",
      inputSchema: {
        konu: z.string().min(3).describe("Araştırılacak konu/sektör (örn: 'KOBİ muhasebe yazılımı')"),
      },
    },
    async ({ konu }) => {
      const { rapor } = await pazarArastir(konu);
      return { content: [{ type: "text", text: rapor }] };
    }
  );

  server.registerTool(
    "rakip_analiz",
    {
      title: "Rakip Analizi (Türkiye)",
      description:
        "Bir konu/ürün için Türkiye'deki rakipleri, fiyat sinyallerini ve müşteri şikayetlerini haber kaynaklarından " +
        "tarar, pazar boşluklarını çıkarır. Şikayet platformları kullanım şartları gereği scrape edilmez. " +
        "Her bulgu kaynaklı döner; bulunamayan veri için 'veri bulunamadı' yazılır.",
      inputSchema: {
        konu: z.string().min(3).describe("Rakipleri analiz edilecek konu/ürün (örn: 'online terapi platformu')"),
      },
    },
    async ({ konu }) => {
      const { rapor } = await rakipAnaliz(konu);
      return { content: [{ type: "text", text: rapor }] };
    }
  );

  server.registerTool(
    "regulasyon_kontrol",
    {
      title: "Regülasyon Kontrolü (Türkiye)",
      description:
        "Bir konunun Türkiye'deki regülasyon durumunu tarar: bugünkü Resmî Gazete fihristi (resmigazete.gov.tr) + " +
        "güncel mevzuat/yönetmelik haberleri. Hukuki danışmanlık değildir. Kanıtlar URL ve erişim tarihiyle döner.",
      inputSchema: {
        konu: z.string().min(3).describe("Regülasyonu kontrol edilecek konu (örn: 'kripto ödeme', 'e-ticaret vergi')"),
      },
    },
    async ({ konu }) => {
      const { rapor } = await regulasyonKontrol(konu);
      return { content: [{ type: "text", text: rapor }] };
    }
  );

  server.registerTool(
    "gunluk_firsat_radari",
    {
      title: "Günlük Fırsat Radarı (Türkiye)",
      description:
        "Türkiye'nin bugünkü Google Trends aramalarını + güncel AI/startup/yatırım haberlerini tarar. " +
        "Spor, siyaset, magazin, bahis ve para kazanma açısı zayıf trendleri eler; kalan ticari fırsat adaylarını " +
        "puanlayıp ürün açısıyla sıralar. Parametre gerektirmez. Bulgular kaynak URL'si ve erişim tarihiyle döner.",
      inputSchema: {},
    },
    async () => {
      const { rapor } = await gunlukFirsatRadari();
      return { content: [{ type: "text", text: rapor }] };
    }
  );

  server.registerTool(
    "fikir_karsilastir",
    {
      title: "Fikirleri Karşılaştır",
      description:
        "En fazla 5 iş fikrini aynı Türkiye fırsat kriterleriyle karşılaştırır, sıralar ve hangi fikrin neden öne çıktığını söyler. " +
        "Yakın sonuçlarda puanla karar vermek yerine uygulanacak A/B talep testini önerir.",
      inputSchema: {
        fikirler: z
          .array(
            z.object({
              ad: z.string().min(2).describe("Fikrin kısa adı"),
              fikir: z.string().min(10).describe("Fikir açıklaması"),
              sektor: z.string().optional().describe("Sektör"),
              hedefKitle: z.string().optional().describe("Hedef kitle"),
              gelirModeli: z.string().optional().describe("Gelir modeli"),
            })
          )
          .min(2)
          .max(5)
          .describe("Karşılaştırılacak 2-5 fikir"),
      },
    },
    async ({ fikirler }) => ({
      content: [{ type: "text", text: fikirleriKarsilastir(fikirler) }],
    })
  );

  server.registerTool(
    "birim_ekonomi",
    {
      title: "Birim Ekonomi Radarı",
      description:
        "Bir iş modelinin ekonomik olarak çalışıp çalışmadığını hesaplar: LTV, CAC, LTV/CAC, CAC geri ödeme süresi ve başa baş müşteri sayısı. " +
        "Varsayımları görünür kılar ve sağlıklı/sınırda/tehlikeli kararı verir.",
      inputSchema: {
        aylik_fiyat: z.number().positive().describe("Müşteri başına aylık fiyat, TL"),
        brut_marj_yuzde: z.number().positive().max(100).describe("Brüt marj yüzdesi, örn. 80"),
        musteri_edinme_maliyeti: z.number().positive().describe("CAC, TL"),
        aylik_churn_yuzde: z.number().positive().max(100).describe("Aylık müşteri kayıp oranı, örn. 5"),
        aylik_sabit_gider: z.number().nonnegative().describe("Aylık sabit gider, TL"),
        ilk_yatirim: z.number().nonnegative().optional().describe("Başlangıç yatırımı, TL"),
      },
    },
    async ({ aylik_fiyat, brut_marj_yuzde, musteri_edinme_maliyeti, aylik_churn_yuzde, aylik_sabit_gider, ilk_yatirim }) => ({
      content: [
        {
          type: "text",
          text: birimEkonomiHesapla({
            aylikFiyat: aylik_fiyat,
            brutMarjYuzde: brut_marj_yuzde,
            musteriEdinmeMaliyeti: musteri_edinme_maliyeti,
            aylikChurnYuzde: aylik_churn_yuzde,
            aylikSabitGider: aylik_sabit_gider,
            ilkYatirim: ilk_yatirim,
          }),
        },
      ],
    })
  );

  server.registerTool(
    "dogrulama_plani",
    {
      title: "Doğrulama ve MVP Deney Planı",
      description:
        "Bir iş fikri için 7-30 günlük kanıt odaklı doğrulama planı üretir. Görüşme, landing page ve ödeme testleri; başarı eşikleri; " +
        "GO/PIVOT/STOP ve öldürme kriterleri içerir. Kod yazmadan önce kullan.",
      inputSchema: {
        fikir: z.string().min(10).describe("Doğrulanacak iş fikri"),
        hedef_kitle: z.string().min(2).describe("İlk hedef müşteri segmenti"),
        gelir_modeli: z.string().optional().describe("Planlanan gelir modeli/fiyatlama"),
        gun: z.number().int().min(7).max(30).default(14).describe("Plan süresi, 7-30 gün"),
        butce_tl: z.number().nonnegative().optional().describe("Doğrulama reklam/test bütçesi, TL"),
      },
    },
    async ({ fikir, hedef_kitle, gelir_modeli, gun, butce_tl }) => ({
      content: [
        {
          type: "text",
          text: dogrulamaPlaniOlustur({
            fikir,
            hedefKitle: hedef_kitle,
            gelirModeli: gelir_modeli,
            gun,
            butceTl: butce_tl,
          }),
        },
      ],
    })
  );

  server.registerTool(
    "notion_kaydet",
    {
      title: "Notion'a Kaydet",
      description:
        "Bir iş fikrini analiz edip sonucu Notion database'ine kaydeder. " +
        "NOTION_TOKEN ve NOTION_DATABASE_ID env değişkenleri gerekir; yoksa kaydetmez ama hata da vermez. " +
        "Sadece kullanıcı açıkça kaydetmek istediğinde kullan.",
      inputSchema: {
        fikir: z.string().min(10).describe("Kaydedilecek iş fikrinin açıklaması"),
        sektor: z.string().optional().describe("Sektör"),
        hedef_kitle: z.string().optional().describe("Hedef kitle"),
        gelir_modeli: z.string().optional().describe("Gelir modeli"),
      },
    },
    async ({ fikir, sektor, hedef_kitle, gelir_modeli }) => {
      const sonuc = fikriAnalizEt(fikir, sektor, hedef_kitle, gelir_modeli);
      const mesaj = await notionaKaydet(fikir, sonuc);
      return {
        content: [{ type: "text", text: `${raporYaz(fikir, sonuc)}\n\n---\n${mesaj}` }],
      };
    }
  );

  server.registerTool(
    "radar_durum",
    {
      title: "Radar Durumu",
      description: "Türkiye Fırsat Radarı'nın durumunu ve Notion bağlantısının aktif olup olmadığını gösterir.",
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text",
          text: [
            "🇹🇷 Türkiye Fırsat Radarı aktif.",
            `Notion bağlantısı: ${notionHazirMi() ? "✅ hazır" : "❌ yapılandırılmamış (analiz yine de çalışır)"}`,
            "Araçlar: firsat_analiz, klon_radar, pazar_arastir, rakip_analiz, regulasyon_kontrol, gunluk_firsat_radari, fikir_karsilastir, birim_ekonomi, dogrulama_plani, notion_kaydet, radar_durum",
            "Veri kaynakları: Google News RSS, Google Trends RSS, Product Hunt, Show HN, Resmî Gazete, TÜİK (best-effort) — hepsi ücretsiz, API anahtarsız.",
            `Radar hafızası: ${notionHazirMi() ? "✅ aktif — analizler Notion'a kaydedilir, skor değişimi takip edilir" : "❌ pasif (Notion token gerekir)"}`,
          ].join("\n"),
        },
      ],
    })
  );

  return server;
}

const app = express();
app.use(express.json());

// Poke's cloud MCP discovery currently requests JSON only. The MCP SDK requires
// clients to advertise both response formats, so normalize the header for it.
app.use("/mcp", (req, _res, next) => {
  const accept = req.headers.accept ?? "";
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
    const normalizedAccept = "application/json, text/event-stream";
    req.headers.accept = normalizedAccept;

    const rawAcceptIndex = req.rawHeaders.findIndex(
      (header) => header.toLowerCase() === "accept"
    );
    if (rawAcceptIndex >= 0) {
      req.rawHeaders[rawAcceptIndex + 1] = normalizedAccept;
    } else {
      req.rawHeaders.push("Accept", normalizedAccept);
    }
  }
  next();
});

// Stateless mod: her istek için taze transport — Poke tunnel ve serverless ortamlar için en sağlamı.
app.post("/mcp", async (req, res) => {
  try {
    const server = serverOlustur();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error("MCP isteği patladı:", e);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Stateless modda GET/DELETE desteklenmez
app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. POST kullan." },
    id: null,
  });
});

// Cloud platformların health check'i için
app.get("/", (_req, res) => {
  res.json({ status: "ok", server: "turkiye-firsat-radari", endpoint: "/mcp" });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`🇹🇷 Türkiye Fırsat Radarı MCP → http://localhost:${PORT}/mcp`);
  console.log(`Notion: ${notionHazirMi() ? "hazır" : "yapılandırılmamış (opsiyonel)"}`);
});
