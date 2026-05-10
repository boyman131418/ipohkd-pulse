import { createServerFn } from "@tanstack/react-start";

export type PricePoint = { t: number; price: number };
export type SymbolSeries = {
  symbol: string;
  currency: string | null;
  shortName: string | null;
  points: PricePoint[];
  open: number | null;
  close: number | null;
  high: number | null;
  low: number | null;
  changePct: number | null;
  marketCap: number | null;
  sharesOutstanding: number | null;
  error?: string;
};

export type DualMarketResult = {
  primary: SymbolSeries;
  secondary: SymbolSeries;
  fxRate: number | null; // primary currency to HKD
  primaryToUsd: number | null; // primary currency to USD
  secondaryToUsd: number | null; // secondary currency (HKD) to USD
  fetchedAt: number;
};

const RANGE_TO_INTERVAL: Record<string, { range: string; interval: string }> = {
  "5d": { range: "5d", interval: "30m" },
  "1mo": { range: "1mo", interval: "1d" },
  "3mo": { range: "3mo", interval: "1d" },
  "6mo": { range: "6mo", interval: "1d" },
  "1y": { range: "1y", interval: "1d" },
  "2y": { range: "2y", interval: "1wk" },
  "5y": { range: "5y", interval: "1wk" },
};

async function fetchYahoo(symbol: string, rangeKey: string): Promise<SymbolSeries> {
  const cfg = RANGE_TO_INTERVAL[rangeKey] ?? RANGE_TO_INTERVAL["6mo"];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${cfg.interval}&range=${cfg.range}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    const json = (await res.json()) as any;
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error("No data");
    const meta = result.meta || {};
    const ts: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
    const points: PricePoint[] = [];
    let high: number | null = null;
    let low: number | null = null;
    let open: number | null = null;
    let close: number | null = null;
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null) continue;
      if (open == null) open = c;
      close = c;
      high = high == null ? c : Math.max(high, c);
      low = low == null ? c : Math.min(low, c);
      points.push({ t: ts[i], price: c });
    }
    const changePct =
      open != null && close != null && open !== 0
        ? +(((close - open) / open) * 100).toFixed(2)
        : null;
    return {
      symbol,
      currency: meta.currency ?? null,
      shortName: meta.shortName ?? meta.longName ?? null,
      points,
      open,
      close,
      high,
      low,
      changePct,
      marketCap: null,
      sharesOutstanding: null,
    };
  } catch (err) {
    return {
      symbol,
      currency: null,
      shortName: null,
      points: [],
      open: null,
      close: null,
      high: null,
      low: null,
      changePct: null,
      marketCap: null,
      sharesOutstanding: null,
      error: String(err),
    };
  }
}

function normalizeHKSymbol(input: string): string {
  const s = input.trim().toUpperCase();
  if (s.includes(".")) return s;
  // 純數字 → 港股
  const digits = s.replace(/\D/g, "");
  if (digits) return `${parseInt(digits, 10)}.HK`;
  return s;
}

function normalizePrimarySymbol(input: string): string {
  return input.trim().toUpperCase();
}

async function fetchFx(from: string, to: string): Promise<number | null> {
  if (!from || !to || from === to) return 1;
  try {
    const sym = `${from}${to}=X`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const closes: (number | null)[] =
      json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null) return closes[i] as number;
    }
    return null;
  } catch {
    return null;
  }
}

let cachedCrumb: { crumb: string; cookie: string; ts: number } | null = null;

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (cachedCrumb && Date.now() - cachedCrumb.ts < 30 * 60 * 1000) {
    return { crumb: cachedCrumb.crumb, cookie: cachedCrumb.cookie };
  }
  try {
    const seedRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "manual",
    });
    const setCookie = seedRes.headers.get("set-cookie") || "";
    const cookie = setCookie
      .split(/,(?=[^ ;]+=)/)
      .map((c) => c.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
    if (!cookie) return null;
    const crumbRes = await fetch(
      "https://query1.finance.yahoo.com/v1/test/getcrumb",
      {
        headers: { "User-Agent": "Mozilla/5.0", Cookie: cookie },
      },
    );
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb) return null;
    cachedCrumb = { crumb, cookie, ts: Date.now() };
    return { crumb, cookie };
  } catch {
    return null;
  }
}

async function fetchQuoteMeta(
  symbol: string,
): Promise<{ marketCap: number | null; sharesOutstanding: number | null }> {
  try {
    const auth = await getYahooCrumb();
    if (!auth) return { marketCap: null, sharesOutstanding: null };
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
      symbol,
    )}?modules=price,defaultKeyStatistics&crumb=${encodeURIComponent(auth.crumb)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
        Cookie: auth.cookie,
      },
    });
    if (!res.ok) {
      // Crumb可能過期，清除快取下次再試
      cachedCrumb = null;
      return { marketCap: null, sharesOutstanding: null };
    }
    const json = (await res.json()) as any;
    const result = json?.quoteSummary?.result?.[0];
    if (!result) return { marketCap: null, sharesOutstanding: null };
    const mc = result?.price?.marketCap?.raw;
    const so = result?.defaultKeyStatistics?.sharesOutstanding?.raw;
    return {
      marketCap: typeof mc === "number" ? mc : null,
      sharesOutstanding: typeof so === "number" ? so : null,
    };
  } catch {
    return { marketCap: null, sharesOutstanding: null };
  }
}

