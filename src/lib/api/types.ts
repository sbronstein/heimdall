export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total?: number;
    cursor?: string | null;
    hasMore?: boolean;
  };
};

export function success<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data } satisfies ApiResponse<T>, {
    status
  });
}

export function created<T>(data: T): Response {
  return success(data, 201);
}

export function paginated<T>(
  data: T[],
  meta: { total?: number; cursor?: string | null; hasMore: boolean }
): Response {
  return Response.json({
    success: true,
    data,
    meta
  } satisfies ApiResponse<T[]>);
}

export function error(message: string, status = 400): Response {
  return Response.json(
    { success: false, error: message } satisfies ApiResponse<never>,
    { status }
  );
}
