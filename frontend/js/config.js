// API base URL comes from /config.js (a plain script loaded before the app, edited per deployment).
//  - "" (empty)  => same-origin calls to /api/... (use with the Vercel rewrite in vercel.json: no cross-site cookies)
//  - "https://your-backend.onrender.com" => direct calls (the backend must allow this origin via FRONTEND_ORIGIN)
// Only PUBLIC values belong there: never secrets.
const configured = typeof window !== "undefined" && typeof window.SMARTBILL_API_BASE === "string" ? window.SMARTBILL_API_BASE : "http://localhost:8080";
export const config = { apiBase: configured.replace(/\/+$/, "") };
