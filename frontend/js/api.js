import { config } from "./config.js";

export class ApiError extends Error {
  constructor(status, message, fields = null) { super(message); this.name = "ApiError"; this.status = status; this.fields = fields; }
}

const FALLBACK = {
  0: "Can't reach SmartBill right now. Check your connection and try again.",
  401: "Your session has ended. Please sign in again.", 403: "That action isn't allowed.", 404: "We couldn't find that.",
  409: "That conflicts with existing data.", 422: "That can't be done in the current state.", 429: "Too many attempts. Wait a few minutes and try again.",
  503: "This feature is temporarily unavailable. Everything else keeps working.",
};
const messageFor = (status) => FALLBACK[status] || (status >= 500 ? "Something went wrong on our side. Please try again." : "The request couldn't be completed.");

export async function api(path, { method = "GET", body, query, signal } = {}) {
  let url = config.apiBase + path;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v)) v.forEach((x) => qs.append(k, x)); else qs.append(k, v);
    }
    const s = qs.toString(); if (s) url += (url.includes("?") ? "&" : "?") + s;
  }
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-SmartBill-Client"] = "web";   // CSRF defence required by the backend
  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: "include", signal });
  } catch (e) {
    if (e && e.name === "AbortError") throw e;
    throw new ApiError(0, messageFor(0));
  }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/api/auth/login") && !path.startsWith("/api/auth/register")) {
      document.dispatchEvent(new CustomEvent("auth:expired"));
    }
    throw new ApiError(res.status, (data && data.error) || messageFor(res.status), data && data.fields);
  }
  return data;
}
export const get = (p, query, signal) => api(p, { query, signal });
export const post = (p, body = {}, signal) => api(p, { method: "POST", body, signal });
export const put = (p, body) => api(p, { method: "PUT", body });
export const patch = (p, body = {}) => api(p, { method: "PATCH", body });
export const del = (p, query) => api(p, { method: "DELETE", query });
