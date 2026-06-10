// ── Türkiye Fırsat Radarı MCP Server ──
// Streamable HTTP transport @ /mcp — Poke tunnel ve cloud deploy ile uyumlu.
// Lokal:  npm run dev  →  npx poke@latest tunnel http://localhost:3000/mcp -n "Turkiye Firsat Radari MCP" --recipe
// Cloud:  PORT env'den okunur, Render/Railway gibi platformlarda direkt çalışır.

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { fikriAnalizEt, raporYaz } from "./analiz.js";
import { notionaKaydet, notionHazirMi } from "./notion.js";

function serverOlustur(): McpServer {
  const server = new McpServer({
    name: "turkiye-firsat-radari",
    version: "1.0.0",
  });

  server.registerTool(
    "firsat_analiz",
    {
      title: "Türkiye Fırsat Analizi",
      description:
        "Yeni bir AI/startup/internet iş fikrini Türkiye pazarına göre analiz eder. " +
        "Pazar potansiyeli, Türkiye uyumu, rekabet, regülasyon riski ve gelir modelini değerlendirip " +
        "100 üzerinden puanlar. 40 altı fikirler elenir, 70+ fikirler FIRSAT olarak işaretlenir.",
      inputSchema: {
        fikir: z.string().min(10).describe("İş fikrinin açıklaması (ne kadar detaylı o kadar iyi)"),
        sektor: z.string().optional().describe("Sektör (örn: fintech, edtech, oyun, e-ticaret)"),
        hedef_kitle: z.string().optional().describe("Hedef kitle (örn: KOBİ'ler, üniversite öğrencileri)"),
        gelir_modeli: z.string().optional().describe("Planlanan gelir modeli (örn: abonelik, komisyon)"),
      },
    },
    async ({ fikir, sektor, hedef_kitle, gelir_modeli }) => {
      const sonuc = fikriAnalizEt(fikir, sektor, hedef_kitle, gelir_modeli);
      return {
        content: [{ type: "text", text: raporYaz(fikir, sonuc) }],
      };
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
            "Araçlar: firsat_analiz, notion_kaydet, radar_durum",
          ].join("\n"),
        },
      ],
    })
  );

  return server;
}

const app = express();
app.use(express.json());

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
