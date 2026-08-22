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

Expected for v0.3:

```text
All publishable packages and lockfile metadata are synchronized at 0.3.0.
```

## 2. Node validation

```bash
npm install --ignore-scripts
npm --workspace packages/cms-next run build
npm --workspace packages/cms-next run typecheck
npm --workspace apps/admin run typecheck
npm --workspace packages/cms-next run pack:check
npm --workspace packages/cms-cli run pack:check
node scripts/smoke-npm-packages.mjs
```

- [ ] Next SDK builds.
- [ ] Admin typecheck passes.
- [ ] Packed SDK imports successfully from a clean consumer project.
- [ ] Installed CLI binary runs from the packed package.

## 3. Python validation

```bash
python -m pip install -U pip pytest pytest-django build twine
python -m pip install -e "./packages/cms-django[all]"
DJANGO_SETTINGS_MODULE=tests.settings PYTHONPATH=packages/cms-django python -m pytest packages/cms-django/tests -q
DJANGO_SETTINGS_MODULE=tests.settings PYTHONPATH=packages/cms-django python -m django makemigrations --check --dry-run
python -m build packages/cms-django --outdir dist/python
python -m twine check dist/python/*
python scripts/smoke_python_wheel.py
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
- [ ] Release workflow still contains artifact smoke tests before publishing.

## 5. Trusted Publishing

Verify npm trust for both packages:

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

- [ ] GitHub environment `npm` exists.
- [ ] GitHub environment `pypi` exists.
- [ ] PyPI Trusted Publisher points to owner `rahi62`, repository `digitalafarin-cms`, workflow `release.yml`, environment `pypi`.

## 6. Pre-tag product checks

- [ ] Admin login works.
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
- [ ] Next.js sample resolves content and metadata.

## 7. Tag and publish

Only after all checks are green:

```bash
git checkout main
git pull --ff-only
npm run check:versions
git tag v0.3.0
git push origin v0.3.0
```

The tag triggers `.github/workflows/release.yml`.

Do not manually republish a version that already exists in npm or PyPI.

## 8. Post-release verification

In clean environments:

```bash
pip install "digitalafarin-cms[all]==0.3.0"
python -c "import digitalafarin_cms; print(digitalafarin_cms.__version__)"
```

```bash
npm view "@digitalafarin/cms-next@0.3.0" version
npm view "@digitalafarin/cms-cli@0.3.0" version
npx "@digitalafarin/cms-cli@0.3.0" doctor
```

- [ ] PyPI shows `0.3.0`.
- [ ] npm `latest` points to `0.3.0` for both packages.
- [ ] GitHub Release `v0.3.0` exists.
- [ ] Install instructions in README still match the published packages.
