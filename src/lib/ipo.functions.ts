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
      });
    }
  }
  return all;
}

async function fetchUpcoming(): Promise<UpcomingIPO[]> {
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
  for (const cells of rows.slice(1)) {
    if (cells.length < 9) continue;
    const { name, code } = splitNameCode(cells[1]);
    if (!code) continue;
    out.push({
      code,
      name,
      industry: cells[2].replace(/\|/g, "").trim() || null,
      issuePrice: cells[3] === "N/A" ? null : cells[3],
      lotSize: parseNum(cells[4]),
      entryFee: parseNum(cells[5]),
      subscriptionDeadline: cells[6],
      greyMarketDate: cells[7],
      listingDate: cells[8],
    });
  }
  return out;
}

export const getIPOData = createServerFn({ method: "GET" }).handler(async () => {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return { listed: cache.listed, upcoming: cache.upcoming, fetchedAt: cache.fetchedAt };
  }
  try {
    const [listed, upcoming] = await Promise.all([fetchListed(), fetchUpcoming()]);
    cache = { listed, upcoming, fetchedAt: Date.now() };
    return { listed, upcoming, fetchedAt: cache.fetchedAt };
  } catch (err) {
    console.error("IPO fetch error:", err);
    if (cache) return { listed: cache.listed, upcoming: cache.upcoming, fetchedAt: cache.fetchedAt };
    return { listed: [], upcoming: [], fetchedAt: Date.now(), error: String(err) };
  }
});