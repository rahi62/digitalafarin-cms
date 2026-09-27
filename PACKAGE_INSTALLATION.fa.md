# نصب DigitalAfarin CMS 0.5.0 به‌صورت Package

DigitalAfarin CMS برای اضافه‌شدن به پروژه‌های Django REST + Next.js طراحی شده و لازم نیست سورس CMS را داخل هر پروژه کپی کنید.

## پکیج‌ها

```text
PyPI
└── digitalafarin-cms
    ├── Django models + migrations
    ├── DRF APIs
    ├── Content / SEO / Media / Redirect / Schema
    ├── Revisions / workflow / audit
    └── JWT endpoints

npm
├── @digitalafarin/cms-next
│   ├── CMS client
│   ├── metadata / JSON-LD helpers
│   ├── safe rich-text renderer
│   └── TypeScript contracts
│
├── @digitalafarin/cms-cli
│   └── نصب و wiring خودکار backend + public frontend
│
└── @digitalafarin/cms-admin
    └── پنل مدیریت Next.js با Professional Tiptap Editor
```

## مسیر پیشنهادی برای یک سایت جدید

از ریشه پروژه:

```bash
npx @digitalafarin/cms-cli@0.5.0 init \
  --backend backend \
  --frontend frontend \
  --with-public-route
```

این دستور backend و SDK را نصب و wire می‌کند و در صورت نبود conflict، route عمومی CMS را برای URLهای ساخته‌شده در پنل ایجاد می‌کند.

اگر frontend از قبل root catch-all دارد، `--with-public-route` را حذف کنید و `cms.resolve()` را داخل route فعلی ادغام کنید. CLI عمداً route موجود را overwrite نمی‌کند.

## نصب پنل مدیریت

```bash
npx @digitalafarin/cms-admin@0.5.0 scaffold \
  --dir cms-admin \
  --base-path /cms \
  --api-url https://api.example.com/api/cms/v1 \
  --port 3001
```

پنل تولیدشده شامل Professional Editor، Media Library و same-origin API proxy است.

## متغیرهای محیطی frontend

```env
DIGITALAFARIN_CMS_URL=https://api.example.com/api/cms/v1
DIGITALAFARIN_CMS_SITE=example.com
```

## متغیرهای محیطی Admin

```env
NEXT_PUBLIC_DIGITALAFARIN_CMS_ADMIN_BASE_PATH=/cms
NEXT_PUBLIC_API_URL=/cms/api-proxy
DIGITALAFARIN_CMS_API_URL=https://api.example.com/api/cms/v1
PORT=3001
```

## نصب دستی backend

```bash
pip install "digitalafarin-cms[all]==0.5.0"
```

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
python manage.py check
```

## نصب دستی SDK در Next.js

```bash
npm install @digitalafarin/cms-next@0.5.0
```

`.env.local`:

```env
DIGITALAFARIN_CMS_URL=http://localhost:8000/api/cms/v1
DIGITALAFARIN_CMS_SITE=example.com
```

نمونه client:

```ts
import { createCmsClientFromEnv } from "@digitalafarin/cms-next";

export const cms = createCmsClientFromEnv({ revalidate: 60 });
```

## Rich Text در سایت عمومی

متن Professional Editor به‌صورت block ساختاریافته `rich_text` ذخیره می‌شود. `data.doc` منبع اصلی Tiptap JSON است و frontend بهتر است به‌جای اعتماد مستقیم به HTML ذخیره‌شده، از renderer امن SDK استفاده کند:

```tsx
import {
  isCmsRichTextBlock,
  renderCmsRichTextHtml,
} from "@digitalafarin/cms-next";

if (isCmsRichTextBlock(block)) {
  return (
    <div
      dangerouslySetInnerHTML={{
        __html: renderCmsRichTextHtml(block),
      }}
    />
  );
}
```

route عمومی‌ای که CLI با `--with-public-route` می‌سازد همین الگو را رعایت می‌کند.

## تست قبل از production

```bash
cd backend
python manage.py migrate
python manage.py check

cd ../frontend
npm run build

cd ../cms-admin
npm run typecheck
npm run build
```

سپس این موارد را بررسی کنید:

- `/cms/login` باز شود.
- یک Draft با Professional Editor ساخته شود.
- رفت‌وبرگشت Standard → Advanced → Standard باعث حذف محتوا نشود.
- تصویر از Media Library درج شود.
- Preview و Publish کار کند.
- URL عمومی محتوای CMS به 404 نخورد.
- SEO metadata و JSON-LD درست باشند.
- یک Redirect تست شود.
- routeهای اختصاصی قبلی سایت همچنان سالم باشند.

برای راهنمای کامل نصب سایت جدید، `docs/INSTALL_NEW_SITE.md` را ببینید. برای ارتقا از نسخه‌های 0.4.x از `docs/UPGRADING.md` استفاده کنید.
