# FusionAngularTailwindStarter

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.1.2.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
# Force rebuild with SSR fixes

---

## Production Deployment (Multi-VM Split)

To resolve memory constraints, the production architecture is split across two Virtual Machines (VMs).

**1. Original VM (Backend, Admin, & DB)**
This machine hosts the Spring Boot backend, the PostgreSQL database, and the NGINX-served Angular Admin app.
*   **Deployment file:** `docker-compose.prod.backend.yml`
*   **Command:** `docker-compose --env-file .env -f docker-compose.prod.backend.yml up -d`

**2. New VM (Frontend SSR)**
This machine is dedicated entirely to the Angular Server-Side Rendered (SSR) Node.js application.
*   **Deployment file:** `docker-compose.prod.frontend.yml`
*   **Command:** `docker-compose --env-file .env -f docker-compose.prod.frontend.yml up -d`

**Configuration (`.env`)**
*   Copy `.env.template` to `.env` on both machines.
*   Crucially, on the **New VM**, ensure `FRONTEND_API_URL` points to the public IP or domain of the **Original VM** (where the backend runs).
