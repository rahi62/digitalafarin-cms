# Architecture

DigitalAfarin CMS is split into installable layers:

```text
Host Django Project
  -> digitalafarin-cms
  -> PostgreSQL
  -> optional Redis + Celery

Host Next.js Project
  -> @digitalafarin/cms-next

Developer workstation / CI
  -> @digitalafarin/cms-cli

Admin application
  -> Next.js admin UI
  -> authenticated Django REST API
```

## Principles

- Django owns canonical CMS state and tenant boundaries.
- Next.js remains a rendering consumer and does not duplicate CMS state.
- Content is stored as structured blocks rather than pre-rendered page HTML.
- The CLI performs idempotent wiring rather than copying CMS source into customer projects.
- Public resolver endpoints expose only explicitly sanitized data.
- Integration credentials are not exposed through public site context.

## Django domain apps

```text
sites
  Organizations, Sites, Memberships, roles and site settings

content
  Content types, entries, hierarchy, revisions, categories, tags,
  reusable blocks, menus and editorial workflow

seo
  SeoMeta, schema, keyword clusters, redirects, internal-link suggestions,
  sitemap/robots helpers and SEO Opportunity Engine

media_library
  Managed media records used by content and SEO fields

audit
  SEO crawler runs, page metrics, issues, health score and run comparison

integrations
  Webhooks, Search Performance imports, daily page metrics and Content Decay
```

## SEO intelligence flow

```text
Published Content
      |
      +-------------------+
      |                   |
      v                   v
 SEO Audit          Search Performance
 crawler            daily page metrics
      |                   |
      v                   v
 Audit issues        Content Decay signals
      |                   |
      +---------+---------+
                |
                v
         SEO Opportunity Engine
                |
                v
       Prioritized Action Queue
```

The Opportunity Engine is intentionally deterministic in v0.3. It combines the latest successful Audit, Search Performance deltas, SeoMeta state, content age and internal-link signals. AI assistance can be layered on top later without making core ranking/decay detection dependent on an LLM.

## Search Console integration boundary

v0.3 stores Search Console-compatible page/day metrics and exposes import-friendly APIs. OAuth secrets and automatic Google synchronization are deliberately outside the core data model. A future OAuth worker or managed connector can feed the same `SearchPerformanceDaily` model without changing the analytics engine.

## Release architecture

- npm packages publish through GitHub Actions Trusted Publishing.
- PyPI publishes through GitHub OIDC.
- CI runs on Python 3.11, 3.12 and 3.13 plus Node 24.
- Release hardening validates migration drift, installed Python wheels, packed npm SDK exports and the installed CLI binary.
