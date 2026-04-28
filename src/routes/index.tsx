import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useMemo, useState, Suspense } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { TrendingUp, TrendingDown, Search, Flame, Calendar, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
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
import { getIPOData, type ListedIPO } from "@/lib/ipo.server";

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
    const avg =
      withPct.reduce((s, r) => s + (r.firstDayChangePct ?? 0), 0) / (withPct.length || 1);
    return { total: listed.length, winners, losers, avg };
  }, [listed]);

  const chartData = useMemo(() => {
    return [...listed]
      .filter((r) => r.firstDayChangePct != null)
      .sort((a, b) => (b.firstDayChangePct ?? 0) - (a.firstDayChangePct ?? 0))
      .slice(0, 12)
      .map((r) => ({
        name: r.name.length > 6 ? r.name.slice(0, 6) + "…" : r.name,
        change: r.firstDayChangePct,
      }));
  }, [listed]);

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
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
            label="平均首日升跌"
            value={`${stats.avg >= 0 ? "+" : ""}${stats.avg.toFixed(2)}%`}
            tone={stats.avg >= 0 ? "success" : "danger"}
          />
        </section>

        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-4 w-4" style={{ color: "var(--primary)" }} />
              首日表現排行 (Top 12)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--card-foreground)",
                  }}
                  formatter={(v: number) => [`${v.toFixed(2)}%`, "首日"]}
                />
                <Bar dataKey="change" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        (d.change ?? 0) >= 0
                          ? "var(--color-success)"
                          : "var(--color-danger)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
                      <TableHead className="text-right">累積升跌</TableHead>
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
                          <PctCell value={r.cumulativeChangePct} />
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
                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
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
                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
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
