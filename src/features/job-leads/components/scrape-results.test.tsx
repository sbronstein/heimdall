import React from 'react';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { describe, it, beforeAll, vi, expect } from 'vitest';

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardTitle: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <h3 className={className}>{children}</h3>
  ),
  CardContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: { children?: React.ReactNode; variant?: string }) => (
    <span data-variant={variant}>{children}</span>
  )
}));

vi.mock('@tabler/icons-react', () => ({
  IconMapPin: () => <span />,
  IconExternalLink: () => <span />
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

const nullNameLead: JobLead = {
  ...companyLead,
  id: 'aaaaaaaa-0000-0000-0000-000000000003',
  companyName: null,
  roleTitle: null,
}

import { ScrapeResults } from '@/features/job-leads/components/scrape-results';

describe('ScrapeResults — company-scope lead (JL-C8)', () => {
  let html: string;
  let dom: JSDOM;

  beforeAll(() => {
    html = renderToString(React.createElement(ScrapeResults, { lead: companyLead }));
    dom = new JSDOM(html, { url: 'http://localhost/' });
  });

  it('renders company name in the title slot', () => {
    expect(html).toContain('OpenAI');
  });

  it('renders "Company scrape" badge', () => {
    expect(html).toContain('Company scrape');
  });

  it('does not render "View Job Posting" link', () => {
    const { document } = dom.window;
    expect(document.querySelector('a')).toBeNull();
  });

  it('does not render "Unknown Role"', () => {
    expect(html).not.toContain('Unknown Role');
  });
});

describe('ScrapeResults — null companyName company-scope lead (JL-C8 fallback)', () => {
  let html: string;
  let dom: JSDOM;

  beforeAll(() => {
    html = renderToString(React.createElement(ScrapeResults, { lead: nullNameLead }));
    dom = new JSDOM(html, { url: 'http://localhost/' });
  });

  it('renders "Company scrape" as the CardTitle text', () => {
    expect(html).toContain('Company scrape');
  });

  it('does not render "Unknown Role"', () => {
    expect(html).not.toContain('Unknown Role');
  });

  it('does not render "View Job Posting" link', () => {
    const { document } = dom.window;
    expect(document.querySelector('a')).toBeNull();
  });
});

describe('ScrapeResults — job-URL lead (JL-C8 unchanged path)', () => {
  let html: string;
  let dom: JSDOM;

  beforeAll(() => {
    html = renderToString(React.createElement(ScrapeResults, { lead: jobLead }));
    dom = new JSDOM(html, { url: 'http://localhost/' });
  });

  it('renders role title (HTML-escaped)', () => {
    expect(html).toContain('VP Data &amp; AI');
  });

  it('renders company name as subtitle', () => {
    expect(html).toContain('Acme Corp');
  });

  it('renders "View Job Posting" link', () => {
    const { document } = dom.window;
    expect(document.querySelector('a')).not.toBeNull();
  });
});
