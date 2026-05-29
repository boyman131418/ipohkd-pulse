import { createServerFn } from "@tanstack/react-start";

const SHEET_ID = "1qI4xjHjvNwAQZchY7Vhjxu8WZQrmz5nX2Hl7YwYOoOA";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

export type AIPick = {
  date: string;
  symbol: string;
  buyPrice: number | null;
  confidence: string;
  confidenceStars: number;
  reason: string;
  currentPrice: number | null;
  diff: number | null;
  diffPct: number | null;
  quoteUrl: string | null;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        cur.push(field);
        field = "";
      } else if (ch === "\n") {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else if (ch === "\r") {
        // skip
      } else {
        field += ch;
      }
    }
  }
  if (field.length || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function num(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^\d.\-+]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function countStars(s: string): number {
  return (s.match(/★/g) || []).length;
}

export const getAIPicks = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ picks: AIPick[]; fetchedAt: number }> => {
    try {
      const res = await fetch(CSV_URL, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!res.ok) throw new Error(`Sheet HTTP ${res.status}`);
      const text = await res.text();
      const rows = parseCsv(text);
      if (rows.length < 2) return { picks: [], fetchedAt: Date.now() };
      const data = rows.slice(1);
      const picks: AIPick[] = data.map((r) => {
        const buy = num(r[2] ?? "");
        const cur = num(r[5] ?? "");
        const diff =
          buy != null && cur != null ? +(cur - buy).toFixed(4) : null;
        const diffPct =
          buy != null && cur != null && buy !== 0
            ? +(((cur - buy) / buy) * 100).toFixed(2)
            : null;
        return {
          date: r[0] ?? "",
          symbol: (r[1] ?? "").trim(),
          buyPrice: buy,
          confidence: r[3] ?? "",
          confidenceStars: countStars(r[3] ?? ""),
          reason: r[4] ?? "",
          currentPrice: cur,
          diff,
          diffPct,
          quoteUrl: r[7] ?? null,
        };
      });
      return { picks, fetchedAt: Date.now() };
    } catch (err) {
      console.error("getAIPicks failed", err);
      return { picks: [], fetchedAt: Date.now() };
    }
  },
);

export type DailyChart = {
  symbol: string;
  resolvedSymbol: string;
  currency: string | null;
  shortName: string | null;
  longName: string | null;
  exchange: string | null;
  marketState: string | null;
  regularMarketPrice: number | null;
  regularMarketChangePercent: number | null;
  regularMarketDayHigh: number | null;
  regularMarketDayLow: number | null;
  regularMarketVolume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  points: { t: number; o: number | null; h: number | null; l: number | null; c: number | null; v: number | null }[];
  error?: string;
};

function candidateSymbols(raw: string): string[] {
  const s = raw.trim().toUpperCase();
  if (!s) return [];
  if (/^\d+$/.test(s)) {
    return [`${s.padStart(4, "0")}.HK`];
  }
  if (s.includes(".")) return [s];
  return [s, `${s}.HK`];
}

async function fetchYahooDaily(symbol: string): Promise<DailyChart | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=6mo`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as any;
  const result = json?.chart?.result?.[0];
  if (!result) return null;
  const meta = result.meta || {};
  const ts: number[] = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const opens: (number | null)[] = quote.open || [];
  const highs: (number | null)[] = quote.high || [];
  const lows: (number | null)[] = quote.low || [];
  const closes: (number | null)[] = quote.close || [];
  const vols: (number | null)[] = quote.volume || [];
  const points = ts.map((t, i) => ({
    t,
    o: opens[i] ?? null,
    h: highs[i] ?? null,
    l: lows[i] ?? null,
    c: closes[i] ?? null,
    v: vols[i] ?? null,
  }));
  return {
    symbol,
    resolvedSymbol: meta.symbol ?? symbol,
    currency: meta.currency ?? null,
    shortName: meta.shortName ?? null,
    longName: meta.longName ?? null,
    exchange: meta.fullExchangeName ?? meta.exchangeName ?? null,
    marketState: meta.marketState ?? null,
    regularMarketPrice: meta.regularMarketPrice ?? null,
    regularMarketChangePercent: (() => {
      const price = meta.regularMarketPrice;
      // Prefer true previous day close; fall back to second-last close in series.
      const prevClose =
        meta.previousClose ??
        meta.regularMarketPreviousClose ??
        (closes.length >= 2 ? closes[closes.length - 2] : null);
      if (price != null && prevClose != null && prevClose !== 0) {
        return +(((price - prevClose) / prevClose) * 100).toFixed(2);
      }
      return null;
    })(),
    regularMarketDayHigh: meta.regularMarketDayHigh ?? null,
    regularMarketDayLow: meta.regularMarketDayLow ?? null,
    regularMarketVolume: meta.regularMarketVolume ?? null,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
    points,
  };
}

export const getDailyChart = createServerFn({ method: "GET" })
  .inputValidator((data: { symbol: string }) => data)
  .handler(async ({ data }): Promise<DailyChart> => {
    const candidates = candidateSymbols(data.symbol);
    for (const sym of candidates) {
      try {
        const r = await fetchYahooDaily(sym);
        if (r && r.points.length > 0) return r;
      } catch (e) {
        // try next
      }
    }
    return {
      symbol: data.symbol,
      resolvedSymbol: data.symbol,
      currency: null,
      shortName: null,
      longName: null,
      exchange: null,
      marketState: null,
      regularMarketPrice: null,
      regularMarketChangePercent: null,
      regularMarketDayHigh: null,
      regularMarketDayLow: null,
      regularMarketVolume: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      points: [],
      error: "找唔到該股票的日線數據",
    };
  });