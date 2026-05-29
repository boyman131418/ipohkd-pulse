import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Bar,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Search,
  Sparkles,
  GitCompare,
  Clock,
  ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getAIPicks, getDailyChart, type AIPick } from "@/lib/ai-picks.functions";

const picksQuery = queryOptions({
  queryKey: ["ai-picks"],
  queryFn: () => getAIPicks(),
  staleTime: 5 * 60 * 1000,
});

export const Route = createFileRoute("/ai-picks")({
  head: () => ({
    meta: [
      { title: "AI 選股 — IPOHKD" },
      {
        name: "description",
        content: "由 AI 每日精選嘅潛力股票，附買入價、信心指數同即時走勢圖。",
      },
      { property: "og:title", content: "AI 選股 — IPOHKD" },
      {
        property: "og:description",
        content: "AI 精選潛力股，附即時報價同日線圖。",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(picksQuery),
  component: AIPicksPage,
});

function fmt(n: number | null, digits = 2) {
  return n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function fmtTs(ts: number) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts));
}

type SortKey = "date" | "stars" | "diffPct" | "symbol";

function DiffCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  if (value === 0)
    return <span className="font-mono text-muted-foreground">0.00%</span>;
  const up = value > 0;
  return (
    <span
      className={`inline-flex items-center justify-end gap-1 font-mono font-semibold ${
        up ? "text-[color:var(--color-success)]" : "text-[color:var(--color-danger)]"
      }`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

function AIPicksPage() {
  const { data } = useSuspenseQuery(picksQuery);
  const picks = data.picks;

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("stars");
  const [filter, setFilter] = useState<"all" | "5" | "4plus" | "winner" | "loser">("all");
  const [openSymbol, setOpenSymbol] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let rows = [...picks];
    const q = query.trim().toLowerCase();
    if (q)
      rows = rows.filter(
        (r) =>
          r.symbol.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q),
      );
    if (filter === "5") rows = rows.filter((r) => r.confidenceStars >= 5);
    if (filter === "4plus") rows = rows.filter((r) => r.confidenceStars >= 4);
    if (filter === "winner") rows = rows.filter((r) => (r.diffPct ?? 0) > 0);
    if (filter === "loser") rows = rows.filter((r) => (r.diffPct ?? 0) < 0);
    rows.sort((a, b) => {
      const get = (x: AIPick) => {
        switch (sortBy) {
          case "stars":
            return x.confidenceStars;
          case "diffPct":
            return x.diffPct ?? -Infinity;
          case "symbol":
            return -x.symbol.charCodeAt(0);
          case "date":
          default:
            return new Date(x.date).getTime();
        }
      };
      return get(b) - get(a);
    });
    return rows;
  }, [picks, query, sortBy, filter]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 backdrop-blur-sm sticky top-0 z-10 bg-background/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center font-black text-xl"
              style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
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
              <Button variant="ghost" size="sm">IPO 市場</Button>
            </Link>
            <Link to="/dual-market">
              <Button variant="ghost" size="sm">
                <GitCompare className="h-4 w-4" />
                主次市場
              </Button>
            </Link>
            <Link to="/ai-picks">
              <Button variant="default" size="sm">
                <Sparkles className="h-4 w-4" />
                AI 選股
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-border/60 p-8">
          <div className="absolute inset-0 opacity-20" style={{ background: "var(--gradient-hero)" }} />
          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-3">
              <Sparkles className="h-3 w-3" />
              AI 精選
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">每日 AI 選股</h2>
            <p className="mt-3 text-muted-foreground max-w-xl">
              來源：Google Sheet 同步資料庫。按下股票編號可查看詳細資料同日線圖。
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              <Clock className="inline h-3 w-3 mr-1" />
              更新：{fmtTs(data.fetchedAt)}　·　共 {picks.length} 隻
            </p>
          </div>
        </section>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜尋代號或原因..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stars">信心指數</SelectItem>
              <SelectItem value="diffPct">差價百分比</SelectItem>
              <SelectItem value="date">日期</SelectItem>
              <SelectItem value="symbol">代號</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="5">★★★★★</SelectItem>
              <SelectItem value="4plus">★★★★ 以上</SelectItem>
              <SelectItem value="winner">獲利中</SelectItem>
              <SelectItem value="loser">虧損中</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日期</TableHead>
                  <TableHead>代號</TableHead>
                  <TableHead>信心</TableHead>
                  <TableHead className="text-right">買入價</TableHead>
                  <TableHead className="text-right">現價</TableHead>
                  <TableHead className="text-right">差價</TableHead>
                  <TableHead className="text-right">差價 %</TableHead>
                  <TableHead className="min-w-[280px]">買入原因</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      暫無符合條件嘅資料
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((r, idx) => (
                  <TableRow key={`${r.symbol}-${r.date}-${idx}`}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{r.date}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setOpenSymbol(r.symbol)}
                        className="font-mono font-bold text-[color:var(--primary)] hover:underline"
                      >
                        {r.symbol}
                      </button>
                    </TableCell>
                    <TableCell>
                      <span className="text-amber-500 font-mono text-sm" title={`${r.confidenceStars}/5`}>
                        {r.confidence || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.buyPrice, 4)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.currentPrice, 4)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {r.diff == null ? "—" : (r.diff > 0 ? "+" : "") + r.diff.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DiffCell value={r.diffPct} />
                    </TableCell>
                    <TableCell className="text-sm leading-relaxed text-muted-foreground">
                      {r.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </main>

      <StockDetailDialog
        symbol={openSymbol}
        pick={picks.find((p) => p.symbol === openSymbol) ?? null}
        onClose={() => setOpenSymbol(null)}
      />
    </div>
  );
}

function StockDetailDialog({
  symbol,
  pick,
  onClose,
}: {
  symbol: string | null;
  pick: AIPick | null;
  onClose: () => void;
}) {
  const chartQ = useQuery({
    queryKey: ["daily-chart", symbol],
    queryFn: () => getDailyChart({ data: { symbol: symbol! } }),
    enabled: !!symbol,
    staleTime: 5 * 60 * 1000,
  });

  const chart = chartQ.data;
  const series = useMemo(
    () =>
      (chart?.points ?? [])
        .filter((p) => p.c != null)
        .map((p) => ({
          date: new Date(p.t * 1000).toISOString().slice(5, 10),
          close: p.c,
          volume: p.v ?? 0,
        })),
    [chart],
  );

  return (
    <Dialog open={!!symbol} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono">{symbol}</span>
            {chart?.shortName && (
              <span className="text-sm text-muted-foreground font-normal">
                {chart.shortName}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {chart?.exchange ?? ""} {chart?.currency ? `· ${chart.currency}` : ""}
          </DialogDescription>
        </DialogHeader>

        {chartQ.isLoading && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            載入日線圖中…
          </div>
        )}

        {chart && chart.error && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {chart.error}
          </div>
        )}

        {chart && !chart.error && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <StatBox label="現價" value={fmt(chart.regularMarketPrice, 4)} />
              <StatBox
                label="今日變動"
                value={
                  chart.regularMarketChangePercent == null
                    ? "—"
                    : `${chart.regularMarketChangePercent > 0 ? "+" : ""}${chart.regularMarketChangePercent.toFixed(2)}%`
                }
                tone={
                  chart.regularMarketChangePercent == null
                    ? undefined
                    : chart.regularMarketChangePercent >= 0
                    ? "success"
                    : "danger"
                }
              />
              <StatBox label="日高" value={fmt(chart.regularMarketDayHigh, 4)} />
              <StatBox label="日低" value={fmt(chart.regularMarketDayLow, 4)} />
              <StatBox label="52週高" value={fmt(chart.fiftyTwoWeekHigh, 4)} />
              <StatBox label="52週低" value={fmt(chart.fiftyTwoWeekLow, 4)} />
              <StatBox label="成交量" value={fmt(chart.regularMarketVolume, 0)} />
              <StatBox label="代號" value={chart.resolvedSymbol} />
            </div>

            {pick && (
              <div className="rounded-lg border border-border/60 p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">AI 信心指數</span>
                  <span className="text-amber-500 font-mono">{pick.confidence}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">買入價 ({pick.date})</span>
                  <span className="font-mono">{fmt(pick.buyPrice, 4)}</span>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">買入原因</div>
                  <p className="leading-relaxed">{pick.reason}</p>
                </div>
              </div>
            )}

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={20} />
                  <YAxis
                    yAxisId="price"
                    tick={{ fontSize: 11 }}
                    domain={["auto", "auto"]}
                    width={55}
                  />
                  <YAxis yAxisId="vol" orientation="right" tick={{ fontSize: 10 }} width={45} />
                  <Tooltip />
                  <Bar yAxisId="vol" dataKey="volume" fill="hsl(var(--muted-foreground))" opacity={0.3} />
                  <Line
                    yAxisId="price"
                    type="monotone"
                    dataKey="close"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>過去 6 個月日線</span>
              <a
                href={`https://finance.yahoo.com/quote/${encodeURIComponent(chart.resolvedSymbol)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Yahoo Finance <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  const color =
    tone === "success"
      ? "var(--color-success)"
      : tone === "danger"
      ? "var(--color-danger)"
      : undefined;
  return (
    <div className="rounded-lg border border-border/60 p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono font-semibold" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}