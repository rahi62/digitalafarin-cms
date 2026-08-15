# Architecture

DigitalAfarin CMS is split into installable layers:

```text
Host Django Project
  -> digitalafarin-cms
  -> PostgreSQL / optional Redis + Celery

Host Next.js Project
  -> @digitalafarin/cms-next

Developer workstation / CI
  -> @digitalafarin/cms-cli
```

The Django package owns content and SEO domain models and REST endpoints. The Next.js package is a thin consumer layer and does not duplicate CMS state. The CLI performs idempotent wiring rather than copying the CMS source into a customer project.

Content is stored as structured blocks, not pre-rendered page HTML, so each Next.js application can map block types to its own design system.