export const getDualMarketData = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { primary: string; secondary: string; range?: string }) => d,
  )
  .handler(async ({ data }) => {
    const primarySymbol = normalizePrimarySymbol(data.primary);
    const secondarySymbol = normalizeHKSymbol(data.secondary);
    const range = data.range ?? "6mo";
    const [primary, secondary, primaryMeta, secondaryMeta] = await Promise.all([
      fetchYahoo(primarySymbol, range),
      fetchYahoo(secondarySymbol, range),
      fetchQuoteMeta(primarySymbol),
      fetchQuoteMeta(secondarySymbol),
    ]);
    primary.marketCap = primaryMeta.marketCap;
    primary.sharesOutstanding = primaryMeta.sharesOutstanding;
    secondary.marketCap = secondaryMeta.marketCap;
    secondary.sharesOutstanding = secondaryMeta.sharesOutstanding;
    let fxRate: number | null = null;
    if (primary.currency && primary.currency !== "HKD") {
      fxRate = await fetchFx(primary.currency, "HKD");
    } else if (primary.currency === "HKD") {
      fxRate = 1;
    }
    const [primaryToUsd, secondaryToUsd] = await Promise.all([
      primary.currency
        ? primary.currency === "USD"
          ? Promise.resolve(1)
          : fetchFx(primary.currency, "USD")
        : Promise.resolve(null),
      secondary.currency
        ? secondary.currency === "USD"
          ? Promise.resolve(1)
          : fetchFx(secondary.currency, "USD")
        : fetchFx("HKD", "USD"),
    ]);
    return {
      primary,
      secondary,
      fxRate,
      primaryToUsd,
      secondaryToUsd,
      fetchedAt: Date.now(),
    } satisfies DualMarketResult;
  });

export type ListingMcRow = {
  primary: string;
  secondary: string;
  primaryMcUsd: number | null;
  secondaryMcUsd: number | null;
};

const fxCache = new Map<string, { rate: number | null; ts: number }>();
async function fetchFxCached(from: string, to: string): Promise<number | null> {
  const key = `${from}->${to}`;
  const hit = fxCache.get(key);
  if (hit && Date.now() - hit.ts < 10 * 60 * 1000) return hit.rate;
  const rate = await fetchFx(from, to);
  fxCache.set(key, { rate, ts: Date.now() });
  return rate;
}

const mcCache = new Map<
  string,
  { mcUsd: number | null; ts: number }
>();

async function fetchSymbolMcUsd(symbol: string): Promise<number | null> {
  const hit = mcCache.get(symbol);
  if (hit && Date.now() - hit.ts < 10 * 60 * 1000) return hit.mcUsd;
  const meta = await fetchQuoteMeta(symbol);
  if (meta.marketCap == null) {
    mcCache.set(symbol, { mcUsd: null, ts: Date.now() });
    return null;
  }
  // 取貨幣
  let currency: string | null = null;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (res.ok) {
      const j = (await res.json()) as any;
      currency = j?.chart?.result?.[0]?.meta?.currency ?? null;
    }
  } catch {}
  let toUsd: number | null = 1;
  if (currency && currency !== "USD") {
    toUsd = await fetchFxCached(currency, "USD");
  }
  const mcUsd = toUsd != null ? meta.marketCap * toUsd : null;
  mcCache.set(symbol, { mcUsd, ts: Date.now() });
  return mcUsd;
}

export const getListingsMarketCaps = createServerFn({ method: "GET" })
  .inputValidator((d: { pairs: { primary: string; secondary: string }[] }) => d)
  .handler(async ({ data }) => {
    const symbols = new Set<string>();
    for (const p of data.pairs) {
      symbols.add(normalizePrimarySymbol(p.primary));
      symbols.add(normalizeHKSymbol(p.secondary));
    }
    const list = Array.from(symbols);
    const map = new Map<string, number | null>();
    // 限制併發以免被 Yahoo 限流
    const concurrency = 4;
    let idx = 0;
    async function worker() {
      while (idx < list.length) {
        const i = idx++;
        const s = list[i];
        map.set(s, await fetchSymbolMcUsd(s));
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, list.length) }, () => worker()),
    );
    const rows: ListingMcRow[] = data.pairs.map((p) => {
      const ps = normalizePrimarySymbol(p.primary);
      const ss = normalizeHKSymbol(p.secondary);
      return {
        primary: p.primary,
        secondary: p.secondary,
        primaryMcUsd: map.get(ps) ?? null,
        secondaryMcUsd: map.get(ss) ?? null,
      };
    });
    return { rows, fetchedAt: Date.now() };
  });
