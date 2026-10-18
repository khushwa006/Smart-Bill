// Thin Chart.js wrapper: destroys old charts on re-render and degrades gracefully if the library is unavailable.
const live = new WeakMap();
export function drawChart(canvas, config) {
  if (!canvas) return null;
  const C = typeof window !== "undefined" ? window.Chart : undefined;
  if (!C) { canvas.replaceWith(Object.assign(document.createElement("p"), { className: "muted small", textContent: "Chart unavailable; the table below has the same data." })); return null; }
  live.get(canvas)?.destroy();
  const chart = new C(canvas, { ...config, options: { responsive: true, maintainAspectRatio: false, animation: false, ...(config.options || {}) } });
  live.set(canvas, chart);
  return chart;
}
export const PALETTE = ["#2b3fa3", "#0f6b47", "#c2790a", "#4a3bb3", "#a8201a", "#1f4f8f", "#6b7592", "#8a5a00"];
