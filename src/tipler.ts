// ── Ortak tipler + kaynak güvenilirliği / veri tazeliği ──

export interface Kanit {
  iddia: string;          // kanıtın desteklediği bilgi (başlık/özet)
  url: string;            // kaynak URL
  kaynak: string;         // kaynak adı (örn. "Resmî Gazete", "Webrazzi")
  yayinTarihi?: string;   // ISO tarih, biliniyorsa
  erisimTarihi: string;   // ISO tarih — bu veriye ne zaman eriştik
  guvenilirlik: number;   // 0..1
  alinti?: string;        // derin kanıt: sayfa içeriğinden alınan gerçek paragraf
}

export interface KaynakSonuc {
  durum: "ok" | "veri bulunamadı" | "hata";
  kanitlar: Kanit[];
  not?: string;           // hata/boşluk açıklaması — asla uydurma veri yok
}

const GUVENILIRLIK_TABLOSU: Array<{ desen: RegExp; puan: number }> = [
  { desen: /resmigazete\.gov\.tr|mevzuat\.gov\.tr|tuik\.gov\.tr|\.gov\.tr/i, puan: 1.0 },
  { desen: /aa\.com\.tr|reuters\.com|bloomberg(ht)?\.com/i, puan: 0.9 },
  { desen: /hurriyet|milliyet|sozcu|ntv\.com|cnnturk|haberturk|dunya\.com|ekonomim\.com|sabah\.com/i, puan: 0.75 },
  { desen: /webrazzi|techcrunch|egirisim|shiftdelete|donanimhaber|wired\.com|theverge/i, puan: 0.7 },
];

export function kaynakGuvenilirligi(url: string): number {
  for (const { desen, puan } of GUVENILIRLIK_TABLOSU) {
    if (desen.test(url)) return puan;
  }
  return 0.5; // bilinmeyen kaynak
}

/** 0..1 — veri ne kadar taze? */
export function tazelikPuani(yayinTarihi?: string): number {
  if (!yayinTarihi) return 0.4; // tarih bilinmiyorsa temkinli
  const yas = Date.now() - new Date(yayinTarihi).getTime();
  if (Number.isNaN(yas)) return 0.4;
  const gun = yas / 86_400_000;
  if (gun <= 7) return 1.0;
  if (gun <= 30) return 0.8;
  if (gun <= 90) return 0.6;
  if (gun <= 365) return 0.4;
  return 0.2;
}

/** Kanıt setinden 0..10 arası "veri kalitesi" puanı: güvenilirlik × tazelik × hacim */
export function veriKalitesiPuani(kanitlar: Kanit[]): number {
  if (kanitlar.length === 0) return 0;
  const ort =
    kanitlar.reduce((t, k) => t + k.guvenilirlik * tazelikPuani(k.yayinTarihi), 0) /
    kanitlar.length;
  const hacim = Math.min(kanitlar.length / 5, 1); // 5+ kanıt = tam hacim
  return Math.round(ort * hacim * 10);
}

export function bugunISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function kanitSatiri(k: Kanit): string {
  const tarih = k.yayinTarihi ? ` (${k.yayinTarihi.slice(0, 10)})` : "";
  const alinti = k.alinti ? `\n     💬 "${k.alinti}"` : "";
  return `  📌 ${k.iddia}${tarih}\n     ${k.url} — kaynak: ${k.kaynak}, güvenilirlik: ${Math.round(k.guvenilirlik * 100)}%, erişim: ${k.erisimTarihi}${alinti}`;
}
