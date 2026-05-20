import React from 'react';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { describe, it, beforeAll, vi, expect } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: React.ReactNode }) =>
    React.createElement('a', { href }, children)
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardContent: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  )
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: { children?: React.ReactNode; variant?: string; className?: string }) => (
    <span data-variant={variant} className={className}>{children}</span>
  )
}));

vi.mock('@tabler/icons-react', () => ({
  IconBuilding: () => <span data-icon='building' />,
  IconBuildingCommunity: () => <span data-icon='building-community' />,
  IconUsers: () => <span />
}));

import type { JobLead } from '@/lib/domain/types';

const companyLead: JobLead = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  companyId: 'cccccccc-0000-0000-0000-000000000001',
  companyName: 'OpenAI',
  linkedinJobUrl: null,
  roleTitle: 'Company-wide scrape',
  applicationId: null,
  status: 'queued',
  prospectCount: 0,
  scrapedData: null,
  lastError: null,
  lastErrorAt: null,
  createdAt: new Date('2026-05-19T00:00:00Z'),
  updatedAt: new Date('2026-05-19T00:00:00Z'),
  archivedAt: null,
}

const jobLead: JobLead = {
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  companyId: 'cccccccc-0000-0000-0000-000000000002',
  companyName: 'Acme Corp',
  linkedinJobUrl: 'https://www.linkedin.com/jobs/view/123456',
  roleTitle: 'VP Data & AI',
  applicationId: null,
  status: 'queued',
  prospectCount: 0,
  scrapedData: null,
  lastError: null,
  lastErrorAt: null,
  createdAt: new Date('2026-05-18T00:00:00Z'),
  updatedAt: new Date('2026-05-18T00:00:00Z'),
  archivedAt: null,
}

import { JobLeadCard } from '@/features/job-leads/components/job-lead-card';

describe('JobLeadCard — company-scope vs job-URL (JL-C9)', () => {
  let companyHtml: string;
  let jobHtml: string;
  let companyDom: JSDOM;
  let jobDom: JSDOM;

  beforeAll(() => {
    companyHtml = renderToString(React.createElement(JobLeadCard, { lead: companyLead }));
    jobHtml = renderToString(React.createElement(JobLeadCard, { lead: jobLead }));
    companyDom = new JSDOM(companyHtml, { url: 'http://localhost/' });
    jobDom = new JSDOM(jobHtml, { url: 'http://localhost/' });
  });

  it('company-scope lead renders IconBuildingCommunity icon', () => {
    const { document } = companyDom.window;
    expect(document.querySelector('[data-icon="building-community"]')).not.toBeNull();
    expect(document.querySelector('[data-icon="building"]')).toBeNull();
  });

  it('job-URL lead renders IconBuilding icon', () => {
    const { document } = jobDom.window;
    expect(document.querySelector('[data-icon="building"]')).not.toBeNull();
    expect(document.querySelector('[data-icon="building-community"]')).toBeNull();
  });

  it('company-scope lead renders "Company" pill', () => {
    const { document } = companyDom.window;
    const badges = document.querySelectorAll('[data-variant="outline"]');
    const texts = Array.from(badges).map((b) => b.textContent?.trim());
    expect(texts).toContain('Company');
  });

  it('job-URL lead does not render "Company" pill', () => {
    const { document } = jobDom.window;
    const badges = document.querySelectorAll('[data-variant="outline"]');
    const texts = Array.from(badges).map((b) => b.textContent?.trim());
    expect(texts).not.toContain('Company');
  });

  it('company-scope lead does not render the sentinel role subtitle', () => {
    expect(companyHtml).not.toContain('Company-wide scrape');
  });

  it('job-URL lead renders role subtitle (HTML-escaped)', () => {
    expect(jobHtml).toContain('VP Data &amp; AI');
  });
});
