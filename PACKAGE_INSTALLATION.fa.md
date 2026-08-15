# نصب DigitalAfarin CMS به‌صورت Package

هدف این نسخه این است که CMS به پروژه‌های موجود Django REST + Next.js اضافه شود و لازم نباشد سورس `apps/` در هر پروژه کپی شود.

## معماری Package

```text
PyPI / pip
└── digitalafarin-cms
    ├── Django models + migrations
    ├── DRF APIs
    ├── SEO engine
    ├── content engine
    ├── media / redirect / schema / audit
    └── JWT endpoints

npm
└── @digitalafarin/cms-next
    ├── CMS client
    ├── Next.js metadata adapter
    ├── JSON-LD helpers
    └── TypeScript types

npm / npx
└── @digitalafarin/cms-cli
    └── نصب و wiring خودکار Django + Next.js
```

## حالت نهایی بعد از انتشار در Registry

در backend:

```bash
pip install digitalafarin-cms[all]
```

در frontend:

```bash
npm install @digitalafarin/cms-next
```

و برای wiring خودکار کل repository:

```bash
npx @digitalafarin/cms-cli init
```

اگر ساختار پروژه جدا باشد:

```bash
npx @digitalafarin/cms-cli init --backend backend --frontend frontend
```

CLI این کارها را انجام می‌دهد:

- نصب package پایتون
- اضافه‌کردن CMS به `INSTALLED_APPS`
- اضافه‌کردن API زیر `/api/cms/v1/`
- اجرای migrations
- نصب package نکست
- ساخت `.env.local`
- ساخت `lib/digitalafarin-cms.ts`

CLI عمداً routeهای فعلی سایت Next.js را overwrite نمی‌کند.

## نصب مستقیم از فایل‌های همین ZIP

تا قبل از انتشار رسمی روی PyPI/npm می‌توان خروجی‌های داخل `dist/` را مستقیم نصب کرد.

Backend:

```bash
pip install ./dist/python/digitalafarin_cms-0.2.0-py3-none-any.whl
```

Frontend:

```bash
npm install ./dist/npm/digitalafarin-cms-next-0.2.0.tgz
```

CLI:

```bash
npx ./dist/npm/digitalafarin-cms-cli-0.2.0.tgz init
```

## نصب دستی Django بدون CLI

در انتهای `settings.py`:

```python
from digitalafarin_cms.settings import apply_defaults
apply_defaults(globals())
```

در `urls.py`:

```python
from django.urls import include, path

urlpatterns += [
    path("api/cms/v1/", include("digitalafarin_cms.urls")),
]
```

سپس:

```bash
python manage.py migrate
```

## اتصال Next.js

`.env.local`:

```env
DIGITALAFARIN_CMS_URL=http://localhost:8000/api/cms/v1
DIGITALAFARIN_CMS_SITE=example.com
```

و سپس:

```ts
import { createCmsClientFromEnv } from "@digitalafarin/cms-next";

export const cms = createCmsClientFromEnv({ revalidate: 60 });
```

## انتشار رسمی

برای اینکه دستورات کوتاه `pip install digitalafarin-cms` و `npm install @digitalafarin/cms-next` روی هر سیستم کار کنند، packageها باید یک‌بار روی Registry منتشر شوند:

- Python package روی PyPI یا Registry خصوصی Python
- npm packages روی npm Registry یا Registry خصوصی npm

فایل‌های source و build-ready در `packages/` و artifactهای قابل نصب در `dist/` قرار دارند.
