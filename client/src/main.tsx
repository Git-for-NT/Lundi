/**
 * main.tsx — Client entry point
 * ==============================
 * Purpose:
 *   This is the client entry point loaded by index.html's `<script type="module">`
 *   tag. It is the first TypeScript/React file the browser (or Vite) executes.
 *   Its sole job is to mount the root React component (<App />) into the DOM.
 *
 * Vite HMR integration:
 *   In development, Vite serves and transforms this file on-the-fly — TypeScript is
 *   stripped and JSX is compiled to React.createElement calls in milliseconds, with
 *   no separate build step. Vite's Hot Module Replacement (HMR) watches every module
 *   imported from this file; when you edit a source file, only the changed module is
 *   re-fetched and swapped in without a full page reload, preserving component state
 *   where possible.
 *
 *   In production, `vite build` replaces the `/src/main.tsx` script reference in
 *   index.html with the compiled, fingerprinted bundle it writes to dist/assets/
 *   (e.g., /assets/index-Ab3kQz1A.js). You never need to update index.html for
 *   production — Vite handles the rewrite automatically.
 *
 * Architecture:
 *   Browser → index.html → main.tsx → <App /> → all child components
 *   This file is intentionally minimal: configuration (routing, global providers,
 *   theme) belongs in App.tsx or dedicated provider files, not here.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// import './index.css'
// Loads the global CSS reset that removes browser default margins, sets box-sizing
// to border-box, and establishes baseline typography. Vite handles CSS imports
// natively — the styles are injected into a <style> tag in development and extracted
// to a separate .css file in the production bundle. Keeping the reset here (rather
// than in App.tsx) ensures it applies unconditionally before any component styles.
import './index.css';

import App from './App';

// createRoot — React 18's concurrent-mode API
// Replaces the legacy ReactDOM.render() from React 17 and earlier. The concurrent
// renderer unlocks opt-in features like transitions (useTransition), deferred values
// (useDeferredValue), and Suspense-based data fetching. Even if you don't use those
// features today, using createRoot future-proofs the app and enables React's
// automatic batching of state updates (multiple setState calls in a single event
// are now batched by default, reducing unnecessary re-renders).
//
// Common mistake to avoid: do not call createRoot more than once for the same
// container — it registers a root and calling it again on the same element throws.
createRoot(
  // document.getElementById('root')!
  // The non-null assertion (!) is safe because index.html guarantees that
  // <div id="root"> exists in the document before this script runs. Module scripts
  // are deferred by the HTML spec, so the DOM is always fully parsed by the time
  // this line executes. If the element were ever missing (e.g., someone accidentally
  // deleted it from index.html), the app would crash immediately here with a clear
  // TypeError pointing to this exact line — a fast and obvious failure rather than
  // a silent bug deep inside a component.
  document.getElementById('root')!,
).render(
  // <StrictMode>
  // A development-only wrapper that helps catch bugs early. In development it:
  //   1. Renders every component TWICE (mounts → unmounts → re-mounts) to surface
  //      side effects caused by impure rendering logic or missing cleanup in effects.
  //   2. Logs warnings for deprecated lifecycle methods and other patterns that will
  //      break in future React versions.
  //   3. Runs effect cleanup and re-setup twice to catch missing cleanup functions
  //      in useEffect/useLayoutEffect hooks.
  //
  // StrictMode has ZERO effect in production — the double-render behaviour is
  // completely stripped from the production bundle. It is safe (and recommended)
  // to leave it enabled at all times.
  //
  // Common mistake to avoid: do not remove StrictMode just because you see
  // components rendering twice in development — that double-render is intentional
  // and is StrictMode doing its job. If removing it "fixes" a bug, the bug is real
  // and lurking in your component.
  <StrictMode>
    <App />
  </StrictMode>,
);
