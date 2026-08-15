# چک‌لیست اولین انتشار عمومی DigitalAfarin CMS 0.2.0

این Repository برای نام فرضی زیر آماده شده است:

```text
GitHub: rahi62/digitalafarin-cms
PyPI: digitalafarin-cms
npm: @digitalafarin/cms-next
npm: @digitalafarin/cms-cli
```

اگر GitHub owner یا npm scope متفاوت است، قبل از انتشار metadataها را تغییر بده.

## 1) GitHub

یک repository عمومی بساز و سورس ZIP را push کن:

```bash
git init
git add .
git commit -m "chore: public community release candidate"
git branch -M main
git remote add origin https://github.com/rahi62/digitalafarin-cms.git
git push -u origin main
```

صبر نکن که tag بزنی؛ اول Workflow `CI` روی branch اصلی باید سبز شود.

## 2) npm bootstrap

در npm scope `@digitalafarin` را در اختیار داشته باش و 2FA را فعال کن.

روی سیستم خودت از ریشه repository:

```bash
npm install
npm --workspace packages/cms-next run build
npm --workspace packages/cms-next pack --dry-run
npm --workspace packages/cms-cli pack --dry-run
```

اولین نسخه npm را دستی منتشر کن تا صفحه Settings هر package ساخته شود:

```bash
npm --workspace packages/cms-next publish --access public
npm --workspace packages/cms-cli publish --access public
```

## 3) npm Trusted Publisher

برای هر دو package در npm Settings > Trusted Publisher:

```text
Provider: GitHub Actions
Organization/User: digitalafarin
Repository: digitalafarin-cms
Workflow filename: release.yml
Environment: npm
Allowed action: npm publish
```

## 4) PyPI Pending Trusted Publisher

در PyPI > Account > Publishing یک Pending Publisher بساز:

```text
Project: digitalafarin-cms
Owner: digitalafarin
Repository: digitalafarin-cms
Workflow: release.yml
Environment: pypi
```

Pending Publisher نام پروژه را رزرو نمی‌کند؛ پس بعد از آماده‌شدن CI انتشار را به تعویق نینداز.

## 5) GitHub Environments

در Settings > Environments دو environment بساز:

```text
npm
pypi
```

در صورت تمایل approval protection فعال کن.

## 6) اولین release هماهنگ

قبل از tag:

```bash
npm run check:versions
```

سپس:

```bash
git add .
git commit -m "release: v0.2.0"
git tag v0.2.0
git push origin main --tags
```

Workflow `Release` نسخه PyPI را از طریق OIDC منتشر می‌کند. چون npm `0.2.0` در bootstrap ساخته شده، workflow وجود نسخه را تشخیص می‌دهد و آن را دوباره publish نمی‌کند.

## 7) تست از Registry

بعد از سبز شدن Release، در محیط تمیز:

```bash
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# Linux/macOS: source .venv/bin/activate
pip install "digitalafarin-cms[all]"
python -c "import digitalafarin_cms; print(digitalafarin_cms.__version__)"
```

و:

```bash
npm install @digitalafarin/cms-next
npx @digitalafarin/cms-cli doctor
```

## 8) نسخه بعدی

برای مثال 0.2.1:

```bash
npm run version:set -- 0.2.1
npm run check:versions
git add .
git commit -m "release: v0.2.1"
git tag v0.2.1
git push origin main --tags
```

از این مرحله به بعد PyPI و npm هر دو باید توسط `release.yml` و OIDC منتشر شوند و token دائمی publish لازم نیست.
