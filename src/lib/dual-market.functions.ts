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
  error?: string;
};

export type DualMarketResult = {
  primary: SymbolSeries;
  secondary: SymbolSeries;
  // Premium = (secondary normalized HKD - primary normalized HKD) / primary * 100, simplified using % returns instead
  fxRate: number | null; // primary currency to HKD
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

export const getDualMarketData = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { primary: string; secondary: string; range?: string }) => d,
  )
  .handler(async ({ data }) => {
    const primarySymbol = normalizePrimarySymbol(data.primary);
    const secondarySymbol = normalizeHKSymbol(data.secondary);
    const range = data.range ?? "6mo";
    const [primary, secondary] = await Promise.all([
      fetchYahoo(primarySymbol, range),
      fetchYahoo(secondarySymbol, range),
    ]);
    let fxRate: number | null = null;
    if (primary.currency && primary.currency !== "HKD") {
      fxRate = await fetchFx(primary.currency, "HKD");
    } else if (primary.currency === "HKD") {
      fxRate = 1;
    }
    return {
      primary,
      secondary,
      fxRate,
      fetchedAt: Date.now(),
    } satisfies DualMarketResult;
  });
