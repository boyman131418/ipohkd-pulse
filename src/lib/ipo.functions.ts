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
  // page through ~3 pages = ~60 IPOs covering past year+
  for (let page = 1; page <= 3; page++) {
    const url = `https://www.aastocks.com/tc/stocks/market/ipo/listedipo.aspx?s=1&o=0&page=${page}`;
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