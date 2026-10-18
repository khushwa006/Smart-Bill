// Tiny shared state: the signed-in user and the unread notification count.
const state = { user: null, unread: 0 };
const listeners = new Set();
export const getState = () => state;
export function setState(patch) { Object.assign(state, patch); listeners.forEach((fn) => fn(state)); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
