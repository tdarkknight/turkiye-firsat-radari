// ── Notion entegrasyonu (opsiyonel) ──
// NOTION_TOKEN ve NOTION_DATABASE_ID env değişkenleri yoksa server yine çalışır,
// sadece kaydetme aracı "yapılandırılmamış" der.

import type { AnalizSonuc } from "./analiz.js";

export function notionHazirMi(): boolean {
  return Boolean(process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID);
}

export async function notionaKaydet(fikir: string, sonuc: AnalizSonuc): Promise<string> {
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

  const res = await fetch("https://api.notion.com/v1/pages", {
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
