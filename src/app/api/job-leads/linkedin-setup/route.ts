import { success } from '@/lib/api/types';
import { serverError } from '@/lib/api/errors';
import { launchSetup } from '@/features/job-leads/lib/linkedin-browser';

export async function POST() {
  try {
    // Fire-and-forget: launches headed browser for user login
    launchSetup().catch((err) => {
      console.error('LinkedIn setup failed:', err);
    });

    return success({
      message:
        'LinkedIn browser launched. Log in and close the browser when done.'
    });
  } catch (err) {
    return serverError(err);
  }
}
