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
npm:  @digitalafarin/cms-admin
```

نسخه فعلی هدف `0.4.0` است. پکیج Admin از این نسخه به بعد بخشی از انتشار هماهنگ CMS است.

## 2. npm Trusted Publishing

برای packageهای موجود وضعیت trust را بررسی کن:

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

### Bootstrap اولیه `@digitalafarin/cms-admin`

پکیج `@digitalafarin/cms-admin` در v0.4 جدید است. npm اجازه اتصال Trusted Publisher به packageای که هنوز ایجاد نشده را نمی‌دهد. پس اولین نسخه Admin را **قبل از ساخت tag v0.4.0** یک‌بار دستی منتشر کن:

```bash
npm --workspace apps/admin publish --access public
```

اگر npm OTP درخواست کرد، از 2FA حساب npm استفاده کن.

بعد Trusted Publishing را برای همان package ثبت کن:

```bash
npm trust github "@digitalafarin/cms-admin" \
  --repo "rahi62/digitalafarin-cms" \
  --file "release.yml" \
  --env "npm" \
  --allow-publish \
  --yes
```

و بررسی کن:

```bash
npm trust list "@digitalafarin/cms-admin"
```

از نسخه‌های بعدی، هر سه npm package می‌توانند از GitHub Actions OIDC منتشر شوند.

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
- `apps/admin/package.json`
- `packages/cms-next/package.json`
- `packages/cms-cli/package.json`
- `packages/cms-django/pyproject.toml`
- `packages/cms-django/src/digitalafarin_cms/__init__.py`

برای تغییر نسخه:

```bash
npm run version:set -- 0.4.0
npm run check:versions
```

`version:set` metadata نسخه داخل `package-lock.json` و همه packageهای publishable را sync می‌کند.

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
- `npm pack` واقعی SDK، CLI و Admin
- نصب tarballها در consumer تمیز
- import exportهای SDK
- اجرای binary نصب‌شده CLI
- اجرای binary نصب‌شده Admin
- scaffold واقعی Admin زیر `/cms`
- وجود `/cms/api-proxy` و فایل Nginx تولیدشده
- اجرای مسیر CLI -> Admin scaffold

## 6. ایجاد Release v0.4.0

ترتیب صحیح برای v0.4.0:

1. Release Prep را در `main` merge کن.
2. `@digitalafarin/cms-admin@0.4.0` را یک‌بار دستی bootstrap کن.
3. Trusted Publisher پکیج Admin را ثبت و با `npm trust list` بررسی کن.
4. فقط بعد از این مراحل tag را بساز.

```bash
git checkout main
git pull --ff-only
npm run check:versions
git tag v0.4.0
git push origin v0.4.0
```

Tag `v*` workflow زیر را اجرا می‌کند:

```text
.github/workflows/release.yml
```

Workflow:

1. نسخه Tag را با package version تطبیق می‌دهد.
2. npm tarballهای SDK/CLI/Admin را smoke-test می‌کند.
3. Python distribution را build و smoke-test می‌کند.
4. اگر نسخه روی PyPI موجود نباشد، با OIDC منتشر می‌کند.
5. اگر نسخه SDK/CLI روی npm موجود نباشد، با Trusted Publishing منتشر می‌کند.
6. Admin bootstrap‌شده را پیدا می‌کند و برای همین نسخه skip می‌کند؛ در نسخه‌های بعدی Admin هم با Trusted Publishing منتشر می‌شود.
7. در پایان GitHub Release می‌سازد.

## 7. بررسی پس از انتشار

Python:

```bash
python -m venv .venv-release-test
# activate environment
pip install "digitalafarin-cms[all]==0.4.0"
python -c "import digitalafarin_cms; print(digitalafarin_cms.__version__)"
```

npm:

```bash
npm view "@digitalafarin/cms-next@0.4.0" version
npm view "@digitalafarin/cms-cli@0.4.0" version
npm view "@digitalafarin/cms-admin@0.4.0" version
```

Admin scaffold:

```bash
npx "@digitalafarin/cms-admin@0.4.0" scaffold \
  --dir cms-admin-test \
  --base-path /cms \
  --api-url https://api.example.com/api/cms/v1 \
  --port 3001 \
  --skip-install
```

و `latest` را بررسی کن:

```bash
npm dist-tag ls "@digitalafarin/cms-next"
npm dist-tag ls "@digitalafarin/cms-cli"
npm dist-tag ls "@digitalafarin/cms-admin"
```

## 8. معماری Admin در v0.4

Admin دیگر لازم نیست روی subdomain جدا باشد. الگوی توصیه‌شده:

```text
https://example.com/        -> سایت عمومی Next.js
https://example.com/cms/    -> Admin Next.js
/cms/api-proxy/*            -> same-origin proxy داخل Admin
Django CMS API              -> api.example.com یا upstream داخلی
```

مرورگر مستقیماً به API subdomain درخواست نمی‌دهد؛ Next.js Admin درخواست را server-side به `DIGITALAFARIN_CMS_API_URL` ارسال می‌کند.

## 9. نکته Search Console

مدل داده و Import/Content Decay برای داده‌های Search Console وجود دارد، اما Google OAuth credential و sync خودکار GSC هنوز جزو Community Edition نیست. در مستندات انتشار نباید این قابلیت به‌عنوان اتصال خودکار Google معرفی شود.

## 10. مدل انتشار Community / Commercial

Community Edition تحت Apache-2.0 قابل استفاده است. قابلیت‌هایی مانند Managed Cloud، Billing، AI SEO پیشرفته، Agency/White-label، Google OAuth مدیریت‌شده و Enterprise Support می‌توانند در سرویس‌ها یا packageهای تجاری جدا توسعه پیدا کنند.
