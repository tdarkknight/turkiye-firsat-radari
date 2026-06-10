// ── Türkiye Fırsat Radarı MCP Server ──
// Streamable HTTP transport @ /mcp — Poke tunnel ve cloud deploy ile uyumlu.
// Lokal:  npm run dev  →  npx poke@latest tunnel http://localhost:3000/mcp -n "Turkiye Firsat Radari MCP" --recipe
// Cloud:  PORT env'den okunur, Render/Railway gibi platformlarda direkt çalışır.

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { canliVeriyleBirlestir, fikriAnalizEt, raporYaz } from "./analiz.js";
import { gunlukFirsatRadari, pazarArastir, rakipAnaliz, regulasyonKontrol } from "./arastirma.js";
import { notionaKaydet, notionHazirMi } from "./notion.js";

function serverOlustur(): McpServer {
  const server = new McpServer({
    name: "turkiye-firsat-radari",
    version: "2.0.0",
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
      return {
        content: [{ type: "text", text: `${raporYaz(fikir, sonuc)}${canliRapor}` }],
      };
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
        "Türkiye'nin bugünkü Google Trends aramalarını + güncel AI/startup/yatırım haberlerini tarayıp günün " +
        "fırsat sinyallerini çıkarır. Parametre gerektirmez. Tüm bulgular kaynak URL'si ve erişim tarihiyle döner.",
      inputSchema: {},
    },
    async () => {
      const { rapor } = await gunlukFirsatRadari();
      return { content: [{ type: "text", text: rapor }] };
    }
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
            "Araçlar: firsat_analiz, pazar_arastir, rakip_analiz, regulasyon_kontrol, gunluk_firsat_radari, notion_kaydet, radar_durum",
            "Veri kaynakları: Google News RSS, Google Trends RSS, Resmî Gazete, TÜİK (best-effort) — hepsi ücretsiz, API anahtarsız.",
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
