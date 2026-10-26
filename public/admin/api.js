// The desk talks to /api/admin/ only. A signed-out or demoted session gets the same answer as a
// stranger (401 or 404), which the desk turns into one "sign in again" screen.

export class SignedOut extends Error {}

// The key in the desk's own address; the server answers the desk's API only with it.
const key = /^\/desk-([a-f0-9]{24})\/?$/.exec(location.pathname)?.[1] || '';

async function call(path, init) {
  let response;
  try { response = await fetch(`/api/admin/${path}`, { credentials: 'same-origin', ...init, headers: { Accept: 'application/json', 'X-Desk-Key': key, ...(init?.headers || {}) } }); }
  catch { throw new Error('The server did not answer. Check the connection and try again.'); }
  if (response.status === 401 || response.status === 404) throw new SignedOut();
  let data = null;
  try { data = await response.json(); } catch { /* an empty or broken answer */ }
  if (!response.ok) throw new Error(data?.error || `The server answered ${response.status}.`);
  return data;
}

export const get = path => call(path);
export const post = (path, body) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
