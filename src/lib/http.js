// Wraps async route handlers so rejected promises reach the error middleware.
export const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
export const optStr = (v, max = 500) => (str(v, max) || null);

export function url(v) {
  const s = str(v, 500);
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) throw new HttpError(400, `Links must start with https:// (${s})`);
  return s;
}

export const id = v => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Invalid id');
  return n;
};
