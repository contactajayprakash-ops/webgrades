// ============================================================
// Thin client for the HAC scraping API.
//
// Endpoints (all POST, JSON body):
//   /login       { username, password } -> { success, userName }
//   /data        { username, password, type, quarter?, date? } -> { success, userName, data }
//   /ipr-dates   { username, password } -> { success, availableDates }
//
// type ∈ class | schedule | rank | transcript | week | attendance | ipr
// ============================================================

const ENV_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const LS_KEY = 'wg_api_url';

export function getApiUrl() {
  return (localStorage.getItem(LS_KEY) || ENV_URL).replace(/\/+$/, '');
}

export function setApiUrl(url) {
  if (url && url.trim()) localStorage.setItem(LS_KEY, url.trim());
  else localStorage.removeItem(LS_KEY);
}

// The API logs into HAC fresh on every request. Hitting it concurrently makes
// HAC reject the simultaneous logins ("Login failed"), so we funnel every call
// through a single serial queue — one request to HAC at a time, app-wide.
let queueTail = Promise.resolve();
function serialize(task) {
  const result = queueTail.then(task, task);
  queueTail = result.then(() => {}, () => {});
  return result;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rawPost(path, body) {
  let res;
  try {
    res = await fetch(getApiUrl() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('Could not reach the API. Is the server awake and the URL correct?');
  }
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`Bad response from API (HTTP ${res.status}).`);
  }
}

// `retries` retries a transient login failure (used for data calls where the
// credentials were already validated at sign-in). Login itself never retries.
function post(path, body, retries = 0) {
  return serialize(async () => {
    let last;
    for (let attempt = 0; attempt <= retries; attempt++) {
      last = await rawPost(path, body);
      const transient = !last?.success && /login failed|timeout|ECONN|socket/i.test(last?.message || '');
      if (last?.success || !transient || attempt === retries) return last;
      await sleep(900);
    }
    return last;
  });
}

export async function login(username, password) {
  const j = await post('/login', { username, password });
  if (!j.success) throw new Error(j.message || 'Login failed. Check your username and password.');
  return j; // { success, userName }
}

// Generic data fetch. `creds` = { username, password }.
export async function fetchData(creds, type, extra = {}) {
  const j = await post('/data', { ...creds, type, ...extra }, 2);
  if (!j.success) throw new Error(j.message || `Failed to load ${type}.`);
  return { data: j.data, userName: j.userName };
}

export async function fetchIprDates(creds) {
  const j = await post('/ipr-dates', creds);
  if (!j.success) throw new Error(j.message || 'Failed to load IPR dates.');
  return j.availableDates;
}
