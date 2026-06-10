// ── Araştırma orkestratörleri ──
// Her araç: kısa özet + kanıtlar (URL + erişim tarihi) + riskler + önerilen MVP.
// Kanıt yoksa "veri bulunamadı" yazılır; tahmin üretilmez.

import type { FetchSecenek } from "./fetcher.js";
import { haberAra, resmiGazeteAra, trendlerTR, tuikDene } from "./kaynaklar.js";
import { kanitSatiri, veriKalitesiPuani, type Kanit, type KaynakSonuc } from "./tipler.js";

function bolum(baslik: string, sonuc: KaynakSonuc): string {
  const satirlar = [`▸ ${baslik}`];
  if (sonuc.durum === "ok" && sonuc.kanitlar.length > 0) {
    sonuc.kanitlar.forEach((k) => satirlar.push(kanitSatiri(k)));
  } else {
    satirlar.push(`  ⛔ veri bulunamadı${sonuc.not ? ` — ${sonuc.not}` : ""}`);
  }
  return satirlar.join("\n");
}

function tumKanitlar(...sonuclar: KaynakSonuc[]): Kanit[] {
  return sonuclar.flatMap((s) => s.kanitlar);
}

export interface ArastirmaCiktisi {
  rapor: string;
  kanitlar: Kanit[];
  veriKalitesi: number; // 0..10
}

// ── pazar_arastir ──
export async function pazarArastir(konu: string, secenek: FetchSecenek = {}): Promise<ArastirmaCiktisi> {
  const [genel, pazar, yatirim, tuik] = await Promise.all([
    haberAra(`${konu} Türkiye`, secenek),
    haberAra(`${konu} pazar büyüklüğü Türkiye`, secenek),
    haberAra(`${konu} yatırım girişim Türkiye`, secenek),
    tuikDene(secenek),
  ]);

  const kanitlar = tumKanitlar(genel, pazar, yatirim, tuik);
  const kalite = veriKalitesiPuani(kanitlar);

  const riskler: string[] = [];
  if (genel.durum !== "ok") riskler.push("Genel haber sinyali yok — pazar ya çok niş ya da Türkçe kaynaklarda görünmüyor.");
  if (pazar.durum !== "ok") riskler.push("Pazar büyüklüğüne dair kaynaklı veri bulunamadı — büyüklük iddiası DOĞRULANAMAZ.");
  if (yatirim.durum !== "ok") riskler.push("Yatırım/girişim haberi yok — yatırımcı iştahı belirsiz.");
  if (kalite < 4) riskler.push("Toplam veri kalitesi düşük; karar vermeden önce ek doğrulama şart.");

  const rapor = [
    `🇹🇷 PAZAR ARAŞTIRMASI: ${konu}`,
    ``,
    `ÖZET: ${kanitlar.length} kanıt toplandı. Veri kalitesi: ${kalite}/10 (kaynak güvenilirliği × güncellik × hacim).`,
    ``,
    `KANITLAR:`,
    bolum("Genel haber sinyali", genel),
    bolum("Pazar büyüklüğü sinyali", pazar),
    bolum("Yatırım/girişim sinyali", yatirim),
    bolum("TÜİK açık verisi", tuik),
    ``,
    `RİSKLER:`,
    ...(riskler.length ? riskler.map((r) => `  ⚠️ ${r}`) : ["  ✅ Belirgin veri riski yok."]),
    ``,
    `ÖNERİLEN MVP: Kanıtlardaki en güncel 2-3 sinyale odaklan; tek bir alıcı segmentine 4 haftada test edilebilir en küçük ürünü çıkar. Pazar verisi doğrulanamayan alanlarda harcama yapma.`,
  ].join("\n");

  return { rapor, kanitlar, veriKalitesi: kalite };
}

// ── rakip_analiz ──
export async function rakipAnaliz(konu: string, secenek: FetchSecenek = {}): Promise<ArastirmaCiktisi> {
  const [rakipler, fiyatlar, sikayetler] = await Promise.all([
    haberAra(`${konu} rakip şirket platform Türkiye`, secenek),
    haberAra(`${konu} fiyat ücret abonelik Türkiye`, secenek),
    haberAra(`${konu} şikayet sorun kullanıcı Türkiye`, secenek),
  ]);

  const kanitlar = tumKanitlar(rakipler, fiyatlar, sikayetler);
  const kalite = veriKalitesiPuani(kanitlar);

  const bosluklar: string[] = [];
  if (sikayetler.durum === "ok" && sikayetler.kanitlar.length > 0) {
    bosluklar.push("Şikayet haberleri var → mevcut oyuncuların zayıf noktaları pazar boşluğu olabilir (kanıtları oku).");
  }
  if (rakipler.durum !== "ok") {
    bosluklar.push("Haberlerde görünür rakip yok → ya bakir alan ya da talep yok; ikisini ayırt etmek için talep testi şart.");
  }
  if (fiyatlar.durum !== "ok") {
    bosluklar.push("Fiyatlandırma verisi bulunamadı → fiyat noktası iddiası üretilemez, manuel araştır.");
  }

  const rapor = [
    `🥊 RAKİP ANALİZİ: ${konu}`,
    ``,
    `ÖZET: ${kanitlar.length} kanıt. Veri kalitesi: ${kalite}/10. Not: Bu analiz haber kaynaklarına dayanır; şikayet platformları (ör. Şikayetvar) kullanım şartları gereği scrape edilmez.`,
    ``,
    `KANITLAR:`,
    bolum("Rakip sinyalleri", rakipler),
    bolum("Fiyat sinyalleri", fiyatlar),
    bolum("Müşteri şikayeti sinyalleri", sikayetler),
    ``,
    `PAZAR BOŞLUKLARI:`,
    ...(bosluklar.length ? bosluklar.map((b) => `  🔍 ${b}`) : ["  ⛔ veri bulunamadı — boşluk çıkarımı için yeterli kanıt yok."]),
    ``,
    `RİSKLER:`,
    `  ⚠️ Haber bazlı rakip taraması tam liste DEĞİLDİR; sessiz büyüyen rakipler haberlere yansımayabilir.`,
    ``,
    `ÖNERİLEN MVP: En çok şikayet edilen tek sorunu çözen dar kapsamlı ürün → şikayet kanıtı yoksa önce 20 potansiyel müşteriyle görüşme yap.`,
  ].join("\n");

  return { rapor, kanitlar, veriKalitesi: kalite };
}

