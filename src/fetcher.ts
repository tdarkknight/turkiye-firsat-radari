// ── Dayanıklı fetch katmanı ──
// Timeout, tek retry (jitter'lı), boyut limiti, basit TTL cache, anlaşılır hata tipleri.
// Harici bağımlılık yok — Node 18+ global fetch.

export type FetchFn = typeof fetch;

export interface FetchSecenek {
  timeoutMs?: number;
  retry?: number;
  fetchFn?: FetchFn; // testlerde mock için
}

export class KaynakHatasi extends Error {
  constructor(
    public tur: "timeout" | "http" | "ag" | "boyut" | "ratelimit",
    mesaj: string
  ) {
    super(mesaj);
    this.name = "KaynakHatasi";
  }
}

const MAKS_BOYUT = 3 * 1024 * 1024; // 3 MB
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 dk — kaynaklara nazik davran
const cache = new Map<string, { zaman: number; govde: string }>();

function bekle(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function cacheTemizle(): void {
  cache.clear();
}

/** Metin döndüren güvenli fetch. Hata fırlatır — çağıran taraf yakalayıp "veri bulunamadı" üretir. */
export async function guvenliFetch(url: string, secenek: FetchSecenek = {}): Promise<string> {
  const { timeoutMs = 10_000, retry = 1, fetchFn = fetch } = secenek;

  const onbellek = cache.get(url);
  if (onbellek && Date.now() - onbellek.zaman < CACHE_TTL_MS) {
    return onbellek.govde;
  }

  let sonHata: KaynakHatasi = new KaynakHatasi("ag", "bilinmeyen hata");

  for (let deneme = 0; deneme <= retry; deneme++) {
    if (deneme > 0) await bekle(500 + Math.random() * 1000); // jitter'lı backoff

    const denetleyici = new AbortController();
    const zamanlayici = setTimeout(() => denetleyici.abort(), timeoutMs);

    try {
      const yanit = await fetchFn(url, {
        signal: denetleyici.signal,
        headers: {
          "User-Agent": "TurkiyeFirsatRadari/2.0 (+https://github.com/tdarkknight/turkiye-firsat-radari)",
          Accept: "application/rss+xml, application/xml, text/xml, text/html, */*",
        },
        redirect: "follow",
      });

      if (yanit.status === 429) {
        sonHata = new KaynakHatasi("ratelimit", `${url} → 429 rate limit`);
        continue; // retry
      }
      if (!yanit.ok) {
        throw new KaynakHatasi("http", `${url} → HTTP ${yanit.status}`);
      }

      const govde = await yanit.text();
      if (govde.length > MAKS_BOYUT) {
        throw new KaynakHatasi("boyut", `${url} → yanıt çok büyük (${govde.length} bayt)`);
      }

      cache.set(url, { zaman: Date.now(), govde });
      return govde;
    } catch (e) {
      if (e instanceof KaynakHatasi) {
        if (e.tur === "http" || e.tur === "boyut") throw e; // retry anlamsız
        sonHata = e;
      } else if (e instanceof Error && e.name === "AbortError") {
        sonHata = new KaynakHatasi("timeout", `${url} → ${timeoutMs}ms timeout`);
      } else {
        sonHata = new KaynakHatasi("ag", `${url} → ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      clearTimeout(zamanlayici);
    }
  }

  throw sonHata;
}
