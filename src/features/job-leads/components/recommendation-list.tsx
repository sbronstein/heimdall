'use client';

import { useCallback, useEffect, useState } from 'react';
import { RecommendationCard } from './recommendation-card';
import { IconLoader2 } from '@tabler/icons-react';
import { toast } from 'sonner';
import type { PrioritizedRecommendation } from '../lib/prioritization';

interface RecommendationListProps {
  jobLeadId: string;
}

export function RecommendationList({ jobLeadId }: RecommendationListProps) {
  const [recommendations, setRecommendations] = useState<
    PrioritizedRecommendation[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [overridingIds, setOverridingIds] = useState<Set<string>>(new Set());

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

  const handleOverride = useCallback(async (contactId: string) => {
    setOverridingIds((prev) => new Set(prev).add(contactId));
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doNotUseForIntros: true })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setRecommendations((prev) =>
          prev?.filter((r) => r.contact.id !== contactId) ?? null
        );
        toast.success('Contact excluded from intro recommendations');
      } else {
        toast.error(json.error || 'Failed to override contact');
      }
    } catch {
      toast.error('Failed to override contact');
    } finally {
      setOverridingIds((prev) => {
        const next = new Set(prev);
        next.delete(contactId);
        return next;
      });
    }
  }, []);

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
          contactId={rec.contact.id}
          contactName={`${rec.contact.firstName} ${rec.contact.lastName}`}
          closeness={rec.contact.closeness}
          lastContactDate={rec.contact.lastContactDate}
          currentRole={rec.contact.title}
          currentCompany={rec.contact.currentCompany}
          companyAtConnection={rec.contact.companyAtConnection}
          roleAtConnection={rec.contact.roleAtConnection}
          contactLinkedinUrl={rec.contact.linkedinUrl}
          score={rec.score}
          prospects={rec.prospects.map((p) => ({
            name: p.prospect.name,
            title: p.prospect.title,
            seniorityLevel: p.prospect.seniorityLevel,
            bridgeScore: p.bridgeScore,
            linkedinUrl: p.prospect.linkedinUrl
          }))}
          onRequestIntro={() => handleRequestIntro(rec.contact.id)}
          onOverride={() => handleOverride(rec.contact.id)}
          overriding={overridingIds.has(rec.contact.id)}
        />
      ))}
    </div>
  );
}
