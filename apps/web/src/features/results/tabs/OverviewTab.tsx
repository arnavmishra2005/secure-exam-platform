// Owner: Person A — headline numbers plus the score distribution.

import { getExamResultsOverview } from '@secure-exam/api-client';
import type { HistogramBucket } from '@secure-exam/types';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { getErrorMessage } from '@/lib/errors';
import { formatDuration, formatPercent, formatScore } from '@/lib/format';
import type { ResultsTabProps } from '../tabs.registry';

export function OverviewTab({ examId }: ResultsTabProps) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['results', examId, 'overview'],
    queryFn: () => getExamResultsOverview(examId),
    refetchInterval: 30_000,
  });

  if (error) return <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />;
  if (isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const outOf = (v: number | null) => (v === null ? '—' : `${formatScore(v)} / ${formatScore(data.maxScore)}`);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Submitted" value={`${data.submittedCount} / ${data.registeredCount}`} hint={`${data.inProgressCount} in progress`} />
        <StatCard label="Absent" value={data.absentCount} hint="Registered, never started" />
        <StatCard label="Pass rate" value={formatPercent(data.passRate)} hint={`${data.passedCount} passed · mark ${data.passPercentage}%`} />
        <StatCard label="Average time" value={formatDuration(data.averageTimeSeconds)} />
        <StatCard label="Mean score" value={outOf(data.mean)} hint={data.standardDeviation !== null ? `σ ${formatScore(data.standardDeviation)}` : undefined} />
        <StatCard label="Median score" value={outOf(data.median)} />
        <StatCard label="Highest" value={outOf(data.max)} />
        <StatCard label="Lowest" value={outOf(data.min)} />
      </div>

      {data.needsManualReviewCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {data.needsManualReviewCount} attempt(s) include questions that need manual grading; their scores may change.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Score distribution</CardTitle>
          <CardDescription>Number of students per 10-point band of percentage score. The dashed line is the pass mark.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.submittedCount === 0 ? (
            <EmptyState icon={BarChart3} title="No submissions yet" description="The chart fills in as students submit." />
          ) : (
            <ScoreHistogram buckets={data.histogram} passPercentage={data.passPercentage} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScoreHistogram({ buckets, passPercentage }: { buckets: HistogramBucket[]; passPercentage: number }) {
  const rows = buckets.map((b) => ({ ...b, label: `${b.from}–${b.to}` }));
  // The pass mark falls inside one band; place the line at that band's position.
  const passBand = rows[Math.min(Math.floor(passPercentage / 10), 9)]?.label;

  return (
    <div className="h-72 w-full" role="img" aria-label={`Histogram: ${rows.map((r) => `${r.label}%: ${r.count}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 16, right: 8, bottom: 4, left: -16 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="0" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            unit="%"
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.6 }}
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 6,
              fontSize: 12,
              color: 'hsl(var(--foreground))',
            }}
            labelFormatter={(label) => `${label}%`}
            formatter={(value: number) => [value, 'Students']}
          />
          {passBand && (
            <ReferenceLine
              x={passBand}
              stroke="hsl(var(--foreground))"
              strokeDasharray="4 4"
              label={{ value: `Pass ${passPercentage}%`, position: 'top', fill: 'hsl(var(--foreground))', fontSize: 11 }}
            />
          )}
          <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
