import { config } from 'dotenv';
config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { pipelineStages } from './schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const stages = [
  {
    name: 'researching',
    displayName: 'Researching',
    displayOrder: 1,
    color: '#6B7280',
    isTerminal: false
  },
  {
    name: 'applied',
    displayName: 'Applied',
    displayOrder: 2,
    color: '#3B82F6',
    isTerminal: false
  },
  {
    name: 'recruiter_screen',
    displayName: 'Recruiter Screen',
    displayOrder: 3,
    color: '#8B5CF6',
    isTerminal: false
  },
  {
    name: 'phone_interview',
    displayName: 'Phone Interview',
    displayOrder: 4,
    color: '#EC4899',
    isTerminal: false
  },
  {
    name: 'onsite',
    displayName: 'Onsite',
    displayOrder: 5,
    color: '#F59E0B',
    isTerminal: false
  },
  {
    name: 'final_round',
    displayName: 'Final Round',
    displayOrder: 6,
    color: '#F97316',
    isTerminal: false
  },
  {
    name: 'offer',
    displayName: 'Offer',
    displayOrder: 7,
    color: '#10B981',
    isTerminal: false
  },
  {
    name: 'negotiating',
    displayName: 'Negotiating',
    displayOrder: 8,
    color: '#14B8A6',
    isTerminal: false
  },
  {
    name: 'accepted',
    displayName: 'Accepted',
    displayOrder: 9,
    color: '#22C55E',
    isTerminal: true
  },
  {
    name: 'rejected',
    displayName: 'Rejected',
    displayOrder: 10,
    color: '#EF4444',
    isTerminal: true
  },
  {
    name: 'withdrawn',
    displayName: 'Withdrawn',
    displayOrder: 11,
    color: '#9CA3AF',
    isTerminal: true
  },
  {
    name: 'ghosted',
    displayName: 'Ghosted',
    displayOrder: 12,
    color: '#D1D5DB',
    isTerminal: true
  },
  {
    name: 'on_hold',
    displayName: 'On Hold',
    displayOrder: 13,
    color: '#FBBF24',
    isTerminal: false
  }
];

async function seed() {
  console.log('Seeding pipeline stages...');

  for (const stage of stages) {
    await db
      .insert(pipelineStages)
      .values(stage)
      .onConflictDoNothing({ target: pipelineStages.name });
  }

  console.log(`Seeded ${stages.length} pipeline stages (ON CONFLICT DO NOTHING)`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
