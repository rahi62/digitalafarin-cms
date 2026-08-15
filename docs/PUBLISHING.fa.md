# انتشار عمومی DigitalAfarin CMS

این فایل برای انتشار مخزن `rahi62/digitalafarin-cms` آماده شده است. اگر نام GitHub owner یا repository را تغییر دادی، قبل از انتشار فیلدهای `repository.url` در هر دو `package.json` را نیز دقیقاً با همان Repository هماهنگ کن.

## 1. ساخت GitHub Repository

Repository عمومی زیر را بساز:

```text
rahi62/digitalafarin-cms
```

سپس سورس را push کن:

```bash
git init
git add .
git commit -m "chore: prepare public community release"
git branch -M main
git remote add origin https://github.com/rahi62/digitalafarin-cms.git
git push -u origin main
```

## 2. npm

در npm حساب/Organization با scope زیر داشته باش:

```text
@digitalafarin
```

2FA را فعال کن.

قبل از اولین انتشار dependencyهای workspace را نصب و SDK را build کن، سپس محتویات packageها را بررسی کن:

```bash
npm install
npm --workspace packages/cms-next run build

npm --workspace packages/cms-next pack --dry-run
npm --workspace packages/cms-cli pack --dry-run
```

برای Bootstrap اولیه، اگر Package Settings هنوز به دلیل منتشرنشدن package در npm وجود ندارد، اولین نسخه را با حساب دارای 2FA به‌صورت مستقیم منتشر کن:

```bash
npm --workspace packages/cms-next publish --access public
npm --workspace packages/cms-cli publish --access public
```

پس از ایجاد packageها، در npm برای **هر دو package** به Settings > Trusted Publisher برو و GitHub Actions را تنظیم کن:

```text
Organization/User: digitalafarin
Repository: digitalafarin-cms
Workflow filename: release.yml
Environment: npm
Allowed action: npm publish
```

سپس در Publishing access، بعد از اینکه OIDC را با یک release تست کردی، token-based publishing را محدود/غیرفعال کن.

## 3. PyPI

در PyPI حساب و 2FA را فعال کن.

PyPI می‌تواند اولین project را با Pending Trusted Publisher نیز ایجاد کند. در Account > Publishing یک Pending Publisher برای این مشخصات بساز:

```text
PyPI project: digitalafarin-cms
GitHub owner: digitalafarin
Repository: digitalafarin-cms
Workflow: release.yml
Environment: pypi
```

بنابراین برای PyPI لازم نیست الزاماً اولین نسخه را دستی با API token آپلود کنی.

> نکته: Pending Trusted Publisher نام پروژه PyPI را رزرو نمی‌کند؛ تا زمان اولین publish شخص دیگری می‌تواند آن نام را ثبت کند.

## 4. GitHub Environments

در Repository > Settings > Environments دو environment بساز:

```text
pypi
npm
```

برای امنیت بیشتر می‌توانی approval protection روی این environmentها قرار بدهی.

## 5. اولین Release هماهنگ

نسخه‌ها باید در این فایل‌ها یکسان باشند:

- `package.json`
- `packages/cms-next/package.json`
- `packages/cms-cli/package.json`
- `packages/cms-django/pyproject.toml`
- `packages/cms-django/src/digitalafarin_cms/__init__.py`

ابزار repository این کار را خودکار می‌کند:

```bash
npm run version:set -- 0.2.0
npm run check:versions
```

بعد:

```bash
git add .
git commit -m "release: v0.2.0"
git tag v0.2.0
git push origin main --tags
```

Tag باعث اجرای `.github/workflows/release.yml` می‌شود.

## 6. پس از انتشار بررسی کن

```bash
python -m venv /tmp/dacms-test
# activate environment
pip install "digitalafarin-cms[all]"
python -c "import digitalafarin_cms; print(digitalafarin_cms.__version__)"
```

و در یک Next.js پروژه آزمایشی:

```bash
npm install @digitalafarin/cms-next
npx @digitalafarin/cms-cli doctor
```

## 7. مدل درآمدی

Repository عمومی فقط Community Edition است. کدهای Cloud، Billing، AI SEO، crawler پیشرفته، Agency/White-label و Enterprise را در repository/packageهای خصوصی جدا نگه دار.
