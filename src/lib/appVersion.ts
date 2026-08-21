/**
 * Application release identity injected by Vite from package.json at build time.
 *
 * This is intentionally independent from IndexedDB, backup and Supabase schema
 * namespaces. It is never persisted in user data and never gates compatibility.
 */
export const APP_RELEASE_VERSION = __APP_RELEASE_VERSION__;
