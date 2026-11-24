// Additional bank features only. The original Cloudflare Worker remains unchanged.
export const portalBase = (import.meta.env.VITE_GOTHAM_PORTAL_API_URL || '').replace(/\/$/, '');
export async function portalApi(path, { token, method = 'GET', data, signal } = {}) {
  if (!portalBase) throw new Error('Additional banking services are not configured. Set VITE_GOTHAM_PORTAL_API_URL when the companion API is deployed.');
  const headers = { 'Accept': 'application/json' };
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const timeout = AbortSignal.timeout(15_000);
  let response;
  try {
    response = await fetch(`${portalBase}/api/portal${path}`, {
      method, headers, credentials: 'omit', redirect: 'error',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      ...(data !== undefined && { body: JSON.stringify(data) }),
    });
  } catch(e) { throw new Error(timeout.aborted ? 'Additional API timed out.' : 'Additional banking API unavailable. Please try again later.'); }
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(value?.error?.message || `Additional API returned ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return value;
}
