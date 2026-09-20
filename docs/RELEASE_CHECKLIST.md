# Release Checklist

Use this checklist before creating any `v*` tag.

## 1. Working tree and version

- [ ] Release branch is based on current `main`.
- [ ] `CHANGELOG.md` has the release entry.
- [ ] `docs/UPGRADING.md` covers relevant upgrade steps.
- [ ] Root/package metadata uses the intended version.
- [ ] Run:

```bash
npm run check:versions
```

Expected for v0.5:

```text
All publishable packages and lockfile metadata are synchronized at 0.5.0.
```

The synchronized npm workspaces now include:

```text
apps/admin                       -> @digitalafarin/cms-admin
packages/cms-next               -> @digitalafarin/cms-next
packages/cms-cli                -> @digitalafarin/cms-cli
```

## 2. Node validation

```bash
npm ci --ignore-scripts
npm --workspace packages/cms-next run build
npm --workspace packages/cms-next run typecheck
npm --workspace packages/cms-next run test:rich-text
npm --workspace apps/admin run typecheck
npm --workspace apps/admin run build
npm --workspace examples/next-site run build
npx playwright install --with-deps chromium
npm run test:e2e:editor
npm --workspace apps/admin run pack:check
npm --workspace packages/cms-next run pack:check
npm --workspace packages/cms-cli run pack:check
node scripts/smoke-npm-packages.mjs
```

- [ ] Next SDK builds.
- [ ] CMS Admin typecheck and production build pass.
- [ ] Safe rich-text renderer tests pass.
- [ ] Example public Next.js consumer build passes.
- [ ] Playwright Professional Editor tests pass.
- [ ] Packed SDK imports successfully from a clean consumer project.
- [ ] Installed CLI binary runs from the packed package.
- [ ] Packed `@digitalafarin/cms-admin` installs in a clean consumer project.
- [ ] `digitalafarin-cms-admin scaffold` generates a `/cms` Admin app.
- [ ] Generated Admin contains `/cms/api-proxy`, `.env.local`, and `deploy/nginx.cms.conf`.
- [ ] `digitalafarin-cms admin` can scaffold the Admin through the main CLI.
- [ ] `digitalafarin-cms init --with-public-route` creates the App Router catch-all and safe renderer in a clean frontend.

## 3. Python validation

```bash
python -m pip install -U pip pytest pytest-django build twine
python -m pip install -e "./packages/cms-django[all]"
DJANGO_SETTINGS_MODULE=tests.settings PYTHONPATH=packages/cms-django python -m pytest packages/cms-django/tests -q
DJANGO_SETTINGS_MODULE=tests.settings PYTHONPATH=packages/cms-django python -m django makemigrations --check --dry-run
python -m build packages/cms-django --outdir dist/python
python -m twine check dist/python/*
```

The CI installed-wheel smoke step then installs the built wheel in a clean virtual environment and runs:

```bash
python scripts/smoke-python-package.py
```

- [ ] Django tests pass.
- [ ] No migration drift exists.
- [ ] Wheel and sdist validate.
- [ ] Built wheel installs in a clean venv and migrations apply.

## 4. GitHub Actions

- [ ] PR CI is green on Node.
- [ ] Python 3.11 is green.
- [ ] Python 3.12 is green.
- [ ] Python 3.13 is green, including package build and installed-wheel smoke test.
- [ ] Release workflow still contains npm tarball/scaffold smoke tests before publishing.
- [ ] Release workflow contains a publish step for `@digitalafarin/cms-admin`.

## 5. Trusted Publishing

All publishable packages already exist from the v0.4.x line. v0.5 must publish through the configured GitHub environments/OIDC workflow; do not bootstrap or manually publish a package version.

Verify npm Trusted Publishing for all three packages:

```bash
npm trust list "@digitalafarin/cms-next"
npm trust list "@digitalafarin/cms-cli"
npm trust list "@digitalafarin/cms-admin"
```

Expected trust target:

```text
type: github
file: release.yml
repository: rahi62/digitalafarin-cms
environment: npm
permissions: publish
```

- [ ] npm Trusted Publishing is configured for SDK, CLI and Admin.
- [ ] GitHub environment `npm` exists.
- [ ] GitHub environment `pypi` exists.
- [ ] PyPI Trusted Publisher points to owner `rahi62`, repository `digitalafarin-cms`, workflow `release.yml`, environment `pypi`.
- [ ] `0.5.0` does not already exist in npm/PyPI before tagging.

## 6. Pre-tag product checks

- [ ] Admin login works with real credentials; no default credentials are pre-filled.
- [ ] Admin works under `/cms` rather than requiring a dedicated subdomain.
- [ ] Unauthorized/login/logout redirects remain under `/cms`.
- [ ] Browser Admin API calls use `/cms/api-proxy`.
- [ ] Server-side Admin proxy reaches the configured Django CMS API upstream.
- [ ] Generated Nginx configuration routes `/cms/` to the Admin process without stripping the base path.
- [ ] Create/edit/publish a content entry.
- [ ] Standard -> Advanced -> Standard preserves rich text and advanced blocks.
- [ ] Media Library insertion works inside the Professional Editor.
- [ ] `/cms` content-create redirect remains under the configured base path.
- [ ] Public `rich_text` output is rendered through the SDK safe renderer.
- [ ] Revision restore works.
- [ ] Categories/tags assignment works.
- [ ] Menu resolver returns nested menu data.
- [ ] Site Settings save and public context sanitization work.
- [ ] A fresh SEO Audit completes.
- [ ] Audit Trends can compare two completed runs.
- [ ] Search Performance import accepts a valid sample.
- [ ] Content Decay returns signals for sample comparison data.
- [ ] SEO Opportunities combines available Audit/Search/SeoMeta signals.
- [ ] Public Next.js sample resolves content and metadata.

## 7. Tag and publish

Only after all checks above are green and Trusted Publishing has been verified:

```bash
git checkout main
git pull --ff-only
npm run check:versions
git tag v0.5.0
git push origin v0.5.0
```

The tag triggers `.github/workflows/release.yml`.

Do not manually republish a version that already exists in npm or PyPI.

## 8. Post-release verification

Python:

```bash
pip install "digitalafarin-cms[all]==0.5.0"
python -c "import digitalafarin_cms; print(digitalafarin_cms.__version__)"
```

npm:

```bash
npm view "@digitalafarin/cms-next@0.5.0" version
npm view "@digitalafarin/cms-cli@0.5.0" version
npm view "@digitalafarin/cms-admin@0.5.0" version
npx "@digitalafarin/cms-cli@0.5.0" doctor
```

Admin scaffold smoke check:

```bash
npx "@digitalafarin/cms-admin@0.5.0" scaffold \
  --dir cms-admin-release-test \
  --base-path /cms \
  --api-url https://api.example.com/api/cms/v1 \
  --port 3001 \
  --skip-install
```

- [ ] PyPI shows `0.5.0`.
- [ ] npm `latest` points to `0.5.0` for SDK, CLI and Admin.
- [ ] GitHub Release `v0.5.0` exists.
- [ ] Install instructions in README match the published packages.
