import { success, created, paginated, error } from '@/lib/api/types';
import { notFound, validationError, serverError } from '@/lib/api/errors';

describe('api envelope', () => {
  describe('success', () => {
    it('returns status 200 with success: true and data', async () => {
      const data = { id: '1', name: 'Test' };
      const res = success(data);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toEqual({ success: true, data });
    });

    it('passes through custom status code', async () => {
      const data = { message: 'teapot' };
      const res = success(data, 418);
      const body = await res.json();
      expect(res.status).toBe(418);
      expect(body).toEqual({ success: true, data });
    });
  });

  describe('created', () => {
    it('returns status 201 with success: true and data', async () => {
      const data = { id: '2', created: true };
      const res = created(data);
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body).toEqual({ success: true, data });
    });
  });

  describe('paginated', () => {
    it('returns status 200 with success: true, data array, and meta', async () => {
      const items = [{ id: 'a' }, { id: 'b' }];
      const meta = { hasMore: true, cursor: '2026-01-01T00:00:00Z' };
      const res = paginated(items, meta);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toEqual({ success: true, data: items, meta });
    });

    it('returns null cursor when no more results', async () => {
      const res = paginated([], { hasMore: false, cursor: null });
      const body = await res.json();
      expect(body).toEqual({ success: true, data: [], meta: { hasMore: false, cursor: null } });
    });
  });

  describe('error', () => {
    it('returns default status 400 with success: false and error message', async () => {
      const res = error('bad request');
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body).toEqual({ success: false, error: 'bad request' });
    });

    it('passes through custom status code', async () => {
      const res = error('unprocessable', 422);
      const body = await res.json();
      expect(res.status).toBe(422);
      expect(body).toEqual({ success: false, error: 'unprocessable' });
    });
  });

  describe('notFound', () => {
    it('returns status 404 with success: false and entity not found message', async () => {
      const res = notFound('Company');
      const body = await res.json();
      expect(res.status).toBe(404);
      expect(body).toEqual({ success: false, error: 'Company not found' });
    });
  });

  describe('validationError', () => {
    it('returns status 400 with success: false and the provided message', async () => {
      const res = validationError('missing field');
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body).toEqual({ success: false, error: 'missing field' });
    });
  });

  describe('serverError', () => {
    let spy: ReturnType<typeof vi.spyOn>;

    afterEach(() => {
      spy?.mockRestore();
    });

    it('returns status 500 with generic error message and calls console.error', async () => {
      spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const err = new Error('boom');
      const res = serverError(err);
      const body = await res.json();
      expect(res.status).toBe(500);
      expect(body).toEqual({ success: false, error: 'Internal server error' });
      expect(spy).toHaveBeenCalledWith('API Error:', err);
    });

    it('calls console.error exactly once', async () => {
      spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      serverError(new Error('test'));
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
