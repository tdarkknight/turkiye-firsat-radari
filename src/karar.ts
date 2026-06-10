import { fikriAnalizEt, type AnalizSonuc } from "./analiz.js";

export interface FikirGirdisi {
  ad: string;
  fikir: string;
  sektor?: string;
  hedefKitle?: string;
  gelirModeli?: string;
}

interface SiraliFikir extends FikirGirdisi {
  sonuc: AnalizSonuc;
  guvenPuani: number;
  kararPuani: number;
}

function kirp(deger: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, deger));
}

function detayGuveni(fikir: FikirGirdisi): number {
  let puan = 0;
  if (fikir.fikir.length >= 80) puan += 3;
  if (fikir.fikir.length >= 180) puan += 2;
  if (fikir.sektor) puan += 2;
  if (fikir.hedefKitle) puan += 2;
  if (fikir.gelirModeli) puan += 1;
  return kirp(puan, 0, 10);
}

export function fikirleriKarsilastir(fikirler: FikirGirdisi[]): string {
  const sirali: SiraliFikir[] = fikirler
    .map((fikir) => {
      const sonuc = fikriAnalizEt(fikir.fikir, fikir.sektor, fikir.hedefKitle, fikir.gelirModeli);
      const guvenPuani = detayGuveni(fikir);
      return {
        ...fikir,
        sonuc,
        guvenPuani,
        kararPuani: Math.round(sonuc.puan * 0.9 + guvenPuani),
      };
    })
    .sort((a, b) => b.kararPuani - a.kararPuani);

  const kazanan = sirali[0];
  const ikinci = sirali[1];
  const fark = ikinci ? kazanan.kararPuani - ikinci.kararPuani : kazanan.kararPuani;
  const netlik =
    fark >= 12 ? "Net kazanan" : fark >= 5 ? "Önde ama doğrulama gerekli" : "Başa baş; puanla değil deneyle seç";

  const satirlar = [
    "🏁 FİKİR KARŞILAŞTIRMA",
    "",
    `SONUÇ: ${kazanan.ad} — ${netlik}`,
    `Karar puanı: ${kazanan.kararPuani}/100 (fırsat skoru ${kazanan.sonuc.puan} + girdi güveni ${kazanan.guvenPuani}/10)`,
    "",
    "SIRALAMA:",
  ];

  sirali.forEach((fikir, index) => {
    const anaRisk = fikir.sonuc.riskler[0] ?? "Belirgin ana risk yok";
    satirlar.push(
      `  ${index + 1}. ${fikir.ad}: ${fikir.kararPuani}/100 → ${fikir.sonuc.karar}`,
      `     Güçlü taraf: ${fikir.sonuc.artilar[0] ?? "Henüz güçlü sinyal yok"}`,
      `     Ana risk: ${anaRisk}`
    );
  });

  satirlar.push(
    "",
    "KARAR:",
    fark < 5 && ikinci
      ? `  ${kazanan.ad} ve ${ikinci.ad} için aynı hafta iki ayrı landing page testi yap. Daha yüksek nitelikli talep getiren kazanır.`
      : `  İlk doğrulama bütçesini ${kazanan.ad} fikrine ayır. En büyük riski doğrulamadan ürün geliştirmeye başlama.`,
    "",
    "UYARI: Karar puanı, fikir açıklamasının netliğini de ödüllendirir. Eksik anlatılmış iyi bir fikir düşük görünebilir."
  );

  return satirlar.join("\n");
}

export interface BirimEkonomiGirdisi {
  aylikFiyat: number;
  brutMarjYuzde: number;
  musteriEdinmeMaliyeti: number;
  aylikChurnYuzde: number;
  aylikSabitGider: number;
  ilkYatirim?: number;
}

