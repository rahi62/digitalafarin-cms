# Visual Component Registry Builder — DigitalAfarin CMS

**Branch:** `feat/cms-visual-component-binding` (Draft PR #61, depends on PR #60). No merge, release or deploy.

## UI workflow

1. Run `npx @digitalafarin/cms-cli routes --frontend . --export-report` inside the actual Next.js project.
2. Expose the generated `.digitalafarin/routes-report.json` to the Admin server using the existing `DIGITALAFARIN_CMS_ROUTE_REPORT_PATH` setting. The Admin Route Explorer endpoint reads the **snapshot** after validating CMS authentication. It does not browse arbitrary files.
3. Open **Route Explorer** and select a static, unprotected page. Choose **اتصال بصری کامپوننت‌های این صفحه** to open Component Registry with the route preselected.
4. Choose a CMS site and content type. The UI lists known top-level fields, supported nested Group fields and SEO/site fields. `repeater` and `gallery` inner paths are not offered because the initial SDK doesn't support array indices.
5. Add component slots and map named props to approved field sources. Mark required props, inspect validation errors and copy the generated TypeScript.
6. Review and commit the generated file in the **host Next.js repo**. Import and render the named host components yourself using `resolveCmsComponentSlot`; the GUI never inserts imports or source files automatically.

Example generated file path: `src/lib/cms-components.ts`.

## Contract, scope and limitations

- Component IDs, component names, property keys, source paths and route eligibility are validated client-side; the resulting SDK registry **revalidates** them when initialized in the host.
- Only safe *explicit static host routes* from the report can be selected. Dynamic Next routes, API routes, parallel and intercepted routes, reserved infrastructure and route traversal are rejected.
- Component code remains in Next.js and cannot be uploaded/executed through CMS. Values must be escaped or rendered through an approved rich text component; CMS content is untrusted data.
- The builder is **an authoring aid, not a persisted registry**. It does not save mappings to Django or sync deployed host configurations. Lost form state is not recovered. This limitation must be resolved before declaring Component Registry fully complete.
- Tenant site/type dropdowns are from authenticated Django management API. The route snapshot is not automatically linked to one tenant site; developers must verify the selected host/site association.
- The UI does not certify real API connectivity, publishing behavior, a component's props TypeScript signatures, or runtime rendering of a specific host project.
- UI and helper implementation are copied with the existing embedded Admin scaffold, including scoped styles. Browser E2E covers the workflow with mocked APIs.

## Next hardening steps

Secure persisted tenant-scoped drafts and history, controlled host manifest import/version checks, relation/indexing, dynamic-route recognition and binding support, support for array/repeater sources, host component-prop introspection where safe, and staging consumer acceptance.

Do **not** merge this dependent PR or publish packages without explicit review; no operational migration was run.