// ── regulasyon_kontrol ──
export async function regulasyonKontrol(konu: string, secenek: FetchSecenek = {}): Promise<ArastirmaCiktisi> {
  const anahtarlar = konu
    .split(/[\s,]+/)
    .filter((k) => k.length > 3)
    .slice(0, 5);

  const [gazete, regHaber] = await Promise.all([
    resmiGazeteAra(anahtarlar.length ? anahtarlar : [konu], secenek),
    haberAra(`${konu} yönetmelik regülasyon mevzuat`, secenek),
  ]);

  const kanitlar = tumKanitlar(gazete, regHaber);
  const kalite = veriKalitesiPuani(kanitlar);

  const rapor = [
    `⚖️ REGÜLASYON KONTROLÜ: ${konu}`,
    ``,
    `ÖZET: ${kanitlar.length} kanıt. Veri kalitesi: ${kalite}/10.`,
    `Not: Resmî Gazete taraması SADECE bugünün fihristini kapsar; geçmiş mevzuat için https://www.mevzuat.gov.tr adresinden manuel arama gerekir.`,
    ``,
    `KANITLAR:`,
    bolum("Resmî Gazete (bugünün fihristi)", gazete),
    bolum("Regülasyon haberleri", regHaber),
    ``,
    `RİSKLER:`,
    `  ⚠️ Bu araç hukuki danışmanlık değildir; lisans/izin gerektiren alanlarda (fintech→BDDK/TCMB, kripto→SPK, sağlık→Sağlık Bakanlığı, şans oyunları→devlet tekeli) avukata danış.`,
    ``,
    `ÖNERİLEN MVP: Regülasyon kanıtı çıktıysa önce uyum maliyetini netleştir; çıkmadıysa da "kanıt yok ≠ engel yok" — kritik alanlarda manuel mevzuat taraması yap.`,
  ].join("\n");

  return { rapor, kanitlar, veriKalitesi: kalite };
}

// ── gunluk_firsat_radari ──
export async function gunlukFirsatRadari(secenek: FetchSecenek = {}): Promise<ArastirmaCiktisi> {
  const [trendSonuc, aiHaber, girisimHaber] = await Promise.all([
    trendlerTR(secenek),
    haberAra("yapay zeka girişim Türkiye", secenek),
    haberAra("startup yatırım aldı Türkiye", secenek),
  ]);

  const kanitlar = tumKanitlar(trendSonuc, aiHaber, girisimHaber);
  const kalite = veriKalitesiPuani(kanitlar);

  const trendSatirlari =
    trendSonuc.trendler.length > 0
      ? trendSonuc.trendler
          .slice(0, 10)
          .map((t) => `  🔥 ${t.baslik}${t.yaklasikTrafik ? ` (${t.yaklasikTrafik} arama)` : ""}${t.haberUrl ? `\n     ${t.haberUrl}` : ""}`)
      : [`  ⛔ veri bulunamadı${trendSonuc.not ? ` — ${trendSonuc.not}` : ""}`];

  const rapor = [
    `📡 GÜNLÜK FIRSAT RADARI — ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `ÖZET: ${kanitlar.length} kanıt toplandı. Veri kalitesi: ${kalite}/10.`,
    ``,
    `TÜRKİYE'DE BUGÜN TREND OLANLAR (Google Trends):`,
    ...trendSatirlari,
    ``,
    `KANITLAR:`,
    bolum("AI/girişim haberleri", aiHaber),
    bolum("Yatırım haberleri", girisimHaber),
    ``,
    `RİSKLER:`,
    `  ⚠️ Trendler günlük ilgiyi gösterir, sürdürülebilir talebi değil. Magazin/spor trendlerini fırsat sanma.`,
    ``,
    `ÖNERİLEN MVP: Trend + haber kesişiminde bir konu varsa o konuda 1 haftalık landing page + bekleme listesi testi yap; kayıt oranı %5 altıysa geç.`,
  ].join("\n");

  return { rapor, kanitlar, veriKalitesi: kalite };
}
