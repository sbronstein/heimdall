'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WeeklySnapshotForm } from './weekly-snapshot-form';
import { MetricsTrends } from './metrics-trends';

type MetricSnapshot = {
  id: string;
  weekStarting: Date | string;
  applicationsSubmitted: number | null;
  networkingConversations: number | null;
  interviewsCompleted: number | null;
  followUpsSent: number | null;
  newCompaniesResearched: number | null;
  newContactsAdded: number | null;
  activeApplications: number | null;
  offersReceived: number | null;
  rejections: number | null;
  energyLevel: number | null;
  weeklyReflection: string | null;
  jscNotes: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

interface MetricsPageProps {
  snapshots: MetricSnapshot[];
}

export function MetricsPage({ snapshots: initialSnapshots }: MetricsPageProps) {
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const latest = snapshots[0];

  const handleSaved = (newMetric: MetricSnapshot) => {
    setSnapshots((prev) => [newMetric, ...prev]);
  };

  return (
    <div className="space-y-6">
      {/* Current Week Summary */}
      {latest && (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Applications"
            value={latest.applicationsSubmitted}
          />
          <StatCard
            label="Networking"
            value={latest.networkingConversations}
          />
          <StatCard
            label="Interviews"
            value={latest.interviewsCompleted}
          />
          <StatCard label="Follow-ups" value={latest.followUpsSent} />
          <StatCard
            label="New Companies"
            value={latest.newCompaniesResearched}
          />
          <StatCard label="New Contacts" value={latest.newContactsAdded} />
        </div>
      )}

      {/* Trends Chart */}
      {snapshots.length > 1 && <MetricsTrends data={snapshots} />}

      {/* Record New Snapshot */}
      <WeeklySnapshotForm onSaved={handleSaved} />

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly History</CardTitle>
          <CardDescription>Past weekly metric snapshots</CardDescription>
        </CardHeader>
        <CardContent>
          {snapshots.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No metrics recorded yet. Record your first weekly snapshot above.
            </p>
          ) : (
            <div className="space-y-3">
              {snapshots.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      Week of{' '}
                      {new Date(s.weekStarting).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                    {s.weeklyReflection && (
                      <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">
                        {s.weeklyReflection}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {s.energyLevel && (
                      <Badge
                        variant={s.energyLevel >= 7 ? 'default' : s.energyLevel >= 4 ? 'secondary' : 'destructive'}
                      >
                        Energy: {s.energyLevel}/10
                      </Badge>
                    )}
                    <span className="text-muted-foreground text-xs">
                      {s.applicationsSubmitted ?? 0} apps · {s.interviewsCompleted ?? 0} interviews
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | null }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <p className="text-2xl font-bold">{value ?? 0}</p>
      </CardContent>
    </Card>
  );
}
