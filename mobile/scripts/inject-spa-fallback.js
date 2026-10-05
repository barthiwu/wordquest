#!/usr/bin/env node
// GitHub Pages serves this repo's web build as plain static files -- it
// has no server-side router, so a real page load (not a client-side
// navigation) at a nested path like /wordquest/verify-email 404s: there
// is no literal file at that path, only dist/index.html at the root.
// This bit Barth directly -- the new verify-email/reset-password links
// (see EmailService's appBaseUrl switch) point at exactly that kind of
// nested path, and any browser refresh on any deep link hits the same
// wall.
//
// Standard fix for SPAs on GitHub Pages (github.com/rafgraph/spa-github-pages):
// 1. A 404.html that encodes the requested path into a query string and
//    redirects to the site root.
// 2. A small inline script at the very top of index.html's <head> that
//    decodes that query string back into a real path via
//    history.replaceState -- BEFORE the app's own bundle (a deferred
//    script) runs, so React Navigation sees the correct URL on first
//    render and routes straight to it.
//
// Run after `expo export -p web` (which regenerates dist/ from scratch
// every build) -- see deploy-web.yml's "Add GitHub Pages SPA fallback"
// step. pathSegmentsToKeep=1 matches this being a GitHub Pages PROJECT
// site (https://barthiwu.github.io/wordquest/...), so only the first
// path segment ("wordquest") is preserved as the real directory; every
// segment after that is app-internal routing.
const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const PATH_SEGMENTS_TO_KEEP = 1;

// Public pages that third parties fetch directly (Meta's app settings
// validate the privacy-policy / data-deletion URLs, store listings link to
// them). GitHub Pages answers a missing file with HTTP 404 *before* the
// 404.html redirect runs, which fails those validators -- so each gets a
// real index.html (a copy of the app shell; the app then routes to the page
// from the URL) and returns 200.
const PUBLIC_PATHS = ['privacy-policy', 'terms', 'data-deletion'];

function writePublicPages(shellHtml) {
  for (const p of PUBLIC_PATHS) {
    const dir = path.join(DIST_DIR, p);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), shellHtml);
  }
  console.log(`Wrote real index.html pages for: ${PUBLIC_PATHS.join(', ')}.`);
}

const notFoundHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>WordQuest</title>
    <script>
      // Single Page Apps for GitHub Pages: github.com/rafgraph/spa-github-pages
      // Encodes this 404 request's real path/query/hash into a query
      // string on the site root, then redirects there -- see
      // scripts/inject-spa-fallback.js for why this file exists.
      var pathSegmentsToKeep = ${PATH_SEGMENTS_TO_KEEP};
      var l = window.location;
      l.replace(
        l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
        l.pathname.split('/').slice(0, 1 + pathSegmentsToKeep).join('/') + '/?/' +
        l.pathname.slice(1).split('/').slice(pathSegmentsToKeep).join('/').replace(/&/g, '~and~') +
        (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
        l.hash
      );
    </script>
  </head>
  <body></body>
</html>
`;

const restoreScript = `<script>
      // Single Page Apps for GitHub Pages: github.com/rafgraph/spa-github-pages
      // Undoes 404.html's redirect encoding via history.replaceState
      // before the app bundle below runs, so React Navigation's web
      // linking sees the real intended path on first render -- see
      // scripts/inject-spa-fallback.js.
      (function (l) {
        if (l.search[1] === '/') {
          var decoded = l.search.slice(1).split('&').map(function (s) {
            return s.replace(/~and~/g, '&');
          }).join('?');
          window.history.replaceState(null, null, l.pathname.slice(0, -1) + decoded + l.hash);
        }
      }(window.location));
    </script>
  `;

function main() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`dist/ not found at ${DIST_DIR} -- run "expo export -p web" first.`);
    process.exit(1);
  }

  fs.writeFileSync(path.join(DIST_DIR, '404.html'), notFoundHtml);

  const indexPath = path.join(DIST_DIR, 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  if (indexHtml.includes('spa-github-pages')) {
    console.log('index.html already has the SPA fallback script -- skipping.');
    writePublicPages(indexHtml);
    return;
  }
  if (!indexHtml.includes('</head>')) {
    console.error('index.html has no </head> to inject before -- aborting.');
    process.exit(1);
  }
  const patched = indexHtml.replace('</head>', `${restoreScript}</head>`);
  fs.writeFileSync(indexPath, patched);
  writePublicPages(patched);

  console.log(
    'Wrote dist/404.html and injected the SPA-fallback restore script into dist/index.html.',
  );
}

main();
