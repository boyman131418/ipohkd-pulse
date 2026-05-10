import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { Search, TrendingUp, TrendingDown, Clock, GitCompare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getDualMarketData,
  getListingsMarketCaps,
  type DualMarketResult,
  type SymbolSeries,
} from "@/lib/dual-market.functions";

export const Route = createFileRoute("/dual-market")({
  head: () => ({
    meta: [
      { title: "主次市場對比 — IPOHKD" },
      {
        name: "description",
        content: "對比港股與其主市場（如美股、韓股、A股）股價走勢、溢價/折讓。",
      },
      { property: "og:title", content: "主次市場對比 — IPOHKD" },
      {
        property: "og:description",
        content: "對比港股與其主市場（如美股、韓股、A股）股價走勢、溢價/折讓。",
      },
    ],
  }),
  component: DualMarketPage,
});

const RANGE_OPTIONS = [
  { value: "5d", label: "5 日" },
  { value: "1mo", label: "1 個月" },
  { value: "3mo", label: "3 個月" },
  { value: "6mo", label: "6 個月" },
  { value: "1y", label: "1 年" },
  { value: "2y", label: "2 年" },
  { value: "5y", label: "5 年" },
];

type DualListing = {
  name: string;
  primary: string;
  primaryMarket: string;
  secondary: string;
  sector?: string;
};

const DUAL_LISTINGS: DualListing[] = [
  // 美股 ADR ↔ 港股
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
  // 韓股 ↔ 港股
  { name: "南方海力士 (SK Hynix)", primary: "000660.KS", primaryMarket: "KRX", secondary: "7709", sector: "半導體" },
  // A股 ↔ 港股 (A+H)
  { name: "工商銀行", primary: "601398.SS", primaryMarket: "上交所", secondary: "1398", sector: "銀行" },
  { name: "建設銀行", primary: "601939.SS", primaryMarket: "上交所", secondary: "0939", sector: "銀行" },
  { name: "中國銀行", primary: "601988.SS", primaryMarket: "上交所", secondary: "3988", sector: "銀行" },
  { name: "招商銀行", primary: "600036.SS", primaryMarket: "上交所", secondary: "3968", sector: "銀行" },
  { name: "中國平安", primary: "601318.SS", primaryMarket: "上交所", secondary: "2318", sector: "保險" },
  { name: "中國人壽", primary: "601628.SS", primaryMarket: "上交所", secondary: "2628", sector: "保險" },
  { name: "中國石化", primary: "600028.SS", primaryMarket: "上交所", secondary: "0386", sector: "能源" },
  { name: "中國石油", primary: "601857.SS", primaryMarket: "上交所", secondary: "0857", sector: "能源" },
  { name: "中國神華", primary: "601088.SS", primaryMarket: "上交所", secondary: "1088", sector: "能源" },
  { name: "中信証券", primary: "600030.SS", primaryMarket: "上交所", secondary: "6030", sector: "券商" },
  { name: "比亞迪", primary: "002594.SZ", primaryMarket: "深交所", secondary: "1211", sector: "新能源車" },
  { name: "海爾智家", primary: "600690.SS", primaryMarket: "上交所", secondary: "6690", sector: "家電" },
  { name: "藥明康德", primary: "603259.SS", primaryMarket: "上交所", secondary: "2359", sector: "醫藥" },
  { name: "恒瑞醫藥", primary: "600276.SS", primaryMarket: "上交所", secondary: "1276", sector: "醫藥" },
  { name: "寧德時代", primary: "300750.SZ", primaryMarket: "深交所", secondary: "3750", sector: "電池" },
  { name: "美的集團", primary: "000333.SZ", primaryMarket: "深交所", secondary: "0300", sector: "家電" },
];

function fmtTs(ts: number) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  }).format(new Date(ts * 1000));
}

function fmtFetchedAt(ts: number) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ts));
}

function PctBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono font-semibold ${
        positive
          ? "text-[color:var(--color-success)]"
          : "text-[color:var(--color-danger)]"
      }`}
    >
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

function fmtBig(n: number | null, suffix = ""): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)} 萬億${suffix}`;
  if (abs >= 1e8) return `${(n / 1e8).toFixed(2)} 億${suffix}`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(2)} 萬${suffix}`;
  return `${n.toFixed(0)} ${suffix}`.trim();
}

function buildNormalizedSeries(
  primary: SymbolSeries,
  secondary: SymbolSeries,
) {
  // Map by t (seconds). Use union of timestamps; normalize each series to its first valid point = 100.
  const pBase = primary.points[0]?.price ?? null;
  const sBase = secondary.points[0]?.price ?? null;
  const pMap = new Map(primary.points.map((p) => [p.t, p.price]));
  const sMap = new Map(secondary.points.map((p) => [p.t, p.price]));
  const allTs = Array.from(new Set([...pMap.keys(), ...sMap.keys()])).sort(
    (a, b) => a - b,
  );
  let lastP: number | null = null;
  let lastS: number | null = null;
  return allTs.map((t) => {
    const pp = pMap.get(t);
    const ss = sMap.get(t);
    if (pp != null) lastP = pp;
    if (ss != null) lastS = ss;
    const pNorm =
      lastP != null && pBase ? +((lastP / pBase) * 100).toFixed(3) : null;
    const sNorm =
      lastS != null && sBase ? +((lastS / sBase) * 100).toFixed(3) : null;
    const spread =
      pNorm != null && sNorm != null ? +(sNorm - pNorm).toFixed(3) : null;
    return { t, primary: pNorm, secondary: sNorm, spread };
  });
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "success" | "danger";
}) {
  return (
    <div className="rounded-xl border border-border/60 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-lg font-semibold ${
          tone === "success"
            ? "text-[color:var(--color-success)]"
            : tone === "danger"
              ? "text-[color:var(--color-danger)]"
              : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function DualMarketPage() {
  const [primary, setPrimary] = useState("000660.KS");
  const [secondary, setSecondary] = useState("7709");
  const [range, setRange] = useState("6mo");
  const [listingQuery, setListingQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("__all");
  const [marketFilter, setMarketFilter] = useState<string>("__all");
  const chartRef = useRef<HTMLDivElement | null>(null);

  function scrollToChart() {
    if (typeof window === "undefined") return;
    requestAnimationFrame(() => {
      chartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const [submitted, setSubmitted] = useState({
    primary: "000660.KS",
    secondary: "7709",
    range: "6mo",
  });

  const dataQuery = useQuery({
    queryKey: ["dual-market", submitted],
    queryFn: () =>
      getDualMarketData({
        data: {
          primary: submitted.primary,
          secondary: submitted.secondary,
          range: submitted.range,
        },
      }),
    staleTime: 2 * 60 * 1000,
    enabled: !!submitted.primary && !!submitted.secondary,
  });

  const listingsMcQuery = useQuery({
    queryKey: ["listings-mc"],
    queryFn: () =>
      getListingsMarketCaps({
        data: {
          pairs: DUAL_LISTINGS.map((l) => ({
            primary: l.primary,
            secondary: l.secondary,
          })),
        },
      }),
    staleTime: 10 * 60 * 1000,
  });

  const mcMap = useMemo(() => {
    const m = new Map<string, { primary: number | null; secondary: number | null }>();
    listingsMcQuery.data?.rows.forEach((r) => {
      m.set(`${r.primary}|${r.secondary}`, {
        primary: r.primaryMcUsd,
        secondary: r.secondaryMcUsd,
      });
    });
    return m;
  }, [listingsMcQuery.data]);

  const data = dataQuery.data as DualMarketResult | undefined;

  const series = useMemo(() => {
    if (!data) return [];
    return buildNormalizedSeries(data.primary, data.secondary);
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return null;
    const p = data.primary;
    const s = data.secondary;
    const primaryMcUsd =
      p.marketCap != null && data.primaryToUsd != null
        ? p.marketCap * data.primaryToUsd
        : null;
    const secondaryMcUsd =
      s.marketCap != null && data.secondaryToUsd != null
        ? s.marketCap * data.secondaryToUsd
        : null;
    const premiumPct =
      primaryMcUsd != null && secondaryMcUsd != null && primaryMcUsd !== 0
        ? +(((secondaryMcUsd - primaryMcUsd) / primaryMcUsd) * 100).toFixed(2)
        : null;
    return {
      primaryMc: p.marketCap,
      secondaryMc: s.marketCap,
      primaryMcUsd,
      secondaryMcUsd,
      premiumPct,
    };
  }, [data]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setSubmitted({
      primary: primary.trim(),
      secondary: secondary.trim(),
      range,
    });
    scrollToChart();
  }

  function pickListing(item: DualListing) {
    setPrimary(item.primary);
    setSecondary(item.secondary);
    setSubmitted({ primary: item.primary, secondary: item.secondary, range });
    scrollToChart();
  }

  const filteredListings = useMemo(() => {
    const q = listingQuery.trim().toLowerCase();
    return DUAL_LISTINGS.filter((l) => {
      if (sectorFilter !== "__all" && (l.sector ?? "") !== sectorFilter) return false;
      if (marketFilter !== "__all" && l.primaryMarket !== marketFilter) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        l.primary.toLowerCase().includes(q) ||
        l.secondary.toLowerCase().includes(q) ||
        (l.sector ?? "").toLowerCase().includes(q) ||
        l.primaryMarket.toLowerCase().includes(q)
      );
    });
  }, [listingQuery, sectorFilter, marketFilter]);

  const sectorOptions = useMemo(
    () => Array.from(new Set(DUAL_LISTINGS.map((l) => l.sector ?? "").filter(Boolean))).sort(),
    [],
  );
  const marketOptions = useMemo(
    () => Array.from(new Set(DUAL_LISTINGS.map((l) => l.primaryMarket))).sort(),
    [],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 backdrop-blur-sm sticky top-0 z-10 bg-background/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center font-black text-xl"
              style={{
                background: "var(--gradient-hero)",
                color: "var(--primary-foreground)",
              }}
            >
              ₿
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">IPOHKD</h1>
              <p className="text-xs text-muted-foreground">香港新股情報站</p>
            </div>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/">
              <Button variant="ghost" size="sm">
                IPO 市場
              </Button>
            </Link>
            <Link to="/dual-market">
              <Button variant="default" size="sm">
                <GitCompare className="h-4 w-4" />
                主次市場
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">
        <section className="relative overflow-hidden rounded-3xl border border-border/60 p-8 sm:p-12">
          <div
            className="absolute inset-0 opacity-20"
            style={{ background: "var(--gradient-hero)" }}
          />
          <div className="relative">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight max-w-2xl">
              主次市場對比，
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--gradient-hero)" }}
              >
                溢價、折讓一目了然。
              </span>
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl">
              輸入主市場代碼（例如：000660.KS、AAPL、600519.SS）同港股代碼（例如：7709），對比走勢同當前溢價／折讓。
            </p>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-4 w-4" style={{ color: "var(--primary)" }} />
              查詢
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={submit}
              className="grid grid-cols-1 sm:grid-cols-12 gap-3"
            >
              <div className="sm:col-span-4">
                <label className="text-xs text-muted-foreground">
                  主市場代碼（Yahoo Finance）
                </label>
                <Input
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                  placeholder="如 000660.KS / AAPL / 600519.SS"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="text-xs text-muted-foreground">
                  港股代碼（次市場）
                </label>
                <Input
                  value={secondary}
                  onChange={(e) => setSecondary(e.target.value)}
                  placeholder="如 7709"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="text-xs text-muted-foreground">區間</label>
                <Select value={range} onValueChange={setRange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RANGE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 flex items-end">
                <Button type="submit" className="w-full">
                  對比
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
              <span>主次市場對照表（按公司即可對比）</span>
              <Input
                value={listingQuery}
                onChange={(e) => setListingQuery(e.target.value)}
                placeholder="搜尋公司／代碼／行業…"
                className="max-w-xs"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>公司</TableHead>
                    <TableHead>行業</TableHead>
                    <TableHead>主市場</TableHead>
                    <TableHead>主市場代碼</TableHead>
                    <TableHead>港股代碼</TableHead>
                    <TableHead className="text-right">主市場市值 (USD)</TableHead>
                    <TableHead className="text-right">港股市值 (USD)</TableHead>
                    <TableHead className="text-right">折讓／溢價</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredListings.map((l) => {
                    const active =
                      submitted.primary === l.primary &&
                      submitted.secondary === l.secondary;
                    const mc = mcMap.get(`${l.primary}|${l.secondary}`);
                    const premium =
                      mc?.primary != null && mc?.secondary != null && mc.primary !== 0
                        ? ((mc.secondary - mc.primary) / mc.primary) * 100
                        : null;
                    return (
                      <TableRow
                        key={`${l.primary}-${l.secondary}`}
                        className={`cursor-pointer ${active ? "bg-muted/60" : ""}`}
                        onClick={() => pickListing(l)}
                      >
                        <TableCell className="font-medium">{l.name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {l.sector ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs">{l.primaryMarket}</TableCell>
                        <TableCell className="font-mono text-xs">{l.primary}</TableCell>
                        <TableCell className="font-mono text-xs">{l.secondary}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {mc?.primary != null
                            ? fmtBig(mc.primary, "USD")
                            : listingsMcQuery.isLoading
                              ? "…"
                              : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {mc?.secondary != null
                            ? fmtBig(mc.secondary, "USD")
                            : listingsMcQuery.isLoading
                              ? "…"
                              : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          <PctBadge value={premium} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={active ? "default" : "outline"}
                            onClick={(e) => {
                              e.stopPropagation();
                              pickListing(l);
                            }}
                          >
                            <GitCompare className="h-3 w-3" />
                            對比
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredListings.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-center text-muted-foreground py-8"
                      >
                        找不到符合條件的公司
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {dataQuery.isLoading && (
          <div className="text-center text-muted-foreground py-8">載入中…</div>
        )}

        {data && (
          <>
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label={`主市場 ${data.primary.symbol}　市值`}
                value={
                  <div>
                    <span className="font-mono">
                      {fmtBig(stats?.primaryMc ?? null, data.primary.currency ?? "")}
                    </span>
                    <div className="text-xs text-muted-foreground font-mono mt-1">
                      ≈ {fmtBig(stats?.primaryMcUsd ?? null, "USD")}
                    </div>
                  </div>
                }
              />
              <StatCard
                label={`次市場 ${data.secondary.symbol}　市值`}
                value={
                  <div>
                    <span className="font-mono">
                      {fmtBig(stats?.secondaryMc ?? null, data.secondary.currency ?? "HKD")}
                    </span>
                    <div className="text-xs text-muted-foreground font-mono mt-1">
                      ≈ {fmtBig(stats?.secondaryMcUsd ?? null, "USD")}
                    </div>
                  </div>
                }
              />
              <StatCard
                label="港股溢價／折讓（USD 市值對比）"
                value={<PctBadge value={stats?.premiumPct ?? null} />}
                tone={
                  stats?.premiumPct == null
                    ? undefined
                    : stats.premiumPct >= 0
                      ? "success"
                      : "danger"
                }
              />
            </section>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                  <span>標準化走勢（起點 = 100）</span>
                  <span className="text-xs text-muted-foreground font-normal">
                    <Clock className="inline h-3 w-3 mr-1" />
                    {fmtFetchedAt(data.fetchedAt)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {series.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    無數據{data.primary.error ? `（主：${data.primary.error}）` : ""}
                    {data.secondary.error ? `（次：${data.secondary.error}）` : ""}
                  </div>
                ) : (
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={series}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          opacity={0.4}
                        />
                        <XAxis
                          dataKey="t"
                          tickFormatter={fmtTs}
                          stroke="var(--muted-foreground)"
                          fontSize={11}
                          minTickGap={40}
                        />
                        <YAxis
                          stroke="var(--muted-foreground)"
                          fontSize={11}
                          domain={["auto", "auto"]}
                        />
                        <Tooltip
                          labelFormatter={(t) => fmtTs(Number(t))}
                          contentStyle={{
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(v: any, name: any) => {
                            if (v == null) return ["—", name];
                            return [Number(v).toFixed(2), name];
                          }}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="primary"
                          name={`主：${data.primary.symbol}`}
                          stroke="var(--primary)"
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="secondary"
                          name={`次：${data.secondary.symbol}`}
                          stroke="var(--color-success)"
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>港股相對主市場差距（標準化點差）</CardTitle>
              </CardHeader>
              <CardContent>
                {series.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    無數據
                  </div>
                ) : (
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={series}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          opacity={0.4}
                        />
                        <XAxis
                          dataKey="t"
                          tickFormatter={fmtTs}
                          stroke="var(--muted-foreground)"
                          fontSize={11}
                          minTickGap={40}
                        />
                        <YAxis
                          stroke="var(--muted-foreground)"
                          fontSize={11}
                          domain={["auto", "auto"]}
                        />
                        <Tooltip
                          labelFormatter={(t) => fmtTs(Number(t))}
                          contentStyle={{
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(v: any) =>
                            v == null ? "—" : Number(v).toFixed(2)
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="spread"
                          name="次 - 主"
                          stroke="var(--primary)"
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  說明：兩邊走勢均以區間首日為 100 標準化。差距 = 次 − 主。正值代表港股相對主市場跑贏，負值反之。「港股溢價／折讓」則用兩地最新收市價 × 即時匯率比較。
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
