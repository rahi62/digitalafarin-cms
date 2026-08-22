# Community and Commercial Product Boundary

The public repository is the **Community Edition** and is licensed under Apache-2.0.

The intended commercial model is open-core: the Community Edition should remain genuinely useful for self-hosted CMS and SEO workflows, while managed infrastructure, advanced automation and organization-scale capabilities can be offered separately.

## Community Edition v0.3 includes

- Self-hosted multi-site Headless CMS
- Editorial workflow, revisions, taxonomy, menus and media
- SEO metadata, schema, redirects and internal-link suggestions
- SEO Audit crawler, page metrics, issue engine and Audit Trends
- Search Performance data model/import foundation
- Content Decay analysis
- Unified SEO Opportunity Engine and Action Queue
- Next.js SDK and installer CLI

## Potential commercial products

- DigitalAfarin CMS Cloud / managed hosting
- Managed recurring crawls, larger crawl quotas and distributed crawl infrastructure
- Managed Google Search Console OAuth and automatic synchronization
- Long-term Search Performance warehousing and advanced cross-site analytics
- AI SEO assistant, content briefs, rewrite assistance and usage credits
- Advanced internal-link automation and approval workflows
- Agency workspace, quotas and centralized client management
- White-label administration and custom domains
- Team governance, audit logs and advanced permissions
- Enterprise SSO, SLA, support and custom integrations
- Migration, implementation and managed SEO services

The Community data contracts should remain usable without commercial services. For example, a self-hosted user can import Search Performance data into the same models used by a future managed Google connector.

Commercial code should live in separate private packages/repositories or managed services so the licensing boundary remains clear.
