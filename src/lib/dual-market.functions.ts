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
  const digits = s.replace(/\D/g, "");
  if (digits) {
    // Yahoo 港股代碼需要 4 位零填充（例如 939 → 0939.HK）
    const padded = String(parseInt(digits, 10)).padStart(4, "0");
    return `${padded}.HK`;
  }
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
    // ETF fallback：ETF 通常無 marketCap，改用基金資產規模（AUM / totalAssets）
    const totalAssets = result?.defaultKeyStatistics?.totalAssets?.raw;
    const so = result?.defaultKeyStatistics?.sharesOutstanding?.raw;
    const effectiveMc =
      typeof mc === "number" && mc > 0
        ? mc
        : typeof totalAssets === "number" && totalAssets > 0
          ? totalAssets
          : null;
    return {
      marketCap: effectiveMc,
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

// ============================================================
// 主次市場對照表（自動爬取 A+H + 手動 ADR/KS）
// ============================================================

export type DualListingItem = {
  name: string;
  primary: string;
  primaryMarket: string;
  secondary: string;
  sector?: string;
  /** 追蹤類型：未指定即為同公司雙重上市；"ETF" 表示港股為 ETF 追蹤；可附加 "2x" 等槓桿說明 */
  trackingType?: string;
};

// 手動維護：非 A+H 的同公司雙重上市（中概股 ADR、韓股等）
const MANUAL_LISTINGS: DualListingItem[] = [
  { name: "阿里巴巴", primary: "BABA", primaryMarket: "NYSE", secondary: "9988", sector: "互聯網" },
  { name: "京東", primary: "JD", primaryMarket: "NASDAQ", secondary: "9618", sector: "電商" },
  { name: "百度", primary: "BIDU", primaryMarket: "NASDAQ", secondary: "9888", sector: "互聯網" },
  { name: "網易", primary: "NTES", primaryMarket: "NASDAQ", secondary: "9999", sector: "遊戲" },
  { name: "嗶哩嗶哩", primary: "BILI", primaryMarket: "NASDAQ", secondary: "9626", sector: "媒體" },
  { name: "新東方", primary: "EDU", primaryMarket: "NYSE", secondary: "9901", sector: "教育" },
  { name: "百勝中國", primary: "YUMC", primaryMarket: "NYSE", secondary: "9987", sector: "餐飲" },
  { name: "理想汽車", primary: "LI", primaryMarket: "NASDAQ", secondary: "2015", sector: "新能源車" },
  { name: "小鵬汽車", primary: "XPEV", primaryMarket: "NYSE", secondary: "9868", sector: "新能源車" },
  { name: "蔚來", primary: "NIO", primaryMarket: "NYSE", secondary: "9866", sector: "新能源車" },
  { name: "攜程", primary: "TCOM", primaryMarket: "NASDAQ", secondary: "9961", sector: "旅遊" },
  { name: "中通快遞", primary: "ZTO", primaryMarket: "NYSE", secondary: "2057", sector: "物流" },
  { name: "微博", primary: "WB", primaryMarket: "NASDAQ", secondary: "9898", sector: "社交" },
  { name: "知乎", primary: "ZH", primaryMarket: "NYSE", secondary: "2390", sector: "互聯網" },
  { name: "陸金所", primary: "LU", primaryMarket: "NYSE", secondary: "6623", sector: "金融科技" },
  { name: "金山雲", primary: "KC", primaryMarket: "NASDAQ", secondary: "3896", sector: "雲計算" },
  { name: "再鼎醫藥", primary: "ZLAB", primaryMarket: "NASDAQ", secondary: "9688", sector: "生物科技" },
  { name: "名創優品", primary: "MNSO", primaryMarket: "NYSE", secondary: "9896", sector: "零售" },
  {
    name: "SK 海力士（南方東英 2x ETF）",
    primary: "000660.KS",
    primaryMarket: "KRX",
    secondary: "7709",
    sector: "半導體",
    trackingType: "ETF 2x 槓桿",
  },
  {
    name: "三星電子（南方東英 2x ETF）",
    primary: "005930.KS",
    primaryMarket: "KRX",
    secondary: "7773",
    sector: "半導體",
    trackingType: "ETF 2x 槓桿",
  },
];

// A+H 行業分類（由 H 股代碼或 A 股代碼補充）
const SECTOR_MAP: Record<string, string> = {
  "1398": "銀行", "0939": "銀行", "3988": "銀行", "3968": "銀行",
  "1288": "銀行", "3328": "銀行", "0998": "銀行", "1658": "銀行",
  "3618": "銀行", "1988": "銀行", "6818": "銀行", "1216": "銀行",
  "2318": "保險", "2628": "保險", "1339": "保險", "0966": "保險", "2601": "保險",
  "0386": "能源", "0857": "能源", "1088": "能源", "0902": "能源", "0916": "能源",
  "0728": "電訊", "0941": "電訊", "0762": "電訊",
  "6030": "券商", "6837": "券商", "6886": "券商", "1776": "券商", "3958": "券商",
  "1211": "新能源車", "2015": "新能源車",
  "0300": "家電", "6690": "家電",
  "2359": "醫藥", "1276": "醫藥", "1093": "醫藥", "1099": "醫藥",
  "3750": "電池",
  "1766": "基建", "0390": "基建", "1186": "基建", "1800": "基建", "0552": "基建",
  "1138": "航運", "1919": "航運",
  "0753": "航空", "0670": "航空", "1055": "航空",
  "0688": "地產", "1109": "地產", "3380": "地產",
  "2238": "汽車", "0489": "汽車", "1958": "汽車",
  "0347": "鋼鐵", "0323": "鋼鐵",
  "0168": "啤酒",
};

let listingsCache: { rows: DualListingItem[]; ts: number } | null = null;

async function fetchAHListings(): Promise<DualListingItem[]> {
  try {
    const res = await fetch("http://aastock.hk/sc/stocks/market/ah.aspx", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const namePat = /class="ahstock[^"]*"[^>]*>([\s\S]{0,300}?)<\/td>/g;
    const hPat = /class="hshare[^"]*"[^>]*>[\s\S]{0,400}?symbol=(\d{5})/g;
    const aPat = /title='(\d{6})\.(SH|SZ)'/g;
    const names: { pos: number; name: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = namePat.exec(html))) {
      const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      names.push({ pos: m.index, name: text });
    }
    const hs: { pos: number; code: string }[] = [];
    while ((m = hPat.exec(html))) hs.push({ pos: m.index, code: m[1] });
    const as: { pos: number; code: string; mkt: string }[] = [];
    while ((m = aPat.exec(html))) as.push({ pos: m.index, code: m[1], mkt: m[2] });
    const out: DualListingItem[] = [];
    for (let i = 0; i < names.length; i++) {
      const start = names[i].pos;
      const end = i + 1 < names.length ? names[i + 1].pos : html.length;
      const h = hs.find((x) => x.pos > start && x.pos < end);
      const a = as.find((x) => x.pos > start && x.pos < end);
      if (!h || !a) continue;
      // H code: 5-digit → 4-digit (去除多餘的前置 0)
      const hk4 = String(parseInt(h.code, 10)).padStart(4, "0");
      const yahooSuffix = a.mkt === "SH" ? ".SS" : ".SZ";
      out.push({
        name: names[i].name,
        primary: `${a.code}${yahooSuffix}`,
        primaryMarket: a.mkt === "SH" ? "上交所" : "深交所",
        secondary: hk4,
        sector: SECTOR_MAP[hk4],
      });
    }
    return out;
  } catch {
    return [];
  }
}

export const getDualListings = createServerFn({ method: "GET" }).handler(
  async () => {
    if (listingsCache && Date.now() - listingsCache.ts < 24 * 60 * 60 * 1000) {
      return { rows: listingsCache.rows, fetchedAt: listingsCache.ts };
    }
    const ah = await fetchAHListings();
    // 去重：以 primary+secondary 為 key；手動條目優先（保留行業）
    const map = new Map<string, DualListingItem>();
    for (const it of ah) map.set(`${it.primary}|${it.secondary}`, it);
    for (const it of MANUAL_LISTINGS) map.set(`${it.primary}|${it.secondary}`, it);
    const rows = Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "zh-Hant"),
    );
    listingsCache = { rows, ts: Date.now() };
    return { rows, fetchedAt: listingsCache.ts };
  },
);
