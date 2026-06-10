// ── Türkiye Fırsat Radarı — analiz motoru ──
// Deterministik, keyword tabanlı skorlama. Harici API gerektirmez, full lokal çalışır.

export interface AnalizSonuc {
  puan: number;
  karar: "ELENDİ" | "ORTA" | "FIRSAT";
  kirilim: Record<string, { puan: number; max: number; not: string }>;
  artilar: string[];
  riskler: string[];
  tavsiye: string;
}

interface Sinyal {
  kelimeler: string[];
  puan: number;
  not: string;
}

// Pazar potansiyeli sinyalleri (max 25)
const PAZAR_SINYALLERI: Sinyal[] = [
  { kelimeler: ["yapay zeka", "ai", "llm", "gpt", "chatbot", "agent", "otomasyon"], puan: 8, not: "AI dalgası TR'de hâlâ erken, first-mover şansı var" },
  { kelimeler: ["e-ticaret", "ecommerce", "pazaryeri", "marketplace", "dropshipping"], puan: 6, not: "TR e-ticaret hacmi büyüyor ama olgun pazar" },
  { kelimeler: ["fintech", "ödeme", "odeme", "payment", "cüzdan", "cuzdan"], puan: 7, not: "Fintech TR'de güçlü (Papara, Param vb. emsal)" },
  { kelimeler: ["oyun", "game", "gaming", "mobil oyun"], puan: 8, not: "TR oyun sektörü ihracat şampiyonu (Peak, Dream Games emsali)" },
  { kelimeler: ["eğitim", "egitim", "edtech", "kurs", "öğren", "ogren"], puan: 6, not: "Genç nüfus + sınav kültürü = edtech talebi yüksek" },
  { kelimeler: ["sağlık", "saglik", "health", "klinik", "estetik", "diş", "dis"], puan: 6, not: "Sağlık turizmi TR'nin güçlü olduğu alan" },
  { kelimeler: ["saas", "b2b", "kobi", "işletme", "isletme", "crm", "erp"], puan: 7, not: "KOBİ dijitalleşmesi devlet teşvikli, B2B SaaS boşluğu var" },
  { kelimeler: ["abonelik", "subscription", "üyelik", "uyelik"], puan: 4, not: "Tekrarlayan gelir modeli" },
  { kelimeler: ["turizm", "seyahat", "otel", "rezervasyon"], puan: 5, not: "Turizm TR ekonomisinin bel kemiği" },
  { kelimeler: ["lojistik", "kargo", "teslimat", "depo"], puan: 5, not: "E-ticaret büyüdükçe lojistik talebi artıyor" },
];

// Türkiye uyumu sinyalleri (max 25)
const UYUM_SINYALLERI: Sinyal[] = [
  { kelimeler: ["türkçe", "turkce", "türkiye", "turkiye", "yerel", "lokal"], puan: 8, not: "Yerelleşme odağı net" },
  { kelimeler: ["mobil", "telefon", "app", "uygulama"], puan: 6, not: "TR mobile-first pazar, internet trafiğinin çoğu mobil" },
  { kelimeler: ["ucuz", "uygun fiyat", "bütçe", "butce", "ekonomik", "tasarruf"], puan: 6, not: "Fiyat hassasiyeti yüksek pazarda doğru konumlanma" },
  { kelimeler: ["kobi", "esnaf", "küçük işletme", "kucuk isletme"], puan: 6, not: "3+ milyon KOBİ, çoğu hâlâ dijitalleşmemiş" },
  { kelimeler: ["genç", "genc", "öğrenci", "ogrenci", "z kuşağı", "z kusagi"], puan: 5, not: "Genç nüfus oranı Avrupa'nın üstünde" },
  { kelimeler: ["whatsapp", "instagram", "tiktok", "sosyal medya"], puan: 5, not: "TR sosyal medya kullanımında dünya liderlerinden" },
  { kelimeler: ["havale", "eft", "kapıda ödeme", "kapida odeme", "papara", "iyzico"], puan: 4, not: "Yerel ödeme alışkanlıklarına uyum" },
];

// Rekabet cezaları (max 20, dolu pazarlarda kesinti)
const REKABET_CEZALARI: Sinyal[] = [
  { kelimeler: ["yemek siparişi", "yemek siparisi", "yemek teslimat", "food delivery"], puan: -12, not: "Yemeksepeti + Getir + Trendyol Yemek — kan gölü" },
  { kelimeler: ["pazaryeri", "marketplace", "genel e-ticaret"], puan: -10, not: "Trendyol/Hepsiburada/Amazon duvarı" },
  { kelimeler: ["taksi", "ride", "scooter", "araç paylaşım", "arac paylasim"], puan: -8, not: "BiTaksi/Martı + belediye regülasyonu" },
  { kelimeler: ["hızlı market", "hizli market", "market teslimat", "grocery"], puan: -10, not: "Getir savaşları bitti, kazanan belli" },
  { kelimeler: ["sosyal ağ", "sosyal ag", "yeni sosyal medya platformu"], puan: -10, not: "Sosyal ağ kurmak için milyar dolar lazım" },
  { kelimeler: ["emlak ilan", "araba ilan", "ilan sitesi"], puan: -8, not: "Sahibinden tekeli" },
];

