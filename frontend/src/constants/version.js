// Authoritative Centralized Version Source for LetUsChat
// Values are injected at build time by Vite (define) and fallback to package.json
import packageJson from '../../package.json';

export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined'
    ? __APP_VERSION__
    : packageJson.version || '1.0.2';

export const BUILD_TIMESTAMP =
  typeof __BUILD_TIMESTAMP__ !== 'undefined'
    ? __BUILD_TIMESTAMP__
    : new Date().toISOString();

export const GIT_COMMIT_SHA =
  typeof __GIT_COMMIT_SHA__ !== 'undefined'
    ? __GIT_COMMIT_SHA__
    : 'local';

if (typeof window !== 'undefined') {
  window.__LETUSCHAT_VERSION__ = APP_VERSION;
  window.__LETUSCHAT_BUILD__ = {
    version: APP_VERSION,
    buildTimestamp: BUILD_TIMESTAMP,
    commitSha: GIT_COMMIT_SHA
  };
}

export default APP_VERSION;
