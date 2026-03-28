import { join } from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';

const serverDistFolder = import.meta.dirname;

// Create an initialization promise that will bootstrap the server
let initPromise: Promise<any> | null = null;

async function initServer() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
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
      // @ts-ignore
      const appEngineManifest = await import('./angular-app-engine-manifest.mjs');
      console.log('✓ Manifest loaded');

      console.log('Loading Angular app-manifest...');
      // @ts-ignore
      const appManifest = await import('./angular-app-manifest.mjs');
      console.log('✓ App manifest loaded');

      // Import the manifest setter functions (internal APIs)
      const { ɵsetAngularAppManifest, ɵsetAngularAppEngineManifest } = await import('@angular/ssr');

      // Ensure allowedHosts is an array (Angular SSR tries to iterate over it)
      if (!appEngineManifest.default.allowedHosts) {
        appEngineManifest.default.allowedHosts = [];
      }
      if (!appManifest.default.allowedHosts) {
        appManifest.default.allowedHosts = [];
      }

      // Set the manifests using the proper SSR API
      ɵsetAngularAppManifest(appManifest.default);
      ɵsetAngularAppEngineManifest(appEngineManifest.default);
      console.log('✓ Manifests set via SSR API');
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

    const browserDistFolder = join(serverDistFolder, '../browser');

    if (!existsSync(browserDistFolder)) {
      console.error(`ERROR: Browser distribution folder not found at ${browserDistFolder}`);
      process.exit(1);
    }

    console.log('Creating AngularNodeAppEngine...');
    const app = express();
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
      console.log(`SSR Request: ${req.method} ${req.url} from ${req.headers.host}`);

      try {
        const result = angularApp.handle(req);
        console.log('SSR handle called, awaiting result...');

        result.then((response: any) => {
          console.log(`SSR Response received: ${response ? 'response object' : 'null'}`);
          if (response) {
            console.log('Writing response...');
            writeResponseToNodeResponse(response, res);
            console.log('Response written');
          } else {
            console.log('No response from Angular, calling next()');
            next();
          }
        }).catch((error: any) => {
          console.error('SSR Error in promise:', error);
          next(error);
        });
      } catch (syncError: any) {
        console.error('SSR Error synchronously:', syncError);
        next(syncError);
      }
    });

    /**
     * Start the server if this module is the main entry point, or it is ran via PM2.
     */
    if (isMainModule(import.meta.url) || process.env['pm_id']) {
      const port = parseInt(process.env['PORT'] || '4000', 10);
      const host = process.env['HOST'] || '0.0.0.0'; // Bind to 0.0.0.0 for Docker
      app.listen(port, host, (error: any) => {
        if (error) {
          throw error;
        }

        console.log(`Node Express server listening on http://${host}:${port}`);
      });
    }

    // We return the actual express app AND the initialized reqHandler factory wrapper so
    // our top-level export proxy can invoke it safely.
    return {
      app,
      reqHandlerFn: createNodeRequestHandler(app)
    };
  })();

  return initPromise;
}

// Automatically trigger initialization process immediately on import so it runs
// before the first request, capturing the isMainModule logic properly.
initServer().catch((err) => {
  console.error('Failed to initialize server', err);
  process.exit(1);
});

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = async (req: any, res: any, next: any) => {
  try {
    const { reqHandlerFn } = await initServer();
    // Use the correctly bound node request handler returned by Angular SSR
    return reqHandlerFn(req, res, next);
  } catch (error) {
    if (next) {
      next(error);
    } else {
      console.error('Critical Error in Angular Node Request Handler', error);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  }
};
