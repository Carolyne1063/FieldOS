# FieldOS Plan

Multi-tenant field service platform. First example industry: CCTV installation and maintenance.
Principle: the platform is generic; each organization configures job types, checklists and equipment for its own industry.

## Roles (draft)
super_admin (platform), owner, dispatcher, supervisor, technician, customer. Later: finance, auditor.

## Phases
0. Foundation: monorepo, Docker (Postgres, Redis), env config, ORM and migrations, shared package, tests, CI
1. Auth, roles, organizations, audit log
2. Customers, sites, equipment (with QR codes)
3. Jobs and dispatch: status state machine, configurable job types, assignment, request intake
4. Technician workspace (PWA): check-in/out, checklists, notes, photos, materials, submit for review
5. Review, customer sign-off, PDF reports  (MVP milestone)
6. Dashboard and calendar
7. Real-time (WebSockets) and notifications
8. Offline sync
9. Maps and geolocation  (field-ready milestone)
10. Inventory, invoicing, M-Pesa
11. Customer portal, preventive maintenance
12. Public marketing site
13. Hardening, Playwright end-to-end tests, deployment, docs

## Roadmap (later)
Stock audit module, industry templates for other sectors.

## Working rules
- State machine and permissions are written down before they are coded.
- Every phase ends with something runnable.
- Small branches and PRs. Tests are written in the same phase as the feature.
- Anything cut goes here as "later".