// Regülasyon riskleri (max 15, riskli alanlarda kesinti)
const REGULASYON_RISKLERI: Sinyal[] = [
  { kelimeler: ["bahis", "kumar", "casino", "iddaa", "rulet", "slot", "aviator", "crash game", "igaming"], puan: -15, not: "TR'de şans oyunları devlet tekeli (Spor Toto/Milli Piyango). Lisanssız operasyon 7258 sayılı kanuna takılır — TR pazarında yasal yolu yok, ancak lisanslı yurt dışı pazarlar (Curaçao/Malta) üzerinden kurgulanabilir" },
  { kelimeler: ["kripto", "crypto", "coin", "token", "nft"], puan: -8, not: "Kripto regülasyonu sıkılaştı (SPK lisans dönemi), ödeme aracı olarak yasak" },
  { kelimeler: ["teşhis", "teshis", "tedavi", "ilaç", "ilac", "reçete", "recete"], puan: -7, not: "Sağlık Bakanlığı izni olmadan teşhis/tedavi iddiası riskli" },
  { kelimeler: ["kredi", "borç verme", "borc verme", "lending", "faiz"], puan: -8, not: "BDDK lisansı olmadan kredi işi yapılamaz" },
  { kelimeler: ["kişisel veri", "kisisel veri", "veri satışı", "veri satisi", "scraping"], puan: -6, not: "KVKK cezaları ciddi" },
];

// Gelir modeli sinyalleri (max 15)
const GELIR_SINYALLERI: Sinyal[] = [
  { kelimeler: ["abonelik", "subscription", "aylık", "aylik", "üyelik", "uyelik"], puan: 6, not: "Tekrarlayan gelir — yatırımcının sevdiği model" },
  { kelimeler: ["komisyon", "commission", "aracılık", "aracilik"], puan: 5, not: "Komisyon modeli ölçeklenir" },
  { kelimeler: ["reklam", "ads", "sponsor"], puan: 3, not: "Reklam geliri için büyük trafik şart" },
  { kelimeler: ["freemium", "premium", "pro plan"], puan: 5, not: "Freemium TR'de işler ama dönüşüm oranı düşük olur" },
  { kelimeler: ["b2b", "kurumsal", "lisans", "enterprise"], puan: 6, not: "B2B'de ödeme istekliliği B2C'den yüksek" },
  { kelimeler: ["satış", "satis", "ücretli", "ucretli", "fiyat"], puan: 3, not: "Doğrudan satış modeli" },
];

function sinyalTara(metin: string, sinyaller: Sinyal[]): { toplam: number; notlar: string[] } {
  let toplam = 0;
  const notlar: string[] = [];
  for (const s of sinyaller) {
    if (s.kelimeler.some((k) => metin.includes(k))) {
      toplam += s.puan;
      notlar.push(s.not);
    }
  }
  return { toplam, notlar };
}

function kirp(deger: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, deger));
}

export function fikriAnalizEt(fikir: string, sektor?: string, hedefKitle?: string, gelirModeli?: string): AnalizSonuc {
  const metin = [fikir, sektor ?? "", hedefKitle ?? "", gelirModeli ?? ""].join(" ").toLowerCase();

  const pazar = sinyalTara(metin, PAZAR_SINYALLERI);
  const uyum = sinyalTara(metin, UYUM_SINYALLERI);
  const rekabet = sinyalTara(metin, REKABET_CEZALARI);
  const regulasyon = sinyalTara(metin, REGULASYON_RISKLERI);
  const gelir = sinyalTara(metin, GELIR_SINYALLERI);

  // Detay bonusu: fikir ne kadar somut anlatılmışsa o kadar iyi
  const detayBonus = kirp(Math.floor(fikir.length / 120), 0, 5);

  const pazarPuan = kirp(pazar.toplam + detayBonus, 0, 25);
  const uyumPuan = kirp(uyum.toplam + (hedefKitle ? 3 : 0), 0, 25);
  const rekabetPuan = kirp(20 + rekabet.toplam, 0, 20);
  const regulasyonPuan = kirp(15 + regulasyon.toplam, 0, 15);
  const gelirPuan = kirp(gelir.toplam + (gelirModeli ? 3 : 0), 0, 15);

  const puan = pazarPuan + uyumPuan + rekabetPuan + regulasyonPuan + gelirPuan;

  const karar: AnalizSonuc["karar"] = puan < 40 ? "ELENDİ" : puan < 70 ? "ORTA" : "FIRSAT";

  const artilar = [...pazar.notlar, ...uyum.notlar, ...gelir.notlar];
  const riskler = [...rekabet.notlar, ...regulasyon.notlar];
  if (pazarPuan < 8) riskler.push("Pazar potansiyeli sinyali zayıf — fikir hangi büyüyen dalgaya biniyor, net değil");
  if (gelirPuan < 5) riskler.push("Gelir modeli belirsiz — para nereden gelecek?");
  if (uyumPuan < 8) riskler.push("Türkiye'ye özgü bir avantaj görünmüyor — global oyuncu girince ne olacak?");

  let tavsiye: string;
  if (karar === "ELENDİ") {
    tavsiye = "Bu haliyle vakit kaybı. Ya regülasyon/rekabet duvarı var ya da fikir çok ham. Pivotla ya da çöpe at.";
  } else if (karar === "ORTA") {
    tavsiye = "Potansiyel var ama riskler ciddi. Önce küçük bir MVP ile talebi doğrula, para gömme.";
  } else {
    tavsiye = "Yeşil ışık. Türkiye pazarına uyumu güçlü, rekabet/regülasyon duvarı yok. Hızlı MVP çıkar, ilk 100 kullanıcıyı manuel bul.";
  }

  return {
    puan,
    karar,
    kirilim: {
      "Pazar Potansiyeli": { puan: pazarPuan, max: 25, not: pazar.notlar[0] ?? "Belirgin sinyal yok" },
      "Türkiye Uyumu": { puan: uyumPuan, max: 25, not: uyum.notlar[0] ?? "Yerel avantaj sinyali yok" },
      "Rekabet Durumu": { puan: rekabetPuan, max: 20, not: rekabet.notlar[0] ?? "Bilinen doymuş pazar çakışması yok" },
      "Regülasyon Riski": { puan: regulasyonPuan, max: 15, not: regulasyon.notlar[0] ?? "Bilinen regülasyon engeli yok" },
      "Gelir Modeli": { puan: gelirPuan, max: 15, not: gelir.notlar[0] ?? "Gelir modeli sinyali zayıf" },
    },
    artilar: [...new Set(artilar)],
    riskler: [...new Set(riskler)],
    tavsiye,
  };
}

