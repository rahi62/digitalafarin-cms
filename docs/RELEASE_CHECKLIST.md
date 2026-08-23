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

Expected for v0.4:

```text
All publishable packages and lockfile metadata are synchronized at 0.4.0.
```

The synchronized npm workspaces now include:

```text
apps/admin                       -> @digitalafarin/cms-admin
packages/cms-next               -> @digitalafarin/cms-next
packages/cms-cli                -> @digitalafarin/cms-cli
```

## 2. Node validation

```bash
npm install --ignore-scripts
npm --workspace packages/cms-next run build
npm --workspace packages/cms-next run typecheck
npm --workspace apps/admin run typecheck
npm --workspace apps/admin run pack:check
npm --workspace packages/cms-next run pack:check
npm --workspace packages/cms-cli run pack:check
node scripts/smoke-npm-packages.mjs
```

- [ ] Next SDK builds.
- [ ] CMS Admin typecheck passes.
- [ ] Packed SDK imports successfully from a clean consumer project.
- [ ] Installed CLI binary runs from the packed package.
- [ ] Packed `@digitalafarin/cms-admin` installs in a clean consumer project.
- [ ] `digitalafarin-cms-admin scaffold` generates a `/cms` Admin app.
- [ ] Generated Admin contains `/cms/api-proxy`, `.env.local`, and `deploy/nginx.cms.conf`.
- [ ] `digitalafarin-cms admin` can scaffold the Admin through the main CLI.

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

## 5. Trusted Publishing and first Admin-package bootstrap

Existing packages should already have npm Trusted Publishing:

```bash
npm trust list "@digitalafarin/cms-next"
npm trust list "@digitalafarin/cms-cli"
```

Expected trust target:

```text
type: github
file: release.yml
repository: rahi62/digitalafarin-cms
environment: npm
permissions: publish
```

### First publication of `@digitalafarin/cms-admin`

`@digitalafarin/cms-admin` is new in v0.4. npm Trusted Publishing can only be attached after the npm package exists. Therefore **before creating the v0.4.0 tag**, bootstrap only this new package once with the npm account that owns the `@digitalafarin` scope:

```bash
npm --workspace apps/admin publish --access public
```

If npm requests a 2FA OTP, provide it using the normal npm authentication flow.

Then configure Trusted Publishing for the new package:

```bash
npm trust github "@digitalafarin/cms-admin" \
  --repo "rahi62/digitalafarin-cms" \
  --file "release.yml" \
  --env "npm" \
  --allow-publish \
  --yes
```

Verify:

```bash
npm trust list "@digitalafarin/cms-admin"
```

Expected target is the same `rahi62/digitalafarin-cms` / `release.yml` / `npm` environment configuration shown above.

- [ ] `@digitalafarin/cms-admin@0.4.0` exists on npm before the release tag.
- [ ] npm Trusted Publishing is configured for all three npm packages.
- [ ] GitHub environment `npm` exists.
- [ ] GitHub environment `pypi` exists.
- [ ] PyPI Trusted Publisher points to owner `rahi62`, repository `digitalafarin-cms`, workflow `release.yml`, environment `pypi`.

The v0.4.0 release workflow will detect that the bootstrapped Admin version already exists and skip republishing it. Future versions can publish all three npm packages through OIDC.

## 6. Pre-tag product checks

- [ ] Admin login works with real credentials; no default credentials are pre-filled.
- [ ] Admin works under `/cms` rather than requiring a dedicated subdomain.
- [ ] Unauthorized/login/logout redirects remain under `/cms`.
- [ ] Browser Admin API calls use `/cms/api-proxy`.
- [ ] Server-side Admin proxy reaches the configured Django CMS API upstream.
- [ ] Generated Nginx configuration routes `/cms/` to the Admin process without stripping the base path.
- [ ] Create/edit/publish a content entry.
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

Only after all checks above are green **and the new Admin package has been bootstrapped/trusted**:

```bash
git checkout main
git pull --ff-only
npm run check:versions
git tag v0.4.0
git push origin v0.4.0
```

The tag triggers `.github/workflows/release.yml`.

Do not manually republish a version that already exists in npm or PyPI.

## 8. Post-release verification

Python:

```bash
pip install "digitalafarin-cms[all]==0.4.0"
python -c "import digitalafarin_cms; print(digitalafarin_cms.__version__)"
```

npm:

```bash
npm view "@digitalafarin/cms-next@0.4.0" version
npm view "@digitalafarin/cms-cli@0.4.0" version
npm view "@digitalafarin/cms-admin@0.4.0" version
npx "@digitalafarin/cms-cli@0.4.0" doctor
```

Admin scaffold smoke check:

```bash
npx "@digitalafarin/cms-admin@0.4.0" scaffold \
  --dir cms-admin-release-test \
  --base-path /cms \
  --api-url https://api.example.com/api/cms/v1 \
  --port 3001 \
  --skip-install
```

- [ ] PyPI shows `0.4.0`.
- [ ] npm `latest` points to `0.4.0` for SDK, CLI and Admin.
- [ ] GitHub Release `v0.4.0` exists.
- [ ] Install instructions in README match the published packages.
