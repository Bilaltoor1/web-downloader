// Shared state for active downloads
// Use a global singleton to ensure the same Map instance is used across
// all route modules and during HMR in dev (Next.js can evaluate modules separately).
const globalKey = '__ytdn_activeDownloads__';

const activeDownloads = (globalThis[globalKey] ||= new Map());

export { activeDownloads };
