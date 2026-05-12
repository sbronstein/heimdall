type RouteHandler = (
  request: Request,
  ctx?: { params: Promise<Record<string, string>> }
) => Promise<Response>;

type CallRouteOptions = {
  method?: string;
  url?: string;
  body?: unknown;
  formData?: FormData;
  params?: Record<string, string>;
  searchParams?: Record<string, string>;
  headers?: Record<string, string>;
};

export async function callRoute<T = unknown>(
  handler: RouteHandler,
  opts: CallRouteOptions = {}
): Promise<{ status: number; body: T; response: Response }> {
  let urlString = opts.url ?? 'http://localhost/test';

  if (opts.searchParams) {
    const qs = new URLSearchParams(opts.searchParams);
    urlString = `${urlString}?${qs.toString()}`;
  }

  let init: RequestInit = {
    method: opts.method ?? 'GET'
  };

  if (opts.formData) {
    init = { ...init, body: opts.formData };
  } else if (opts.body !== undefined) {
    init = {
      ...init,
      body: JSON.stringify(opts.body),
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers ?? {})
      }
    };
  } else if (opts.headers) {
    init = { ...init, headers: opts.headers };
  }

  const request = new Request(urlString, init);

  const response = opts.params !== undefined
    ? await handler(request, { params: Promise.resolve(opts.params) })
    : await handler(request);

  let body: T;
  try {
    body = (await response.clone().json()) as T;
  } catch {
    body = (await response.text()) as T;
  }

  return { status: response.status, body, response };
}
