import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getDualMarketData,
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

const PRESETS: { primary: string; secondary: string; label: string }[] = [
  { primary: "000660.KS", secondary: "7709", label: "南方海力士 7709 ↔ 000660.KS" },
  { primary: "AAPL", secondary: "9889", label: "Apple 9889 ↔ AAPL" },
  { primary: "TSLA", secondary: "9810", label: "Tesla 9810 ↔ TSLA" },
  { primary: "0941.HK", secondary: "0941", label: "中移動 941（自身對照）" },
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

  const data = dataQuery.data as DualMarketResult | undefined;

  const series = useMemo(() => {
    if (!data) return [];
    return buildNormalizedSeries(data.primary, data.secondary);
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return null;
    const p = data.primary;
    const s = data.secondary;
    const primaryUsd =
      p.close != null && data.primaryToUsd != null
        ? +(p.close * data.primaryToUsd).toFixed(3)
        : null;
    const secondaryUsd =
      s.close != null && data.secondaryToUsd != null
        ? +(s.close * data.secondaryToUsd).toFixed(3)
        : null;
    const premiumPct =
      primaryUsd != null && secondaryUsd != null && primaryUsd !== 0
        ? +(((secondaryUsd - primaryUsd) / primaryUsd) * 100).toFixed(2)
        : null;
    return { primaryUsd, secondaryUsd, premiumPct };
  }, [data]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setSubmitted({
      primary: primary.trim(),
      secondary: secondary.trim(),
      range,
    });
  }

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
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground self-center">
                範例：
              </span>
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPrimary(p.primary);
                    setSecondary(p.secondary);
                    setSubmitted({
                      primary: p.primary,
                      secondary: p.secondary,
                      range,
                    });
                  }}
                >
                  {p.label}
                </Button>
              ))}
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
                label={`主市場 ${data.primary.symbol}`}
                value={
                  <div>
                    <span className="font-mono">
                      {data.primary.close != null
                        ? `${data.primary.close.toFixed(2)} ${data.primary.currency ?? ""}`
                        : "—"}
                    </span>
                    <div className="text-xs text-muted-foreground font-mono mt-1">
                      {stats?.primaryUsd != null
                        ? `≈ ${stats.primaryUsd.toFixed(3)} USD`
                        : "—"}
                    </div>
                  </div>
                }
              />
              <StatCard
                label={`次市場 ${data.secondary.symbol}`}
                value={
                  <div>
                    <span className="font-mono">
                      {data.secondary.close != null
                        ? `${data.secondary.close.toFixed(3)} ${data.secondary.currency ?? "HKD"}`
                        : "—"}
                    </span>
                    <div className="text-xs text-muted-foreground font-mono mt-1">
                      {stats?.secondaryUsd != null
                        ? `≈ ${stats.secondaryUsd.toFixed(3)} USD`
                        : "—"}
                    </div>
                  </div>
                }
              />
              <StatCard
                label="港股溢價／折讓（USD 結算）"
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
