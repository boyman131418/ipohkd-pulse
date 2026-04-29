import { createServerFn } from "@tanstack/react-start";

export type ListedIPO = {
  code: string;
  name: string;
  listingDate: string;
  lotSize: number | null;
  marketCap: string | null;
  issuePrice: number | null;
  listingPrice: number | null;
  oversubscription: string | null;
  guaranteedAllotment: string | null;
  allotmentRate: string | null;
  currentPrice: number | null;
  firstDayChangePct: number | null;
  cumulativeChangePct: number | null;
  minSubscriptionAmount: number | null;
  marginOversubscription: number | null;
  guaranteedLots: number | null;
};

export type UpcomingIPO = {
  code: string;
  name: string;
  industry: string | null;
  issuePrice: string | null;
  lotSize: number | null;
  entryFee: number | null;
  subscriptionDeadline: string | null;
  greyMarketDate: string | null;
  listingDate: string | null;
  marginStatus: string | null;
  estimatedGuaranteedLots: number | null;
};

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  "Accept-Language": "zh-HK,zh;q=0.9,en;q=0.8",
};

function clean(html: string): string {
  return html
    .replace(/<[^>]+>/g, "|")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNum(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.replace(/[, ]/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function parsePct(s: string | null | undefined): number | null {
  if (!s) return null;
  if (s.includes("N/A")) return null;
  const m = s.replace(/[, ]/g, "").match(/(-?\+?\d+(\.\d+)?)/);
  return m ? parseFloat(m[1].replace("+", "")) : null;
}

function extractRows(html: string, tableMatch: RegExp): string[][] {
  const t = html.match(tableMatch);
  if (!t) return [];
  const rows = [...t[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) => r[1]);
  return rows.map((r) =>
    [...r.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => clean(c[1])),
  );
}

function splitNameCode(cell: string): { name: string; code: string } {
  // Pattern like: "|公司名稱|||01609.HK|"
  const codeMatch = cell.match(/(\d{4,5})\.HK/);
  const code = codeMatch ? codeMatch[1] : "";
  let name = cell
    .replace(/\|+/g, " ")
    .replace(/\d{4,5}\.HK/, "")
    .replace(/今日暗盤/g, "")
    .trim();
  return { name, code };
}

let cache: {
  listed: ListedIPO[];
  upcoming: UpcomingIPO[];
  fetchedAt: number;
} | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function fetchListed(): Promise<ListedIPO[]> {
  const all: ListedIPO[] = [];
  // s=3&o=0 = 按上市日期 DESC，連續分頁，覆蓋過去一年
  const seen = new Set<string>();
  for (let page = 1; page <= 8; page++) {
    const url = `https://www.aastocks.com/tc/stocks/market/ipo/listedipo.aspx?s=3&o=0&page=${page}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) continue;
    const html = await res.text();
    const rows = extractRows(
      html,
      /<table class="ns2 dataTable"[^>]*>([\s\S]*?)<\/table>/,
    );
    // skip header row
    for (const cells of rows.slice(1)) {
      if (cells.length < 12) continue;
      const { name, code } = splitNameCode(cells[1]);
      if (!code) continue;
      if (seen.has(code)) continue;
      seen.add(code);
      const listingDate = cells[2];
      const lotSize = parseNum(cells[3]);
      const marketCap = cells[4] === "N/A" ? null : cells[4];
      const issuePrice = parseNum(cells[5]);
      const listingPrice = parseNum(cells[6]);
      const oversubscription = cells[7];
      const guaranteedAllotment = cells[8];
      const allotmentRate = cells[9];
      const currentPrice = parseNum(cells[10]);
      const firstDayChangePct = parsePct(cells[11]);
      const cumulativeChangePct = parsePct(cells[12]);
      const minSubscriptionAmount =
        issuePrice && lotSize ? +(issuePrice * lotSize).toFixed(2) : null;
      // 孖展超購倍數：oversubscription 例如 "12.34倍" / "N/A"
      const marginOversubscription = parsePct(oversubscription);
      // 穩抽手數：根據獲分配比率 e.g. "100%" -> 1; "50%" -> 2; "10%" -> 10
      const allotPct = parsePct(allotmentRate);
      const guaranteedLots =
        allotPct && allotPct > 0 ? Math.ceil(100 / allotPct) : null;
      all.push({
        code,
        name,
        listingDate,
        lotSize,
        marketCap,
        issuePrice,
        listingPrice,
        oversubscription,
        guaranteedAllotment,
        allotmentRate,
        currentPrice,
        firstDayChangePct,
        cumulativeChangePct,
        minSubscriptionAmount,
        marginOversubscription,
        guaranteedLots,
      });
    }
    // 已經爬到一年前就停
    const oldestOnPage = all[all.length - 1]?.listingDate;
    if (oldestOnPage) {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const d = new Date(oldestOnPage.replace(/\//g, "-"));
      if (!isNaN(d.getTime()) && d < oneYearAgo) break;
    }
  }
  return all;
}

async function fetchUpcoming(
  listedReference: ListedIPO[] = [],
): Promise<UpcomingIPO[]> {
  const url =
    "https://www.aastocks.com/tc/stocks/market/ipo/upcomingipo/company-summary";
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return [];
  const html = await res.text();
  const rows = extractRows(
    html,
    /<table id="tblGMUpcoming"[^>]*>([\s\S]*?)<\/table>/,
  );
  const out: UpcomingIPO[] = [];
  // 用近期上市新股嘅中位數做粗略估算，作為「待公布」前嘅參考
  const recentValid = listedReference
    .filter((r) => r.marginOversubscription != null && r.guaranteedLots != null)
    .slice(0, 30);
  const medianOversub = median(
    recentValid.map((r) => r.marginOversubscription as number),
  );
  const medianGuaranteedLots = median(
    recentValid.map((r) => r.guaranteedLots as number),
  );
  for (const cells of rows.slice(1)) {
    if (cells.length < 9) continue;
    const { name, code } = splitNameCode(cells[1]);
    if (!code) continue;
    const entryFee = parseNum(cells[5]);
    // 入場費高 → 通常孖展熱度低；用粗略分級
    let marginStatus: string | null = null;
    if (entryFee != null) {
      if (entryFee < 3000) marginStatus = "高熱度 (預期超購)";
      else if (entryFee < 8000) marginStatus = "中等熱度";
      else if (entryFee < 20000) marginStatus = "偏冷";
      else marginStatus = "冷門 (大手碼)";
    }
    out.push({
      code,
      name,
      industry: cells[2].replace(/\|/g, "").trim() || null,
      issuePrice: cells[3] === "N/A" ? null : cells[3],
      lotSize: parseNum(cells[4]),
      entryFee,
      subscriptionDeadline: cells[6],
      greyMarketDate: cells[7],
      listingDate: cells[8],
      marginStatus,
      estimatedGuaranteedLots: medianGuaranteedLots,
    });
  }
  return out;
}

function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : +((s[m - 1] + s[m]) / 2).toFixed(1);
}

export const getIPOData = createServerFn({ method: "GET" }).handler(async () => {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return { listed: cache.listed, upcoming: cache.upcoming, fetchedAt: cache.fetchedAt };
  }
  try {
    const listed = await fetchListed();
    const upcoming = await fetchUpcoming(listed);
    cache = { listed, upcoming, fetchedAt: Date.now() };
    return { listed, upcoming, fetchedAt: cache.fetchedAt };
  } catch (err) {
    console.error("IPO fetch error:", err);
    if (cache) return { listed: cache.listed, upcoming: cache.upcoming, fetchedAt: cache.fetchedAt };
    return { listed: [], upcoming: [], fetchedAt: Date.now(), error: String(err) };
  }
});

// === First-day intraday chart + volatility (via Yahoo Finance) ===
export type FirstDayPoint = { t: number; price: number };
export type FirstDayChart = {
  code: string;
  points: FirstDayPoint[];
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  rangePct: number | null; // 波幅 = (high-low)/low * 100
  listingDate: string | null;
  error?: string;
};

const firstDayCache = new Map<string, { data: FirstDayChart; at: number }>();
const FIRSTDAY_TTL = 60 * 60 * 1000;

async function fetchYahooFirstDay(code: string, listingDateISO: string): Promise<FirstDayChart> {
  // listingDateISO format YYYY/MM/DD
  const symbol = `${parseInt(code, 10)}.HK`;
  // HK trading: 09:30 - 16:00 HKT (UTC+8). build period in UTC seconds.
  const [y, m, d] = listingDateISO.split("/").map((s) => parseInt(s, 10));
  // 00:30 UTC = 08:30 HKT (pre-open) → 08:30 UTC = 16:30 HKT (post-close)
  // 用 60m K 線取首日全日（資料量小、回應快）
  const dayStart = Date.UTC(y, m - 1, d, 0, 30) / 1000;
  const dayEnd = Date.UTC(y, m - 1, d, 8, 30) / 1000;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=60m&period1=${dayStart}&period2=${dayEnd}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = (await res.json()) as any;
  const result = json?.chart?.result?.[0];
  if (!result) {
    // fallback to wider range with 60m interval
    const url2 = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=60m&range=1mo`;
    const r2 = await fetch(url2, { headers: { "User-Agent": "Mozilla/5.0" } });
    const j2 = (await r2.json()) as any;
    const r = j2?.chart?.result?.[0];
    if (!r) throw new Error("No data from Yahoo");
    return parseYahooResult(code, listingDateISO, r);
  }
  return parseYahooResult(code, listingDateISO, result);
}

function parseYahooResult(code: string, listingDateISO: string, result: any): FirstDayChart {
  const ts: number[] = result.timestamp || [];
  const quotes = result.indicators?.quote?.[0] || {};
  const closes: (number | null)[] = quotes.close || [];
  const highs: (number | null)[] = quotes.high || [];
  const lows: (number | null)[] = quotes.low || [];

  // filter to listing date in HKT
  const [y, m, d] = listingDateISO.split("/").map((s) => parseInt(s, 10));
  const dayStartUTC = Date.UTC(y, m - 1, d, 1, 0); // 09:00 HKT
  const dayEndUTC = Date.UTC(y, m - 1, d, 8, 30); // 16:30 HKT
  const points: FirstDayPoint[] = [];
  let high: number | null = null;
  let low: number | null = null;
  let open: number | null = null;
  let close: number | null = null;
  for (let i = 0; i < ts.length; i++) {
    const tMs = ts[i] * 1000;
    if (tMs < dayStartUTC || tMs > dayEndUTC) continue;
    const c = closes[i];
    const h = highs[i];
    const l = lows[i];
    if (c == null) continue;
    if (open == null) open = c;
    close = c;
    if (h != null) high = high == null ? h : Math.max(high, h);
    if (l != null) low = low == null ? l : Math.min(low, l);
    points.push({ t: ts[i], price: c });
  }
  // 首日全日（每小時一個 K 線）
  const rangePct =
    high != null && low != null && low > 0 ? +((high - low) / low * 100).toFixed(2) : null;
  return {
    code,
    points,
    open,
    high,
    low,
    close,
    rangePct,
    listingDate: listingDateISO,
  };
}

export const getFirstDayChart = createServerFn({ method: "GET" })
  .inputValidator((d: { code: string }) => d)
  .handler(async ({ data }) => {
    const code = data.code.replace(/\D/g, "").padStart(5, "0");
    const cached = firstDayCache.get(code);
    if (cached && Date.now() - cached.at < FIRSTDAY_TTL) return cached.data;
    try {
      // find listing date from cached IPO data
      let listingDate: string | null = null;
      if (cache) {
        const found = cache.listed.find((r) => r.code.padStart(5, "0") === code);
        if (found) listingDate = found.listingDate;
      }
      if (!listingDate) {
        // fetch fresh
        const listed = await fetchListed();
        const found = listed.find((r) => r.code.padStart(5, "0") === code);
        if (!found) {
          const empty: FirstDayChart = {
            code,
            points: [],
            open: null,
            high: null,
            low: null,
            close: null,
            rangePct: null,
            listingDate: null,
            error: "找不到該股票上市日期",
          };
          return empty;
        }
        listingDate = found.listingDate;
      }
      const result = await fetchYahooFirstDay(code, listingDate);
      firstDayCache.set(code, { data: result, at: Date.now() });
      return result;
    } catch (err) {
      console.error("first day chart error:", err);
      return {
        code,
        points: [],
        open: null,
        high: null,
        low: null,
        close: null,
        rangePct: null,
        listingDate: null,
        error: String(err),
      } as FirstDayChart;
    }
  });

// === Batch first-day volatility (range%) for table display ===
export const getFirstDayRanges = createServerFn({ method: "GET" })
  .inputValidator((d: { codes: string[] }) => d)
  .handler(async ({ data }) => {
    const codes = data.codes
      .map((c) => c.replace(/\D/g, "").padStart(5, "0"))
      .slice(0, 60);
    const out: Record<
      string,
      { rangePct: number | null; open: number | null; close: number | null; openClosePct: number | null }
    > = {};
    if (!cache) {
      try {
        const listed = await fetchListed();
        cache = { listed, upcoming: [], fetchedAt: Date.now() };
      } catch {}
    }
    const map = new Map(
      (cache?.listed || []).map((r) => [r.code.padStart(5, "0"), r.listingDate]),
    );
    // parallel with concurrency 6
    const queue = [...codes];
    const workers = Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const code = queue.shift();
        if (!code) break;
        const cached = firstDayCache.get(code);
        if (cached && Date.now() - cached.at < FIRSTDAY_TTL) {
          out[code] = toEntry(cached.data);
          continue;
        }
        const listingDate = map.get(code);
        if (!listingDate) {
          out[code] = { rangePct: null, open: null, close: null, openClosePct: null };
          continue;
        }
        try {
          const r = await fetchYahooFirstDay(code, listingDate);
          firstDayCache.set(code, { data: r, at: Date.now() });
          out[code] = toEntry(r);
        } catch {
          out[code] = { rangePct: null, open: null, close: null, openClosePct: null };
        }
      }
    });
    await Promise.all(workers);
    return { ranges: out, fetchedAt: Date.now() };
  });

function toEntry(d: FirstDayChart) {
  const openClosePct =
    d.open != null && d.close != null && d.open !== 0
      ? +(((d.close - d.open) / d.open) * 100).toFixed(2)
      : null;
  return {
    rangePct: d.rangePct,
    open: d.open,
    close: d.close,
    openClosePct,
  };
}