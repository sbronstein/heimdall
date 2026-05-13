/**
 * Stagehand's `localBrowserLaunchOptions.cdpUrl` expects a WebSocket URL
 * (e.g. `ws://localhost:3005/devtools/browser/<uuid>`), but the project's
 * `BROWSER_CDP_ENDPOINT` env var is set to the HTTP form
 * (e.g. `http://localhost:3005`). Resolve the HTTP form to the WS form via
 * Chrome's `/json/version` endpoint.
 */
export async function resolveWebSocketDebuggerUrl(httpEndpoint: string): Promise<string> {
  const base = httpEndpoint.replace(/\/$/, '');
  const versionUrl = `${base}/json/version`;

  let res: Response;
  try {
    res = await fetch(versionUrl);
  } catch (err) {
    throw new Error(
      `Could not reach ${versionUrl}. Is Chrome running with --remote-debugging-port? (${(err as Error).message})`
    );
  }

  if (!res.ok) {
    throw new Error(`${versionUrl} returned ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { webSocketDebuggerUrl?: string };
  if (!data.webSocketDebuggerUrl) {
    throw new Error(`No webSocketDebuggerUrl in /json/version response from ${httpEndpoint}`);
  }

  return data.webSocketDebuggerUrl;
}
