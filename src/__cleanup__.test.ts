import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Phase 4 deletion targets. Asserts the post-cleanup tree state per
// .planning/phases/04-starter-template-cleanup/04-CONTEXT.md D-16.
// Each path must NOT exist on disk after Phase 4 (Starter-Template Cleanup) lands.
const deletedPaths = [
  'src/features/products',
  'src/app/dashboard/product',
  'src/constants/mock-api.ts',
  'src/app/dashboard/exclusive',
  'src/app/dashboard/workspaces',
  'src/app/dashboard/billing',
  'src/components/ui/infobar.tsx',
  'src/components/ui/info-button.tsx',
  'src/components/layout/info-sidebar.tsx',
  'src/config/infoconfig.ts',
  'src/app/dashboard/kanban',
  'src/features/kanban',
  '__CLEANUP__'
];

describe('Phase 4 starter-template cleanup', () => {
  it.each(deletedPaths)('removes %s', (relPath) => {
    expect(existsSync(resolve(process.cwd(), relPath))).toBe(false);
  });

  it('removes unused computeBridgeScore import from job-leads search route', () => {
    const file = resolve(
      process.cwd(),
      'src/app/api/job-leads/[id]/search/route.ts'
    );
    const content = readFileSync(file, 'utf-8');
    expect(content).not.toMatch(/computeBridgeScore/);
  });
});
