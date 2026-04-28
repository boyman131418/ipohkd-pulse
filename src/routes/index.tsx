import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown, Search, Calendar, Clock, LineChart as LineIcon, Activity } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getIPOData,
  getFirstDayChart,
  getFirstDayRanges,
  type ListedIPO,
  type FirstDayChart,
} from "@/lib/ipo.functions";

const ipoQuery = queryOptions({
  queryKey: ["ipo-data"],
  queryFn: () => getIPOData(),
  staleTime: 5 * 60 * 1000,
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(ipoQuery),
  component: IPOPage,
});

function fmt(n: number | null, digits = 2) {
  return n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function PctCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono font-semibold ${
        positive ? "text-[color:var(--color-success)]" : "text-[color:var(--color-danger)]"
      }`}
    >
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

type SortKey = "listingDate" | "firstDay" | "cumulative" | "minSub" | "code";

function IPOPage() {
  const { data } = useSuspenseQuery(ipoQuery);
  const listed = data.listed;
  const upcoming = data.upcoming;

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("listingDate");
  const [filter, setFilter] = useState<"all" | "winner" | "loser">("all");
  const [lookupCode, setLookupCode] = useState("");
  const [lookupSubmitted, setLookupSubmitted] = useState<string | null>(null);

  // 預設為最近期有完整首日數據嘅股票
  const defaultLookupCode = useMemo(() => {
    const found = listed.find(
      (r) =>
        r.firstDayChangePct != null &&
        r.issuePrice != null &&
        r.currentPrice != null,
    );
    return found?.code.padStart(5, "0") ?? null;
  }, [listed]);

  useEffect(() => {
    if (!lookupSubmitted && defaultLookupCode) {
      setLookupSubmitted(defaultLookupCode);
      setLookupCode(defaultLookupCode);
    }
  }, [defaultLookupCode, lookupSubmitted]);

  const filteredListed = useMemo(() => {
    let rows = [...listed];
    const q = query.trim().toLowerCase();
    if (q)
      rows = rows.filter(
        (r) => r.name.toLowerCase().includes(q) || r.code.includes(q),
      );
    if (filter === "winner") rows = rows.filter((r) => (r.firstDayChangePct ?? 0) > 0);
    if (filter === "loser") rows = rows.filter((r) => (r.firstDayChangePct ?? 0) < 0);
    rows.sort((a, b) => {
      const get = (x: ListedIPO) => {
        switch (sortBy) {
          case "firstDay":
            return x.firstDayChangePct ?? -Infinity;
          case "cumulative":
            return x.cumulativeChangePct ?? -Infinity;
          case "minSub":
            return x.minSubscriptionAmount ?? -Infinity;
          case "code":
            return -parseInt(x.code, 10);
          case "listingDate":
          default:
            return new Date(x.listingDate.replace(/\//g, "-")).getTime();
        }
      };
      return get(b) - get(a);
    });
    return rows;
  }, [listed, query, sortBy, filter]);

  const stats = useMemo(() => {
    const withPct = listed.filter((r) => r.firstDayChangePct != null);
    const winners = withPct.filter((r) => (r.firstDayChangePct ?? 0) > 0).length;
    const losers = withPct.filter((r) => (r.firstDayChangePct ?? 0) < 0).length;
    const flat = withPct.filter((r) => (r.firstDayChangePct ?? 0) === 0).length;
    const noData = listed.length - withPct.length;
    const avg =
      withPct.reduce((s, r) => s + (r.firstDayChangePct ?? 0), 0) / (withPct.length || 1);
    return { total: listed.length, winners, losers, flat, noData, avg };
  }, [listed]);

  // Lazy fetch first-day volatility for the codes shown in table
  const visibleCodes = filteredListed.slice(0, 30).map((r) => r.code);
  const visibleKey = visibleCodes.join(",");
  const rangesQuery = useQuery({
    queryKey: ["first-day-ranges", visibleKey],
    queryFn: () => getFirstDayRanges({ data: { codes: visibleCodes } }),
    enabled: visibleCodes.length > 0,
    staleTime: 30 * 60 * 1000,
  });
  const ranges = rangesQuery.data?.ranges ?? {};

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 backdrop-blur-sm sticky top-0 z-10 bg-background/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
          </div>
          <div className="text-xs text-muted-foreground hidden sm:block">
            <Clock className="inline h-3 w-3 mr-1" />
            更新: {new Date(data.fetchedAt).toLocaleString("zh-HK")}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-border/60 p-8 sm:p-12">
          <div
            className="absolute inset-0 opacity-20"
            style={{ background: "var(--gradient-hero)" }}
          />
          <div className="relative">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight max-w-2xl">
              追蹤香港 IPO，
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--gradient-hero)" }}
              >
                由招股到上市。
              </span>
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl">
              即時更新發行價、首日升跌、現價同入場費。打和統計、排序、篩選一應俱全。
            </p>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <StatCard label="過往新股" value={stats.total.toString()} />
          <StatCard
            label="首日上升"
            value={stats.winners.toString()}
            tone="success"
          />
          <StatCard
            label="首日下跌"
            value={stats.losers.toString()}
            tone="danger"
          />
          <StatCard
            label={stats.noData > 0 ? `打和 / 無數據` : `打和`}
            value={
              stats.noData > 0
                ? `${stats.flat} / ${stats.noData}`
                : stats.flat.toString()
            }
          />
          <StatCard
            label="平均首日升跌"
            value={`${stats.avg >= 0 ? "+" : ""}${stats.avg.toFixed(2)}%`}
            tone={stats.avg >= 0 ? "success" : "danger"}
          />
        </section>

        {/* Stock Lookup — first day 1-hour chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineIcon className="h-4 w-4" style={{ color: "var(--primary)" }} />
              首日 1 小時走勢查詢
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex gap-2 mb-4"
              onSubmit={(e) => {
                e.preventDefault();
                const c = lookupCode.trim().replace(/\D/g, "");
                if (c) setLookupSubmitted(c.padStart(5, "0"));
              }}
            >
              <Input
                placeholder="輸入股票編號 (例如 1879)"
                value={lookupCode}
                onChange={(e) => setLookupCode(e.target.value)}
                className="max-w-xs"
                inputMode="numeric"
              />
              <Button type="submit">查詢</Button>
            </form>
            {lookupSubmitted ? (
              <FirstDayChartCard
                code={lookupSubmitted}
                fallbackCodes={listed
                  .filter((r) => r.firstDayChangePct != null)
                  .slice(0, 10)
                  .map((r) => r.code.padStart(5, "0"))}
              />
            ) : (
              <p className="text-sm text-muted-foreground py-12 text-center">
                載入最近期完整數據中…
              </p>
            )}
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="listed" className="w-full">
          <TabsList>
            <TabsTrigger value="listed">已上市 ({listed.length})</TabsTrigger>
            <TabsTrigger value="upcoming">
              即將上市 ({upcoming.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="listed" className="mt-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜尋編號或名稱..."
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
                  <SelectItem value="listingDate">最近上市</SelectItem>
                  <SelectItem value="firstDay">首日升幅</SelectItem>
                  <SelectItem value="cumulative">累積升幅</SelectItem>
                  <SelectItem value="minSub">入場費</SelectItem>
                  <SelectItem value="code">編號</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                <SelectTrigger className="sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="winner">首日上升</SelectItem>
                  <SelectItem value="loser">首日下跌</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>編號</TableHead>
                      <TableHead>名稱</TableHead>
                      <TableHead>上市日期</TableHead>
                      <TableHead className="text-right">發行價</TableHead>
                      <TableHead className="text-right">現價</TableHead>
                      <TableHead className="text-right">首日升跌</TableHead>
                      <TableHead className="text-right">首日波幅</TableHead>
                      <TableHead className="text-right">累積升跌</TableHead>
                      <TableHead className="text-right">每手</TableHead>
                      <TableHead className="text-right">孖展超購</TableHead>
                      <TableHead className="text-right">穩抽手數</TableHead>
                      <TableHead className="text-right">入場費 (HKD)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredListed.map((r) => (
                      <TableRow key={r.code}>
                        <TableCell className="font-mono font-semibold">
                          {r.code}
                        </TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {r.listingDate}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(r.issuePrice, 3)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(r.currentPrice, 3)}
                        </TableCell>
                        <TableCell className="text-right">
                          <PctCell value={r.firstDayChangePct} />
                        </TableCell>
                        <TableCell className="text-right">
                          <RangeCell value={ranges[r.code.padStart(5, "0")]} loading={rangesQuery.isLoading} />
                        </TableCell>
                        <TableCell className="text-right">
                          <PctCell value={r.cumulativeChangePct} />
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmt(r.lotSize, 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {r.marginOversubscription != null
                            ? `${r.marginOversubscription.toFixed(2)}x`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {r.guaranteedLots != null ? `${r.guaranteedLots} 手` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {r.minSubscriptionAmount
                            ? `$${r.minSubscriptionAmount.toLocaleString()}`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredListed.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                          冇符合條件嘅 IPO
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="upcoming" className="mt-4">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>編號</TableHead>
                      <TableHead>名稱</TableHead>
                      <TableHead>行業</TableHead>
                      <TableHead>招股價</TableHead>
                      <TableHead className="text-right">每手</TableHead>
                      <TableHead className="text-right">入場費 (HKD)</TableHead>
                      <TableHead>市場孖展熱度</TableHead>
                      <TableHead className="text-right">預計穩抽 (參考)</TableHead>
                      <TableHead>截止日</TableHead>
                      <TableHead>上市日</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcoming.map((r) => (
                      <TableRow key={r.code}>
                        <TableCell className="font-mono font-semibold">{r.code}</TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>
                          {r.industry && (
                            <Badge variant="secondary" className="font-normal">
                              {r.industry}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono">{r.issuePrice ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.lotSize, 0)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {r.entryFee ? `$${r.entryFee.toLocaleString()}` : "—"}
                        </TableCell>
                        <TableCell>
                          {r.marginStatus ? (
                            <Badge
                              variant="outline"
                              className="font-normal"
                              style={{
                                borderColor:
                                  r.marginStatus.includes("高")
                                    ? "var(--color-success)"
                                    : r.marginStatus.includes("冷")
                                      ? "var(--color-danger)"
                                      : "var(--border)",
                                color: r.marginStatus.includes("高")
                                  ? "var(--color-success)"
                                  : r.marginStatus.includes("冷")
                                    ? "var(--color-danger)"
                                    : "var(--foreground)",
                              }}
                            >
                              {r.marginStatus}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">待公布</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {r.estimatedGuaranteedLots != null
                            ? `~${r.estimatedGuaranteedLots} 手`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {r.subscriptionDeadline}
                        </TableCell>
                        <TableCell className="text-sm">
                          <Calendar className="inline h-3 w-3 mr-1 text-muted-foreground" />
                          {r.listingDate}
                        </TableCell>
                      </TableRow>
                    ))}
                    {upcoming.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                          暫時冇即將上市嘅 IPO
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        <footer className="text-center text-xs text-muted-foreground py-8">
          © IPOHKD · 數據僅供參考，投資涉及風險
        </footer>
      </main>
    </div>
  );
}

function StatCard({
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
        : "var(--foreground)";
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1" style={{ color }}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function RangeCell({ value, loading }: { value: number | null | undefined; loading: boolean }) {
  if (loading && value == null)
    return <span className="text-muted-foreground text-xs">…</span>;
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1 font-mono text-sm" style={{ color: "var(--primary)" }}>
      <Activity className="h-3 w-3" />
      {value.toFixed(2)}%
    </span>
  );
}

function FirstDayChartCard({
  code,
  fallbackCodes = [],
}: {
  code: string;
  fallbackCodes?: string[];
}) {
  const [activeCode, setActiveCode] = useState(code);
  const [triedFallbacks, setTriedFallbacks] = useState<string[]>([]);
  useEffect(() => {
    setActiveCode(code);
    setTriedFallbacks([]);
  }, [code]);
  const q = useQuery({
    queryKey: ["first-day-chart", activeCode],
    queryFn: () => getFirstDayChart({ data: { code: activeCode } }),
    staleTime: 30 * 60 * 1000,
  });
  // auto-fallback: if current returns no data, try the next fallback code
  useEffect(() => {
    if (q.isLoading || q.isFetching) return;
    const d = q.data;
    const empty = !d || d.error || d.points.length === 0;
    if (!empty) return;
    const next = fallbackCodes.find(
      (c) => c !== activeCode && !triedFallbacks.includes(c),
    );
    if (next) {
      setTriedFallbacks((prev) => [...prev, activeCode]);
      setActiveCode(next);
    }
  }, [q.data, q.isLoading, q.isFetching, activeCode, fallbackCodes, triedFallbacks]);
  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground py-12 text-center">載入中…</p>;
  }
  const d = q.data;
  if (!d || d.error || d.points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        {q.isFetching ? "正在嘗試其他股票…" : "冇數據（可能該股票未上市或編號不正確）"}
        {d?.error ? <span className="block text-xs mt-2">{d.error}</span> : null}
      </p>
    );
  }
  const isFallback = activeCode !== code;
  return (
    <div className="space-y-2">
      {isFallback && (
        <p className="text-xs text-muted-foreground">
          自動顯示最近有完整數據嘅股票：<span className="font-mono font-semibold text-foreground">{activeCode}</span>
        </p>
      )}
      <FirstDayChartBody d={d} />
    </div>
  );
}

function FirstDayChartBody({ d }: { d: NonNullable<ReturnType<typeof getFirstDayChart>> extends Promise<infer R> ? R : never }) {
  const chartData = d.points.map((p) => ({
    time: new Date(p.t * 1000).toLocaleTimeString("zh-HK", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Hong_Kong",
    }),
    price: p.price,
  }));
  const stats = [
    { label: "上市日", value: d.listingDate ?? "—" },
    { label: "開盤", value: d.open != null ? d.open.toFixed(3) : "—" },
    { label: "最高", value: d.high != null ? d.high.toFixed(3) : "—" },
    { label: "最低", value: d.low != null ? d.low.toFixed(3) : "—" },
    {
      label: "首日波幅",
      value: d.rangePct != null ? `${d.rangePct.toFixed(2)}%` : "—",
      highlight: true,
    },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border/60 p-2">
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p
              className="font-mono font-semibold"
              style={s.highlight ? { color: "var(--primary)" } : undefined}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>
      <div className="h-64 rounded-xl border border-border/60 p-2 bg-card">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            />
            <YAxis
              domain={["dataMin", "dataMax"]}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickFormatter={(v) => v.toFixed(2)}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--card-foreground)",
              }}
              formatter={(v: number) => [v.toFixed(3), "價格"]}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
