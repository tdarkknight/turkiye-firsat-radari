// ── Araştırma orkestratörleri ──
// Her araç: kısa özet + kanıtlar (URL + erişim tarihi) + riskler + önerilen MVP.
// Kanıt yoksa "veri bulunamadı" yazılır; tahmin üretilmez.

import type { FetchSecenek } from "./fetcher.js";
import {
  derinKanitEkle,
  haberAra,
  hackerNewsShow,
  productHuntYeniler,
  resmiGazeteAra,
  trendlerTR,
  tuikDene,
  type GlobalUrun,
  type TrendMaddesi,
} from "./kaynaklar.js";
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

export interface TicariTrendAdayi extends TrendMaddesi {
  ticariPuan: number;
  neden: string[];
  firsatAcisi: string;
}

const TICARI_SINYALLER: Array<{
  desen: RegExp;
  puan: number;
  neden: string;
  aci: string;
}> = [
  { desen: /yapay zeka|\bai\b|agent|otomasyon|chatbot|llm|gpt/i, puan: 6, neden: "AI/otomasyon talep sinyali", aci: "Dar bir iş akışını otomatikleştiren B2B ürün veya uygulama" },
  { desen: /kobi|esnaf|işletme|girişim|startup|yatırım|şirket|iflas/i, puan: 5, neden: "İşletme/girişim problemi sinyali", aci: "İşletmelerin maliyetini veya operasyon riskini azaltan çözüm" },
  { desen: /fintech|banka|ödeme|kredi|enflasyon|faiz|döviz|borsa|jpmorgan/i, puan: 4, neden: "Finansal karar ihtiyacı", aci: "Finansal veriyi sadeleştiren karar destek veya maliyet kontrol ürünü" },
  { desen: /e-?ticaret|pazaryeri|satış|müşteri|kargo|lojistik|teslimat/i, puan: 5, neden: "Ticaret/operasyon talebi", aci: "Satış dönüşümü, müşteri desteği veya teslimat verimliliği çözümü" },
  { desen: /e-?devlet|kamu|belediye|başvuru|randevu|çöktü|erişim problemi/i, puan: 4, neden: "Dijital hizmet sürtünmesi", aci: "Karmaşık başvuru ve kamu süreçlerini takip eden yardımcı servis" },
  { desen: /eğitim|sınav|yds|yks|öğrenci|kurs|öğren/i, puan: 4, neden: "Eğitim/sınav talebi", aci: "Sınava veya beceriye özel kişiselleştirilmiş hazırlık ürünü" },
  { desen: /sağlık|klinik|doktor|hasta|randevu|tedavi/i, puan: 3, neden: "Sağlık hizmeti talebi", aci: "Regülasyona uygun hasta operasyonu veya randevu çözümü" },
  { desen: /siber|güvenlik|dolandırıcılık|veri ihlali|hack/i, puan: 5, neden: "Güvenlik problemi", aci: "KOBİ odaklı güvenlik, doğrulama veya risk uyarı servisi" },
  { desen: /enerji|elektrik|güneş|şarj|tasarruf/i, puan: 4, neden: "Enerji/maliyet sinyali", aci: "Tüketim optimizasyonu veya maliyet azaltma çözümü" },
  { desen: /turizm|otel|seyahat|rezervasyon|vize/i, puan: 3, neden: "Turizm/seyahat talebi", aci: "Yerel bilgi, rezervasyon veya operasyon kolaylaştıran servis" },
];

const TICARI_DISI_DESEN =
  /futbol|transfer|golcü|maç|spor|beşiktaş|fenerbahçe|galatasaray|trabzon|arda turan|orkun kökçü|magazin|dizi|oyuncu|şarkıcı|konser|miting|milletvekili|parti|akp|chp|iyi parti|seçim|cumhurbaşkanı|bakan|kumar|bahis|wetten/i;

function trafikPuani(trafik?: string): number {
  if (!trafik) return 0;
  const sayi = Number(trafik.replace(/[^\d]/g, ""));
  if (sayi >= 10_000) return 3;
  if (sayi >= 5_000) return 2;
  if (sayi >= 1_000) return 1;
  return 0;
}

