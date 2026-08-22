# راهنمای انتشار DigitalAfarin CMS

این سند وضعیت فعلی مخزن زیر را مبنا می‌گیرد:

```text
GitHub owner: rahi62
Repository: digitalafarin-cms
```

نسخه‌های Python و npm باید همیشه با هم منتشر شوند.

## 1. پکیج‌های عمومی

```text
PyPI: digitalafarin-cms
npm:  @digitalafarin/cms-next
npm:  @digitalafarin/cms-cli
```

نسخه عمومی قبلی `0.2.1` است و نسخه بعدی برنامه‌ریزی‌شده `0.3.0` است.

## 2. npm Trusted Publishing

Trusted Publishing برای هر دو npm package باید به GitHub Actions متصل باشد.

برای بررسی وضعیت فعلی:

```bash
npm trust list "@digitalafarin/cms-next"
npm trust list "@digitalafarin/cms-cli"
```

خروجی مورد انتظار:

```text
type: github
file: release.yml
repository: rahi62/digitalafarin-cms
environment: npm
permissions: publish
```

در GitHub Repository نیز Environment زیر باید وجود داشته باشد:

```text
npm
```

انتشار CI از `.github/workflows/release.yml` انجام می‌شود و برای publish عادی نباید token دائمی npm لازم باشد.

## 3. PyPI Trusted Publisher

Project:

```text
digitalafarin-cms
```

Trusted Publisher باید به مشخصات زیر متصل باشد:

```text
GitHub owner: rahi62
Repository: digitalafarin-cms
Workflow filename: release.yml
Environment: pypi
```

در GitHub نیز Environment زیر باید وجود داشته باشد:

```text
pypi
```

Release workflow با OIDC wheel/sdist را به PyPI منتشر می‌کند.

## 4. همگام‌سازی نسخه

نسخه در این منابع باید یکسان باشد:

- `package.json`
- `package-lock.json`
- `packages/cms-next/package.json`
- `packages/cms-cli/package.json`
- `packages/cms-django/pyproject.toml`
- `packages/cms-django/src/digitalafarin_cms/__init__.py`

برای تغییر نسخه:

```bash
npm run version:set -- 0.3.0
npm run check:versions
```

`version:set` از v0.3 به بعد metadata نسخه داخل `package-lock.json` را هم sync می‌کند.

## 5. تست قبل از Tag

قبل از انتشار، Checklist اصلی را اجرا کن:

```text
docs/RELEASE_CHECKLIST.md
```

CI علاوه بر تست‌های source این موارد را نیز بررسی می‌کند:

- Python 3.11 / 3.12 / 3.13
- Django migration drift
- build و `twine check`
- نصب wheel در venv تمیز
- اجرای migrations از wheel نصب‌شده
- `npm pack` واقعی SDK و CLI
- نصب tarballها در پروژه consumer تمیز
- import exportهای SDK
- اجرای binary نصب‌شده CLI

## 6. ایجاد Release

بعد از merge شدن Release Prep در `main` و سبز بودن CI:

```bash
git checkout main
git pull --ff-only
npm run check:versions
git tag v0.3.0
git push origin v0.3.0
```

Tag `v*` workflow زیر را اجرا می‌کند:

```text
.github/workflows/release.yml
```

Workflow:

1. نسخه Tag را با package version تطبیق می‌دهد.
2. Python distribution را build و smoke-test می‌کند.
3. اگر نسخه روی PyPI موجود نباشد، با OIDC منتشر می‌کند.
4. npm SDK/CLI را pack و smoke-test می‌کند.
5. اگر نسخه روی npm موجود نباشد، با Trusted Publishing منتشر می‌کند.
6. در پایان GitHub Release می‌سازد.

## 7. بررسی پس از انتشار

Python:

```bash
python -m venv .venv-release-test
# activate environment
pip install "digitalafarin-cms[all]==0.3.0"
python -c "import digitalafarin_cms; print(digitalafarin_cms.__version__)"
```

npm:

```bash
npm view "@digitalafarin/cms-next@0.3.0" version
npm view "@digitalafarin/cms-cli@0.3.0" version
npx "@digitalafarin/cms-cli@0.3.0" doctor
```

همچنین `latest` را بررسی کن:

```bash
npm dist-tag ls "@digitalafarin/cms-next"
npm dist-tag ls "@digitalafarin/cms-cli"
```

## 8. نکته مهم درباره Search Console

v0.3 مدل داده و Import/Content Decay برای داده‌های Search Console را دارد، اما Google OAuth credential و sync خودکار GSC هنوز جزو Community Edition v0.3 نیست. در مستندات انتشار نباید این قابلیت به‌عنوان اتصال خودکار Google معرفی شود.

## 9. مدل انتشار Community / Commercial

Community Edition تحت Apache-2.0 قابل استفاده است. قابلیت‌هایی مانند Managed Cloud، Billing، AI SEO پیشرفته، Agency/White-label، Google OAuth مدیریت‌شده و Enterprise Support می‌توانند در سرویس‌ها یا packageهای تجاری جدا توسعه پیدا کنند.
