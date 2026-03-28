import { join } from 'node:path';
import { existsSync } from 'node:fs';

const serverDistFolder = import.meta.dirname;

// CRITICAL: Load manifests BEFORE importing Angular SSR
console.log('Initializing Angular SSR application...');

const appEngineManifestPath = join(serverDistFolder, 'angular-app-engine-manifest.mjs');
const appManifestPath = join(serverDistFolder, 'angular-app-manifest.mjs');

if (!existsSync(appEngineManifestPath)) {
  console.error(`ERROR: App engine manifest not found at ${appEngineManifestPath}`);
  process.exit(1);
}

// Load manifests first, then Angular imports
try {
  console.log('Loading Angular app-engine-manifest...');
  await import('./angular-app-engine-manifest.mjs');
  console.log('✓ Manifest loaded');
  
  if (existsSync(appManifestPath)) {
    console.log('Loading Angular app-manifest...');
    await import('./angular-app-manifest.mjs');
    console.log('✓ App manifest loaded');
  }
} catch (error: any) {
  console.error('Failed to load manifests:', error.message);
  process.exit(1);
}

// NOW import Angular after manifests are loaded
const {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} = await import('@angular/ssr/node');
const express = await import('express');

const browserDistFolder = join(serverDistFolder, '../browser');

if (!existsSync(browserDistFolder)) {
  console.error(`ERROR: Browser distribution folder not found at ${browserDistFolder}`);
  process.exit(1);
}

console.log('Creating AngularNodeAppEngine...');
const app = express.default();
let angularApp: any;

try {
  angularApp = new AngularNodeAppEngine();
  console.log('✓ AngularNodeAppEngine initialized');
} catch (error: any) {
  console.error('ERROR: Failed to initialize AngularNodeAppEngine');
  console.error('Details:', error.message);
  process.exit(1);
}

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req: any, res: any, next: any) => {
  angularApp
    .handle(req)
    .then((response: any) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error: any) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