export function birimEkonomiHesapla(girdi: BirimEkonomiGirdisi): string {
  const marjOrani = girdi.brutMarjYuzde / 100;
  const churnOrani = girdi.aylikChurnYuzde / 100;
  const musteriBasiAylikBrutKar = girdi.aylikFiyat * marjOrani;
  const tahminiOmurAy = 1 / churnOrani;
  const ltv = musteriBasiAylikBrutKar * tahminiOmurAy;
  const ltvCac = ltv / girdi.musteriEdinmeMaliyeti;
  const geriOdemeAy = girdi.musteriEdinmeMaliyeti / musteriBasiAylikBrutKar;
  const basabasMusteri = Math.ceil(girdi.aylikSabitGider / musteriBasiAylikBrutKar);
  const yatirimDahilBasabas =
    girdi.ilkYatirim && girdi.ilkYatirim > 0
      ? Math.ceil((girdi.aylikSabitGider + girdi.ilkYatirim / 12) / musteriBasiAylikBrutKar)
      : null;

  const durum =
    ltvCac >= 3 && geriOdemeAy <= 12
      ? "SAĞLIKLI"
      : ltvCac >= 1.5 && geriOdemeAy <= 18
        ? "SINIRDA"
        : "TEHLİKELİ";

  const tavsiyeler: string[] = [];
  if (ltvCac < 3) tavsiyeler.push("LTV/CAC 3'ün altında: fiyatı/marjı artır, churn veya edinme maliyetini düşür.");
  if (geriOdemeAy > 12) tavsiyeler.push("CAC geri ödeme süresi 12 aydan uzun: nakit akışı büyümeyi boğar.");
  if (girdi.aylikChurnYuzde > 8) tavsiyeler.push("Aylık churn yüksek: büyümeden önce ürün tutundurma sorununu çöz.");
  if (basabasMusteri > 1000) tavsiyeler.push("Başa baş için çok yüksek müşteri hacmi gerekiyor; daha yüksek fiyatlı dar B2B segmenti düşün.");
  if (tavsiyeler.length === 0) tavsiyeler.push("Temel ekonomi sağlıklı görünüyor; gerçek cohort verisiyle varsayımları doğrula.");

  return [
    "💰 BİRİM EKONOMİ RADARI",
    "",
    `DURUM: ${durum}`,
    "",
    `Aylık fiyat: ${girdi.aylikFiyat.toFixed(2)} TL`,
    `Müşteri başı aylık brüt kâr: ${musteriBasiAylikBrutKar.toFixed(2)} TL`,
    `Tahmini müşteri ömrü: ${tahminiOmurAy.toFixed(1)} ay`,
    `LTV: ${ltv.toFixed(2)} TL`,
    `CAC: ${girdi.musteriEdinmeMaliyeti.toFixed(2)} TL`,
    `LTV/CAC: ${ltvCac.toFixed(2)}x`,
    `CAC geri ödeme: ${geriOdemeAy.toFixed(1)} ay`,
    `Başa baş aktif müşteri: ${basabasMusteri}`,
    ...(yatirimDahilBasabas ? [`İlk yatırım 12 aya yayıldığında başa baş: ${yatirimDahilBasabas} aktif müşteri`] : []),
    "",
    "KARAR KAPILARI:",
    "  ✅ LTV/CAC ≥ 3x",
    "  ✅ CAC geri ödeme ≤ 12 ay",
    "  ✅ Aylık churn B2B için tercihen ≤ %5",
    "",
    "TAVSİYE:",
    ...tavsiyeler.map((t) => `  • ${t}`),
    "",
    "UYARI: Bunlar varsayım bazlı tahminlerdir; gerçek ödeme ve churn cohort'larıyla güncelle.",
  ].join("\n");
}

export interface DogrulamaPlaniGirdisi {
  fikir: string;
  hedefKitle: string;
  gelirModeli?: string;
  gun: number;
  butceTl?: number;
}

export function dogrulamaPlaniOlustur(girdi: DogrulamaPlaniGirdisi): string {
  const sonuc = fikriAnalizEt(girdi.fikir, undefined, girdi.hedefKitle, girdi.gelirModeli);
  const gun = kirp(Math.round(girdi.gun), 7, 30);
  const butce = Math.max(0, girdi.butceTl ?? 0);
  const gorusmeHedefi = gun <= 14 ? 15 : 25;
  const landingZiyaretci = butce > 0 ? Math.max(100, Math.round(butce / 8)) : 100;
  const enBuyukRisk = sonuc.riskler[0] ?? "Müşterinin bu probleme para ödeme isteği belirsiz";

  return [
    `🧪 ${gun} GÜNLÜK DOĞRULAMA PLANI`,
    "",
    `Fikir: ${girdi.fikir}`,
    `Hedef kitle: ${girdi.hedefKitle}`,
    `Başlangıç skoru: ${sonuc.puan}/100 → ${sonuc.karar}`,
    `Test edilecek en büyük risk: ${enBuyukRisk}`,
    "",
    "ANA HİPOTEZ:",
    `  ${girdi.hedefKitle}, bu problemi çözmek için ${girdi.gelirModeli ?? "önerilen fiyatlandırma"} üzerinden ödeme yapar.`,
    "",
    "1. AŞAMA — PROBLEM KANITI:",
    `  • ${gorusmeHedefi} potansiyel müşteri görüşmesi yap.`,
    "  • Ürünü anlatmadan son çözüm yöntemini, harcadığı zamanı/parayı ve aciliyeti sor.",
    "  • Başarı eşiği: görüşmelerin en az %40'ı problemi son 30 günde yaşamış olmalı.",
    "",
    "2. AŞAMA — TALEP KANITI:",
    `  • Tek segment, tek vaat ve tek CTA içeren landing page çıkar.`,
    `  • En az ${landingZiyaretci} hedefli ziyaretçi getir${butce > 0 ? ` (${butce.toFixed(0)} TL test bütçesi)` : ""}.`,
    "  • Başarı eşiği: nitelikli kayıt oranı ≥ %8; ücretli pilot ilgisi ≥ %3.",
    "",
    "3. AŞAMA — ÖDEME KANITI:",
    "  • Ürünü geliştirmeden 3 ücretli pilot veya imzalı niyet mektubu iste.",
    "  • Başarı eşiği: en az 3 gerçek ödeme/taahhüt.",
    "",
    "ÖLDÜRME KRİTERLERİ:",
    "  • Problem görüşmelerinde tekrar eden güçlü acı < %25.",
    "  • Landing page nitelikli kayıt oranı < %3.",
    "  • 20+ doğru müşteri temasına rağmen ücretli pilot yok.",
    "  • Regülasyon/dağıtım maliyeti ilk geliri anlamsızlaştırıyor.",
    "",
    "KARAR:",
    "  GO: Üç aşamadan en az ikisi başarı eşiğini geçer ve ödeme kanıtı vardır.",
    "  PIVOT: Problem güçlü ama ödeme/segment zayıfsa segment veya teklif değiştir.",
    "  STOP: Problem kanıtı ve ödeme kanıtı birlikte yoksa geliştirmeyi durdur.",
  ].join("\n");
}
