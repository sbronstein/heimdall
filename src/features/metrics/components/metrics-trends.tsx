'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';

interface MetricsTrendsProps {
  data: {
    weekStarting: string | Date;
    applicationsSubmitted: number | null;
    networkingConversations: number | null;
    interviewsCompleted: number | null;
    followUpsSent: number | null;
    activeApplications: number | null;
    energyLevel: number | null;
  }[];
}

export function MetricsTrends({ data }: MetricsTrendsProps) {
  // Reverse so oldest is on the left
  const chartData = [...data].reverse().map((d) => ({
    week: new Date(d.weekStarting).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    }),
    Applications: d.applicationsSubmitted ?? 0,
    Networking: d.networkingConversations ?? 0,
    Interviews: d.interviewsCompleted ?? 0,
    'Follow-ups': d.followUpsSent ?? 0,
    'Active Pipeline': d.activeApplications ?? 0,
    Energy: d.energyLevel ?? 0
  }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Activity Trends</CardTitle>
          <CardDescription>
            Weekly activity counts over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Applications" fill="#3B82F6" />
              <Bar dataKey="Networking" fill="#10B981" />
              <Bar dataKey="Interviews" fill="#F59E0B" />
              <Bar dataKey="Follow-ups" fill="#8B5CF6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline & Energy</CardTitle>
          <CardDescription>
            Active applications and energy level trends
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" fontSize={12} />
              <YAxis yAxisId="left" fontSize={12} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 10]} fontSize={12} />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="Active Pipeline"
                stroke="#3B82F6"
                strokeWidth={2}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="Energy"
                stroke="#EF4444"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