export function ticariTrendleriSec(trendler: TrendMaddesi[]): TicariTrendAdayi[] {
  return trendler
    .map((trend): TicariTrendAdayi | null => {
      const metin = `${trend.baslik} ${trend.haberBasligi ?? ""}`;
      if (TICARI_DISI_DESEN.test(metin)) return null;

      const eslesen = TICARI_SINYALLER.filter((sinyal) => sinyal.desen.test(metin));
      if (eslesen.length === 0) return null;

      const neden = [...new Set(eslesen.map((sinyal) => sinyal.neden))];
      const sinyalPuani = eslesen.reduce((toplam, sinyal) => toplam + sinyal.puan, 0);
      const problemBonusu = /çöktü|sorun|kriz|iflas|zam|yasak|gecikme|şikayet/i.test(metin) ? 2 : 0;
      return {
        ...trend,
        ticariPuan: Math.min(10, sinyalPuani + trafikPuani(trend.yaklasikTrafik) + problemBonusu),
        neden,
        firsatAcisi: eslesen[0].aci,
      };
    })
    .filter((aday): aday is TicariTrendAdayi => aday !== null && aday.ticariPuan >= 5)
    .sort((a, b) => b.ticariPuan - a.ticariPuan);
}

// ── pazar_arastir ──
export async function pazarArastir(konu: string, secenek: FetchSecenek = {}): Promise<ArastirmaCiktisi> {
  const [genel, pazar, yatirim, tuik] = await Promise.all([
    haberAra(`${konu} Türkiye`, secenek),
    haberAra(`${konu} pazar büyüklüğü Türkiye`, secenek),
    haberAra(`${konu} yatırım girişim Türkiye`, secenek),
    tuikDene(secenek),
  ]);

  const kanitlar = await derinKanitEkle(tumKanitlar(genel, pazar, yatirim, tuik), secenek);
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
  const ticariAdaylar = ticariTrendleriSec(trendSonuc.trendler);

  const adaySatirlari =
    ticariAdaylar.length > 0
      ? ticariAdaylar.slice(0, 5).flatMap((t, index) => [
          `  ${index + 1}. ${t.baslik} — ticari sinyal ${t.ticariPuan}/10${t.yaklasikTrafik ? ` (${t.yaklasikTrafik} arama)` : ""}`,
          `     Neden: ${t.neden.join(", ")}`,
          `     Fırsat açısı: ${t.firsatAcisi}`,
          ...(t.haberUrl ? [`     ${t.haberUrl}`] : []),
        ])
      : ["  ⛔ Bugün bildirimlik güçlü ticari trend bulunamadı. Spor, siyaset, magazin ve para kazanma açısı zayıf trendler elendi."];

  const elenenTrendSayisi = Math.max(0, trendSonuc.trendler.length - ticariAdaylar.length);

  const rapor = [
    `📡 GÜNLÜK FIRSAT RADARI — ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `ÖZET: ${kanitlar.length} kanıt toplandı. Veri kalitesi: ${kalite}/10. ${elenenTrendSayisi} iş dışı/zayıf trend elendi, ${ticariAdaylar.length} ticari aday kaldı.`,
    ``,
    `BİLDİRİMLİK TİCARİ FIRSAT ADAYLARI:`,
    ...adaySatirlari,
    ``,
    `KANITLAR:`,
    bolum("AI/girişim haberleri", aiHaber),
    bolum("Yatırım haberleri", girisimHaber),
    ``,
    `RİSKLER:`,
    `  ⚠️ Ticari filtre spor/siyaset/magazini ve para kazanma açısı zayıf trendleri eler; kalan adaylar yine sürdürülebilir talep kanıtı değildir.`,
    ``,
    `ÖNERİLEN MVP: En yüksek ticari sinyalli aday için 48 saatte problem görüşmesi + landing page testi yap; nitelikli kayıt oranı %5 altıysa bildirimlik fırsat sayma.`,
  ].join("\n");

  return { rapor, kanitlar, veriKalitesi: kalite };
}

// ── klon_radar ──
// Dünyada yeni çıkan ürünleri (Product Hunt + Show HN) çeker, her biri için
// Türkçe haber taraması yapar: TR'de sinyal yoksa "boşluk adayı" olarak işaretler.
// Dürüstlük: "TR'de haber yok" ≠ "TR'de rakip yok" — rapor bunu açıkça söyler.

export interface KlonAdayi {
  urun: GlobalUrun;
  trHamSinyalSayisi: number;
  trSinyalSayisi: number;
  trKanitlar: Kanit[];
  durum: "boşluk adayı" | "TR'de sinyal var" | "kontrol edilemedi";
}

function urunAramaAdi(ad: string): string {
  // "Ürün Adı — tagline" / "Ürün Adı - tagline" formatlarından adı ayıkla
  return ad.split(/[—–|:-]/)[0].trim().slice(0, 60);
}

const KLON_BAGLAM_DURAK_KELIMELERI = new Set([
  "about", "after", "again", "also", "another", "anything", "built", "create", "from", "into", "just", "magic",
  "make", "more", "open", "product", "simple", "smart", "that", "their", "this", "tool", "using", "with", "your",
  "icin", "olan", "olarak", "yeni",
]);

function normalizeKlonMetni(metin: string): string {
  return metin
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9çğıöşü]+/g, " ")
    .trim();
}

function urunBaglamKelimeleri(urun: GlobalUrun): string[] {
  const adParcalari = urun.ad.split(/[—–|:-]/).slice(1).join(" ");
  const markaKelimeleri = new Set(normalizeKlonMetni(urunAramaAdi(urun.ad)).split(" "));
  return [...new Set(normalizeKlonMetni(`${adParcalari} ${urun.ozet ?? ""}`).split(" "))]
    .filter((kelime) => kelime.length >= 4 && !markaKelimeleri.has(kelime) && !KLON_BAGLAM_DURAK_KELIMELERI.has(kelime))
    .slice(0, 6);
}

function ayirtEdiciMarkaAdi(ad: string): boolean {
  const marka = urunAramaAdi(ad);
  return marka.trim().split(/\s+/).length > 1 || /\d/.test(marka) || /[a-z][A-Z]/.test(marka);
}

function trKanitlariniDogrula(urun: GlobalUrun, kanitlar: Kanit[]): Kanit[] {
  const marka = normalizeKlonMetni(urunAramaAdi(urun.ad));
  const baglam = urunBaglamKelimeleri(urun);
  const markaTekBasinaYeterli = ayirtEdiciMarkaAdi(urun.ad);

  return kanitlar.filter((kanit) => {
    const baslik = normalizeKlonMetni(kanit.iddia);
    if (!baslik.includes(marka)) return false;
    return markaTekBasinaYeterli || baglam.some((kelime) => baslik.includes(kelime));
  });
}

export async function klonRadar(secenek: FetchSecenek = {}, maksUrun = 6): Promise<ArastirmaCiktisi> {
  const [ph, hn] = await Promise.all([productHuntYeniler(secenek), hackerNewsShow(secenek)]);

  // İki kaynaktan dönüşümlü seç ki tek kaynak domine etmesin
  const urunler: GlobalUrun[] = [];
  for (let i = 0; i < maksUrun; i++) {
    const sira = i % 2 === 0 ? ph.urunler : hn.urunler;
    const aday = sira[Math.floor(i / 2)];
    if (aday) urunler.push(aday);
  }

  const adaylar: KlonAdayi[] = await Promise.all(
    urunler.map(async (urun): Promise<KlonAdayi> => {
      const aramaAdi = urunAramaAdi(urun.ad);
      const baglam = urunBaglamKelimeleri(urun).slice(0, 2).join(" ");
      const trSonuc = await haberAra(`"${aramaAdi}" Türkiye${baglam ? ` ${baglam}` : ""}`, secenek);
      if (trSonuc.durum === "hata") {
        return { urun, trHamSinyalSayisi: 0, trSinyalSayisi: 0, trKanitlar: [], durum: "kontrol edilemedi" };
      }
      const dogrulanmisKanitlar = trKanitlariniDogrula(urun, trSonuc.kanitlar);
      return {
        urun,
        trHamSinyalSayisi: trSonuc.kanitlar.length,
        trSinyalSayisi: dogrulanmisKanitlar.length,
        trKanitlar: dogrulanmisKanitlar.slice(0, 2),
        durum: dogrulanmisKanitlar.length === 0 ? "boşluk adayı" : "TR'de sinyal var",
      };
    })
  );

  const kanitlar = [
    ...ph.kanitlar.slice(0, maksUrun),
    ...hn.kanitlar.slice(0, maksUrun),
    ...adaylar.flatMap((a) => a.trKanitlar),
  ];
  const kalite = veriKalitesiPuani(kanitlar);
  const bosluklar = adaylar.filter((a) => a.durum === "boşluk adayı");

  const adaySatirlari = adaylar.length
    ? adaylar.flatMap((a, i) => [
        `  ${i + 1}. [${a.durum === "boşluk adayı" ? "🟢 BOŞLUK ADAYI" : a.durum === "TR'de sinyal var" ? "🟡 TR'DE SİNYAL VAR" : "⚪ KONTROL EDİLEMEDİ"}] ${a.urun.ad}`,
        `     Global kaynak: ${a.urun.url} (${a.urun.kaynak}, erişim: ${bugunkuTarih()})`,
        ...(a.urun.ozet ? [`     Ne yapıyor: ${a.urun.ozet.slice(0, 150)}`] : []),
        ...(a.durum === "TR'de sinyal var"
          ? a.trKanitlar.map((k) => `     TR sinyali: ${k.iddia.slice(0, 100)} → ${k.url}`)
          : a.durum === "boşluk adayı"
            ? [
                a.trHamSinyalSayisi > 0
                  ? `     TR haber taraması: ${a.trHamSinyalSayisi} ham sonuç bağlam doğrulamasını geçemedi → görünür yerel oyuncu sinyali yok`
                  : `     TR haber taraması: 0 sonuç → görünür yerel oyuncu sinyali yok`,
              ]
            : [`     TR taraması başarısız — veri bulunamadı, boşluk iddiası YAPILAMAZ`]),
      ])
    : ["  ⛔ veri bulunamadı — global ürün feed'lerine erişilemedi."];

  const rapor = [
    `🌍 KLON RADARI — global yeni ürünler × Türkiye boşluk taraması (${bugunkuTarih()})`,
    ``,
    `ÖZET: ${urunler.length} global ürün tarandı (Product Hunt: ${ph.durum}, Show HN: ${hn.durum}). ` +
      `${bosluklar.length} boşluk adayı bulundu. Veri kalitesi: ${kalite}/10.`,
    ``,
    `ADAYLAR:`,
    ...adaySatirlari,
    ``,
    `RİSKLER:`,
    `  ⚠️ "TR'de haber yok" ≠ "TR'de rakip yok" — sessiz büyüyen yerel rakipler haberlere yansımayabilir. Boşluk adaylarını rakip_analiz aracıyla derinleştir.`,
    `  ⚠️ Genel ürün adlarındaki alakasız haber eşleşmeleri ürün açıklamasıyla bağlam doğrulamasından geçirilir; bu filtre bazı gerçek eşleşmeleri de eleyebilir.`,
    `  ⚠️ Global ürünün TR'de talep karşılığı olduğu varsayılamaz; fiyatlandırma ve alışkanlık farkı kontrol edilmeli.`,
    ``,
    `ÖNERİLEN MVP: En güçlü boşluk adayını seç → ürünün global landing'ini incele → TR'ye yerelleştirilmiş tek özellikli versiyonun landing page'ini 1 haftada test et.`,
  ].join("\n");

  return { rapor, kanitlar, veriKalitesi: kalite };
}

function bugunkuTarih(): string {
  return new Date().toISOString().slice(0, 10);
}
