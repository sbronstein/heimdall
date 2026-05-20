'use client';

import { useCallback, useEffect, useState } from 'react';
import { RecommendationCard } from './recommendation-card';
import { IconLoader2 } from '@tabler/icons-react';
import type { PrioritizedRecommendation } from '../lib/prioritization';

interface RecommendationListProps {
  jobLeadId: string;
}

export function RecommendationList({ jobLeadId }: RecommendationListProps) {
  const [recommendations, setRecommendations] = useState<
    PrioritizedRecommendation[] | null
  >(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `/api/job-leads/${jobLeadId}/recommendations`
        );
        if (!res.ok) return;
        const { data } = await res.json();
        setRecommendations(data.recommendations);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [jobLeadId]);

  const handleRequestIntro = useCallback(
    async (contactId: string) => {
      await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          type: 'intro_requested',
          subject: `Intro request from job lead`,
          occurredAt: new Date().toISOString()
        })
      });
    },
    []
  );

  if (loading) {
    return (
      <div className='flex items-center justify-center py-8'>
        <IconLoader2 className='text-muted-foreground h-6 w-6 animate-spin' />
      </div>
    );
  }

  if (!recommendations || recommendations.length === 0) {
    return (
      <div className='text-muted-foreground py-8 text-center text-sm'>
        No recommendations available. No mutual connections were matched to your
        contacts.
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <h3 className='text-sm font-medium'>
        Recommended Intro Paths ({recommendations.length})
      </h3>
      {recommendations.map((rec) => (
        <RecommendationCard
          key={rec.contact.id}
          contactName={`${rec.contact.firstName} ${rec.contact.lastName}`}
          closeness={rec.contact.closeness}
          lastContactDate={rec.contact.lastContactDate}
          currentRole={rec.contact.title}
          currentCompany={rec.contact.currentCompany}
          companyAtConnection={rec.contact.companyAtConnection}
          roleAtConnection={rec.contact.roleAtConnection}
          score={rec.score}
          prospects={rec.prospects.map((p) => ({
            name: p.prospect.name,
            title: p.prospect.title,
            seniorityLevel: p.prospect.seniorityLevel,
            bridgeScore: p.bridgeScore
          }))}
          onRequestIntro={() => handleRequestIntro(rec.contact.id)}
        />
      ))}
    </div>
  );
}
