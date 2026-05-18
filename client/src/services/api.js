/**
 * services/api.js - Modul Layanan API (MFE-09)
 *
 * Wrapper fetch tipis dengan dukungan JWT (Authorization: Bearer ...)
 * dan auto-handling error untuk seluruh endpoint backend.
 */

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Ambil JWT token dari localStorage.
 * @returns {string|null}
 */
export function getToken() {
  return localStorage.getItem('mm_token');
}

/**
 * Set / hapus JWT token.
 * @param {string|null} token
 */
export function setToken(token) {
  if (token) localStorage.setItem('mm_token', token);
  else localStorage.removeItem('mm_token');
}

/**
 * Generic request helper.
 * @param {string} path - relatif terhadap BASE (e.g. "/api/projects")
 * @param {RequestInit & {auth?:boolean}} [opts]
 * @returns {Promise<any>}
 */
async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (opts.auth !== false) {
    const tok = getToken();
    if (tok) headers.Authorization = `Bearer ${tok}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!res.ok) {
    const err = new Error(data.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

// ---- Auth ----
export const Auth = {
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload, auth: false }),
  login:    (payload) => request('/api/auth/login',    { method: 'POST', body: payload, auth: false }),
};

// ---- Mind map generation ----
export const Mindmap = {
  generate: (text, demos) => request('/api/mindmap/generate', { method: 'POST', body: { text, demos } }),
};

// ---- Projects CRUD ----
export const Projects = {
  list:   () => request('/api/projects'),
  get:    (id) => request(`/api/projects/${id}`),
  create: (payload) => request('/api/projects', { method: 'POST', body: payload }),
  update: (id, payload) => request(`/api/projects/${id}`, { method: 'PUT', body: payload }),
  remove: (id) => request(`/api/projects/${id}`, { method: 'DELETE' }),
  revisions: (id) => request(`/api/projects/${id}/revisions`),
  saveRevision: (id, payload) => request(`/api/projects/${id}/revisions`, { method: 'POST', body: payload }),
};