export function raporYaz(fikir: string, sonuc: AnalizSonuc): string {
  const satirlar: string[] = [];
  satirlar.push(`🇹🇷 TÜRKİYE FIRSAT RADARI`);
  satirlar.push(`Fikir: ${fikir}`);
  satirlar.push(``);
  satirlar.push(`PUAN: ${sonuc.puan}/100 → ${sonuc.karar}`);
  satirlar.push(``);
  satirlar.push(`Kırılım:`);
  for (const [baslik, k] of Object.entries(sonuc.kirilim)) {
    satirlar.push(`  • ${baslik}: ${k.puan}/${k.max} — ${k.not}`);
  }
  if (sonuc.artilar.length) {
    satirlar.push(``, `Artılar:`);
    sonuc.artilar.forEach((a) => satirlar.push(`  ✅ ${a}`));
  }
  if (sonuc.riskler.length) {
    satirlar.push(``, `Riskler:`);
    sonuc.riskler.forEach((r) => satirlar.push(`  ⚠️ ${r}`));
  }
  satirlar.push(``, `Tavsiye: ${sonuc.tavsiye}`);
  return satirlar.join("\n");
}

// ── Canlı veri entegrasyonu ──
// Statik keyword skoru 90'a ölçeklenir, kalan 10 puan canlı kanıtların
// kaynak güvenilirliği × güncellik × hacim kalitesinden gelir (veriKalitesi 0..10).
// Canlı veri alınamazsa skor offline modda kalır ve bu açıkça belirtilir.

export interface CanliAnalizSonuc extends AnalizSonuc {
  canliVeriKalitesi: number | null; // null = canlı veri alınamadı
}

export function canliVeriyleBirlestir(statik: AnalizSonuc, veriKalitesi: number | null): CanliAnalizSonuc {
  if (veriKalitesi === null) {
    return {
      ...statik,
      canliVeriKalitesi: null,
      riskler: [...statik.riskler, "Canlı veri alınamadı — skor offline keyword modunda hesaplandı, güncel pazar sinyali doğrulanamadı."],
    };
  }

  const olcekliStatik = Math.round(statik.puan * 0.9);
  const puan = Math.max(0, Math.min(100, olcekliStatik + veriKalitesi));
  const karar: AnalizSonuc["karar"] = puan < 40 ? "ELENDİ" : puan < 70 ? "ORTA" : "FIRSAT";

  const riskler = [...statik.riskler];
  if (veriKalitesi <= 3) {
    riskler.push(`Canlı kanıt kalitesi düşük (${veriKalitesi}/10) — güncel kaynaklarda bu fikri destekleyen güçlü sinyal bulunamadı.`);
  }

  return {
    ...statik,
    puan,
    karar,
    riskler,
    canliVeriKalitesi: veriKalitesi,
    kirilim: {
      ...Object.fromEntries(
        Object.entries(statik.kirilim).map(([b, k]) => [b, { ...k, not: `${k.not} (0.9x ölçekli)` }])
      ),
      "Canlı Veri Doğrulaması": {
        puan: veriKalitesi,
        max: 10,
        not: "Güncel kanıtların kaynak güvenilirliği × tazelik × hacim puanı",
      },
    },
  };
}
