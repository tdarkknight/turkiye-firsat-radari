// ── Notion entegrasyonu (opsiyonel) ──
// NOTION_TOKEN ve NOTION_DATABASE_ID env değişkenleri yoksa server yine çalışır,
// sadece kaydetme aracı "yapılandırılmamış" der.
// Radar hafızası: Notion DB'yi kalıcı depo gibi kullanır — aynı fikir tekrar analiz
// edilince önceki skoru bulup farkı raporlar (Render free disk kalıcı olmadığı için).

import type { AnalizSonuc } from "./analiz.js";
import type { FetchFn } from "./fetcher.js";

export function notionHazirMi(): boolean {
  return Boolean(process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID);
}

export interface GecmisKayit {
  puan: number;
  karar?: string;
  tarih?: string;
}

/** Aynı fikrin önceki analizlerini Notion'dan çeker (başlık ön eki eşleşmesi). */
export async function notionGecmis(fikir: string, fetchFn: FetchFn = fetch): Promise<GecmisKayit[] | null> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!token || !dbId) return null;

  try {
    const res = await fetchFn(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: { property: "Fikir", title: { contains: fikir.slice(0, 60) } },
        sorts: [{ property: "Tarih", direction: "descending" }],
        page_size: 5,
      }),
    });
    if (!res.ok) return null;

    const veri = (await res.json()) as {
      results?: Array<{
        properties?: {
          Puan?: { number?: number };
          Karar?: { select?: { name?: string } };
          Tarih?: { date?: { start?: string } };
        };
      }>;
    };
    return (veri.results ?? [])
      .map((s) => ({
        puan: s.properties?.Puan?.number ?? NaN,
        karar: s.properties?.Karar?.select?.name,
        tarih: s.properties?.Tarih?.date?.start,
      }))
      .filter((k) => !Number.isNaN(k.puan));
  } catch {
    return null; // hafıza okunamadıysa analiz yine de çalışır
  }
}

/** Hafıza raporu: önceki skorla karşılaştır, yoksa ilk kayıt olduğunu söyle. */
export function hafizaRaporu(gecmis: GecmisKayit[] | null, yeniPuan: number): string {
  if (gecmis === null) return ""; // Notion yapılandırılmamış veya erişilemedi
  if (gecmis.length === 0) {
    return "\n🧠 RADAR HAFIZASI: Bu fikrin önceki kaydı yok — ilk analiz, Notion'a kaydedildi.";
  }
  const onceki = gecmis[0];
  const fark = yeniPuan - onceki.puan;
  const yon = fark > 0 ? `+${fark} ↑ pencere açılıyor olabilir` : fark < 0 ? `${fark} ↓ sinyal zayıflıyor` : "değişim yok";
  return `\n🧠 RADAR HAFIZASI: Önceki skor ${onceki.puan}${onceki.tarih ? ` (${onceki.tarih})` : ""} → şimdi ${yeniPuan} (${yon}). Toplam ${gecmis.length} geçmiş kayıt.`;
}

export async function notionaKaydet(fikir: string, sonuc: AnalizSonuc, fetchFn: FetchFn = fetch): Promise<string> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!token || !dbId) {
    return "Notion yapılandırılmamış. .env dosyasına NOTION_TOKEN ve NOTION_DATABASE_ID ekle. Analiz aracı Notion olmadan da çalışır.";
  }

  const analizOzeti = [
    `Karar: ${sonuc.karar}`,
    ...Object.entries(sonuc.kirilim).map(([b, k]) => `${b}: ${k.puan}/${k.max}`),
    `Tavsiye: ${sonuc.tavsiye}`,
  ]
    .join(" | ")
    .slice(0, 1990);

  const res = await fetchFn("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        "Fikir": { title: [{ text: { content: fikir.slice(0, 200) } }] },
        "Puan": { number: sonuc.puan },
        "Karar": { select: { name: sonuc.karar } },
        "Analiz": { rich_text: [{ text: { content: analizOzeti } }] },
        "Tarih": { date: { start: new Date().toISOString().slice(0, 10) } },
      },
    }),
  });

  if (!res.ok) {
    const hata = await res.text();
    return `Notion hatası (${res.status}): ${hata.slice(0, 500)}\n\nDatabase'inde şu kolonlar olmalı: Fikir (Title), Puan (Number), Karar (Select), Analiz (Text), Tarih (Date).`;
  }

  const sayfa = (await res.json()) as { url?: string };
  return `Notion'a kaydedildi ✅${sayfa.url ? ` → ${sayfa.url}` : ""}`;
}
