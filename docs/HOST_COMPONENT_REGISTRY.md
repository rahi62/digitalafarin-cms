# Host Component Registry — explicit Hybrid CMS binding (P0 foundation)

Draft branch `feat/cms-host-component-registry`. Depends on PR #59, which depends on #58 and #57. Not released.

This is a **host-owned metadata contract**, not a visual page builder or a remotely executable plugin framework.

## Purpose

Keep existing Next.js pages and business logic intact while declaring which CMS content fields may drive known UI components. CMS is never allowed to import arbitrary Next.js modules, overwrite host routes, execute serialized code or inject unsafe HTML.

## Example

```ts
import {
  defineCmsComponentRegistry,
  resolveCmsComponentSlot,
} from "@digitalafarin/cms-next";

export const cmsComponents = defineCmsComponentRegistry([
  {
    id: "HomeHero",
    route: "/",
    component: "HeroSection",
    props: {
      heading: "content.custom_fields.hero.title",
      subtitle: "content.excerpt",
      brand: "site.name",
    },
    required: ["heading"],
  },
]);
```

Then inside an existing host App Router page:

```tsx
import { cmsComponents } from "@/lib/cms-components";
import { resolveCmsComponentSlot } from "@digitalafarin/cms-next";
import HeroSection from "@/components/HeroSection";

const page = await cms.resolveForRoute("/");
const binding = page && resolveCmsComponentSlot(cmsComponents, "HomeHero", page);
if (!binding) return <HostFallback />;
return <HeroSection heading={String(binding.props.heading)} subtitle={String(binding.props.subtitle ?? "")} />;
```

The host retains control over imports and rendering. Values are read from the resolved CMS publication or authorized preview response; no source files are modified by the SDK.

## Safeguards and limits

- Registration explicitly lists component id, host route, component name, allowed field paths and required values.
- Static, exact normalized routes only; no automatic wildcard ownership or dynamic Next route rewrites.
- Validated field roots are `content`, `site` and `seo`; prototype-related keys and unsafe paths are rejected.
- The registry reads **own properties only**, and never executes values or HTML. Host React components must still render text safely.
- Missing required values generate an explicit error instead of fake-success rendering.
- This release has **no remote registry CRUD, Component Registry admin screen, binding version history, host source-code introspection or automatic component discovery**.
- The CLI Route Explorer remains a separate static snapshot tool and must be integrated with a verified host registry in a later phase.
- Do not use a CMS value directly as `dangerouslySetInnerHTML` without a proper renderer/sanitizer.

## Acceptance

Check existing host route behavior, preview, published snapshots, SEO/metadata, RTL and mobile rendering in real staging projects after feature completion. Full user acceptance is intentionally deferred.

No merge, npm package publication, Django migration or production deploy was performed.
