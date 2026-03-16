import { chromium, type BrowserContext } from 'playwright';
import { join } from 'path';
import { homedir } from 'os';

const PROFILE_DIR = join(homedir(), '.heimdall', 'linkedin-profile');

export async function launchSetup(): Promise<void> {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 }
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://www.linkedin.com/login');

  // Wait for user to log in and close the browser
  await new Promise<void>((resolve) => {
    context.on('close', () => resolve());
  });
}

export async function getContext(): Promise<BrowserContext> {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: { width: 1280, height: 800 }
  });
}
