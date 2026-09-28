# ارتقا از 0.6.0 به 0.7.0 و اتصال به سایت موجود

این نسخه اتصال مسیرها، فهرست عمومی، پیش‌نمایش و مدیا را اصلاح می‌کند. نصب SDK یا ساخت catch-all به‌تنهایی صفحات موجود `/blog` و `/blog/[slug]` را به CMS وصل نمی‌کند؛ این صفحات در Next اولویت دارند و باید loader آن‌ها صریحاً متصل شود.

## ترتیب ارتقا

ابتدا از دیتابیس و فایل‌های میزبان backup بگیرید. تغییرات را در staging بررسی کنید. انتشار این تغییرات در registry جدا از آماده‌سازی سورس است؛ دستورات registry زیر پس از انتشار نسخه قابل استفاده‌اند.

```bash
# در محیط مجازی بک‌اند
python -m pip install --upgrade 'digitalafarin-cms[all]==0.7.0'
python manage.py migrate
python manage.py check
python manage.py cms_doctor

# در ریشه frontend
npm install --save-exact @digitalafarin/cms-next@0.7.0 @digitalafarin/cms-admin@0.7.0
npx @digitalafarin/cms-cli@0.7.0 init --frontend . --skip-install --with-collection --collection-path /blog --content-type post
```

اگر CLI را از ریشه‌ای با بک‌اند اجرا می‌کنید، برای جلوگیری از نصب یا migration تکراری `--skip-migrate` هم بدهید. برای آزمایش قبل از انتشار، wheel و tarballهای محلی تولیدشده توسط `npm run pack:all` را به‌جای نسخهٔ registry نصب کنید؛ فایل‌های `site-packages` و `node_modules` مصرف‌کننده را ویرایش نکنید.

CLI مسیرهای موجود، از جمله route groupها را در `.digitalafarin/integration.json` ثبت می‌کند. فایل جدیدِ بی‌تعارض ساخته می‌شود؛ جایگزین route موجود فقط در `.digitalafarin/proposals/` نوشته می‌شود. فایل‌های پیشنهادی را بررسی و با طراحی سایت تطبیق دهید، سپس:

```bash
npx @digitalafarin/cms-cli@0.7.0 apply-integration --frontend .
npx @digitalafarin/cms-cli@0.7.0 doctor --frontend .
```

`apply-integration` hash فایل اصلی را با زمان تهیهٔ پیشنهاد مقایسه می‌کند؛ در صورت تغییر فایل متوقف می‌شود. نسخهٔ قدیمی صفحه کنار همان route با نام `cms-legacy-page.tsx` یا پسوند اصلی باقی می‌ماند تا importهای نسبی سالم بمانند. از اجرای این مرحله روی پیشنهاد بررسی‌نشده خودداری کنید. وجود plan قبلی باعث بازنویسی آن نمی‌شود؛ برای طراحی دوباره، آن را آرشیو و `init` را اجرا کنید.

برای ادمین embedded، نصب نسخهٔ جدید فایل‌های کپی‌شده را تازه نمی‌کند. تغییرات سفارشی را مقایسه و backup کنید، سپس بازتولید صریح را اجرا کنید:

```bash
npx @digitalafarin/cms-admin@0.7.0 embed --frontend . --base-path /cms --api-url https://api.example.com/api/cms/v1 --force
```

`--force` فایل‌های تولیدی ادمین را جایگزین می‌کند. برای ادمین standalone نیز scaffold جدید را در پوشهٔ جدا بسازید و تنظیمات خود را منتقل کنید.

## migration و آدرس محتوا

Migration `digitalafarin_cms_content.0002_contententry_path_mode_and_more` دو فیلد `collection_path` و `entry_path_pattern` را به Content Type و `path_mode` را به محتوا اضافه می‌کند و slug فارسی را می‌پذیرد. فیلدهای قبلی حذف نمی‌شوند؛ مقدار مسیر هیچ رکوردی بازنویسی نمی‌شود. رکوردهای موجود `path_mode=manual` می‌گیرند. این migration افزودنی است، اما زمان قفل schema را متناسب با حجم دیتابیس staging بررسی کنید.

در Content Type Builder برای Post یا هر نوع سفارشی تنظیم کنید:

```json
{"collection_path":"/blog","entry_path_pattern":"/blog/{slug}/"}
```

- مسیر فهرست `/blog` به مجموعه تعلق دارد، نه به یک مقاله. ساخت Entry روی آن رد می‌شود؛ اگر قبلاً Entry یا redirect آن URL را گرفته باشد، ابتدا انتقال کنترل‌شده انجام دهید.
- الگو باید دقیقاً یک segment به نام `{slug}` داشته باشد و داخل مسیر مجموعه قرار بگیرد. برای Page و homepage هر دو تنظیم خالی می‌مانند. مسیر `/` فقط با انتخاب دستی ساخته می‌شود.
- محتوای جدید با الگوی تنظیم‌شده خودکار است. مقدار `/blog/` که فرم قدیمی ارسال کند در حالت خودکار به `/blog/<slug>/` تبدیل می‌شود. مسیر سفارشی جدید نیازمند `path_mode=manual` است.
- آدرس نهایی در backend محاسبه می‌شود و ادمین با `POST content/entries/path-preview/` آن را پیش از ذخیره نمایش می‌دهد.
- تغییر slug در حالت دستی آدرس را تغییر نمی‌دهد. تغییر slug در حالت خودکار مسیر را دوباره محاسبه می‌کند. تغییر الگوی Content Type به‌تنهایی آدرس‌های موجود را جابه‌جا نمی‌کند.
- slash پایانی و Unicode NFC در مسیرهای جدید یکسان می‌شوند. encoded slash، backslash، traversal، double encoding و مسیرهای زیرساختی رد می‌شوند. URLهای قدیمیِ encode‌شده یا بدون slash تا زمان انتقال صریح حفظ می‌شوند.
- تغییر آدرس محتوایی که منتشر شده، به‌صورت اتمیک redirect دائمی می‌سازد. redirectهای قبلی به مقصد جدید هدایت می‌شوند. برای بازاستفاده از URL اشغال‌شده توسط redirect باید ابتدا آن redirect را بررسی و غیرفعال کنید.
- canonical خودکار، لینک کارت و sitemap از مسیر نهایی استفاده می‌کنند. canonical خارجیِ صریحِ SEO حفظ می‌شود؛ self-canonical صریح هنگام جابه‌جایی به‌روزرسانی می‌شود.

برای مهاجرت تدریجی یک رکورد قدیمی، ابتدا نتیجهٔ `path-preview` با `id` و `path_mode=auto` را بررسی کنید، سپس همان تغییر را روی Entry ذخیره کنید. bulk update با ORM از قواعد save، redirect و revision عبور می‌کند و برای مهاجرت URL مناسب نیست. برای rollback کد، ستون‌های جدید را نگه دارید؛ rollback schema لازم نیست. بازگرداندن URLهای منتقل‌شده یک عملیات مستقل با بررسی redirectهاست.

## قرارداد API عمومی و اتصال loader

```text
GET /api/cms/v1/content/public-entries/?site=example.com&content_type=post&search=seo&category=guides&page=1&page_size=20
GET /api/cms/v1/content/resolve/?site=example.com&path=/blog/article/
```

فهرست فقط سایت فعال، سازمان فعال، نوع عمومی و محتوای `published` را می‌خواند. `content_type`، `category` و `tag` مقدار slug دارند. جست‌وجو روی title و excerpt است. `page_size` از ۱ تا ۱۰۰ است؛ ترتیب publication/creation/id پایدار است و صفحهٔ خارج از بازه 404 دارد. پاسخ شامل `count`, `page`, `page_size`, `next`, `previous`, `results` است؛ next/previous شمارهٔ صفحه‌اند. ساختار resolver قبلی حفظ شده و `content.url` به آن اضافه می‌شود.

```tsx
import { createCmsClientFromEnv, toNextMetadata } from '@digitalafarin/cms-next';
const cms = createCmsClientFromEnv();

// loader فهرست موجود
const entries = await cms.listEntries({ content_type: 'post', page: 1 });
// لینک کارت: entry.path، کلید حذف تکرار: مسیر نهایی، نه slug به‌تنهایی

// loader جزئیات موجود؛ fallback فقط برای 404 عمومی
const content = await cms.resolveForRoute('/blog/article/', { previewToken });
if (content) {
  const metadata = toNextMetadata(content);
  // محتوا و metadata را در قالب خود نمایش دهید.
} else {
  // redirect CMS را بررسی کنید، سپس loader قدیمی میزبان را فراخوانی کنید.
}
```

`getEntries` قدیمی برای API مدیریتی و احراز هویت باقی مانده است؛ برای سایت عمومی از `listEntries` استفاده کنید. نیازی به JWT ادمین در سایت عمومی نیست. بدنهٔ خطای upstream در `CmsRequestError` نگهداری نمی‌شود؛ فقط status و پیام عمومی در دسترس است.

adapter پیشنهادی CLI در جزئیات اول CMS را می‌خواند، سپس redirect و بعد محتوای قدیمی. پیش‌نمایش، 403، 500 و قطع ارتباط هرگز به محتوای قدیمی fallback نمی‌کنند. در فهرست، CMS تنها منبع pagination است؛ فهرست قدیمی در `?cms_source=legacy` در دسترس می‌ماند. دو آرایهٔ paginated ادغام نمی‌شوند؛ این کار count و ترتیب را نادرست می‌کند. برای مهاجرت ترکیبی بزرگ، ابتدا legacy را با شناسهٔ پایدار وارد CMS کنید یا یک API تجمیعی واحد بسازید. routeهای catch-all پیچیده و چند route هم‌نام نیاز به اتصال دستی loader دارند و doctor آن‌ها را اتصال کامل تلقی نمی‌کند.

خواندن SDK به‌طور پیش‌فرض `no-store` و صفحه‌های تولیدی `force-dynamic` هستند؛ بنابراین publish/edit/move/unpublish در درخواست بعدی دیده می‌شود. برای نصب 0.6.0، مقدار `revalidate: 60` را از adapter کپی‌شده حذف کنید. cache اختیاری با `createCmsClientFromEnv({revalidate:60})` تا ۶۰ ثانیه کهنگی دارد و ممکن است محتوای لغو انتشار را موقتاً نشان دهد؛ برای محتوایی که حذف فوری لازم دارد فعالش نکنید. این نسخه webhook invalidation جدیدی اضافه نمی‌کند. cache شبکه/CDN میزبان هم باید سیاست no-store را رعایت کند.

## پیش‌نمایش روی routeهای موجود

در config موجود Next wrapper را اعمال کنید؛ exportها و middleware سفارشی خود را حفظ کنید:

```ts
import { withDigitalAfarinCms } from '@digitalafarin/cms-next/config';
const nextConfig = { /* تنظیمات فعلی میزبان */ };
export default withDigitalAfarinCms(nextConfig);
```

در config تابعی، wrapper را روی object نهاییِ خروجی تابع اعمال کنید. CLI config سفارشی را خودکار بازنویسی نمی‌کند. wrapper با `beforeFiles` درخواست دارای `cms_preview` را به renderer اختصاصی می‌برد؛ route فیزیکی آن `app/digitalafarin-cms-preview/[[...cms_path]]/page.tsx` است. این نام عمداً بدون prefix خصوصی Next انتخاب شده تا رفتار route در buildهای مختلف پایدار باشد.

امضا در Django با site، entry، path و انقضا بررسی می‌شود. عمر پیش‌فرض ۹۰۰ ثانیه است (`DIGITALAFARIN_CMS_PREVIEW_MAX_AGE`). لینک‌های قدیمی 0.6.0 که path امضاشده ندارند باید دوباره ساخته شوند. تغییر مسیر نیز لینک قبلی را نامعتبر می‌کند. پاسخ API پیش‌نمایش `private,no-store`، `X-Robots-Tag: noindex,nofollow` و `Referrer-Policy: no-referrer` دارد؛ HTML نیز همین محافظت‌ها و metadata را دارد. لینک نامعتبر پیام واضح نمایش می‌دهد.

redirectهای `next.config` و middleware/proxy میزبان قبل از rewrite اجرا می‌شوند. auth را حذف نکنید؛ فقط redirectهای محتوایی را طوری ترکیب کنید که درخواست پیش‌نمایش معتبر بتواند به renderer برسد. این بخش را روی `/` و یک route موجود امتحان کنید. access logهای وب‌سرور نباید query توکن پیش‌نمایش را ذخیره کنند.

## سه نشانی مستقل

| تنظیم | کاربرد |
|---|---|
| `DIGITALAFARIN_CMS_URL` در Next | آدرس API سرور، مثلاً `http://django:8000/api/cms/v1` |
| `DIGITALAFARIN_CMS_SITE` در Next | مقدار دقیق `Site.domain`، مثلاً `example.com` |
| `Site.settings.frontend_url` در Django | مبدأ عمومی صفحه‌ها، preview و sitemap، مثلاً `https://example.com` |
| `DIGITALAFARIN_CMS_MEDIA_UPSTREAM` در Next | مبدأ ثابت فایل، همراه prefix، مثلاً `http://storage:8080/media/` |
| `DIGITALAFARIN_CMS_MEDIA_PUBLIC_URL` در Django | نشانی قابل مصرف مرورگر، `/media/` یا `https://cdn.example.com/assets/` |
| `DIGITALAFARIN_CMS_MEDIA_LEGACY_ORIGINS` در Django | لیست مبدأهای قدیمی که صریحاً به media base جدید نگاشت می‌شوند |
| `DIGITALAFARIN_CMS_API_URL` در ادمین | upstream پروکسی API ادمین؛ مستقل از public media |

مقادیر Django را صریحاً از محیط به settings منتقل کنید؛ نمونه:

```python
import os
MEDIA_URL = '/media/'
DIGITALAFARIN_CMS_MEDIA_PUBLIC_URL = os.getenv('DIGITALAFARIN_CMS_MEDIA_PUBLIC_URL', '/media/')
DIGITALAFARIN_CMS_MEDIA_LEGACY_ORIGINS = [
    value.strip() for value in os.getenv('DIGITALAFARIN_CMS_MEDIA_LEGACY_ORIGINS', '').split(',') if value.strip()
]
```

در same-origin، route اختصاصی `/media/[...path]` درخواست را به upstream ثابت می‌برد و قبل از catch-all صفحه انتخاب می‌شود. کوئری `url=` مقصد را عوض نمی‌کند؛ cookie و Authorization ارسال نمی‌شوند، traversal رد می‌شود و redirect upstream دنبال نمی‌شود. فایل ناموجود 404 می‌ماند؛ HTML خطای storage برگردانده نمی‌شود. وب‌سرور storage باید فایل‌ها را واقعاً سرو کند؛ `runserver` فقط در توسعه و با تنظیم URL مناسب media را ارائه می‌دهد.

برای CDN یا storage خارجی، media public base را تنظیم کنید. URL کامل storage که مبدأش در legacy origins نیست حفظ می‌شود. تصاویر block، Tiptap JSON/HTML، custom field تصویر شاخص و Media Picker در خروجی تبدیل می‌شوند؛ JSON ذخیره‌شده با migration بازنویسی نمی‌شود. اگر نشانی ذخیره‌شدهٔ قدیمی `http://localhost:8000/media/...` است، همان origin را صریحاً به legacy origins اضافه کنید. در production آدرس localhost مدیا بدون mapping به مرورگر صادر نمی‌شود و تنظیم public media localhost خطای system check دارد.

ادمین standalone روی دامنهٔ متفاوت باید از public media URL مطلق و قابل‌دسترسی آن مرورگر استفاده کند؛ `/media/` به دامنهٔ همان ادمین اشاره می‌کند. برای `next/image` دامنهٔ CDN را در `images.remotePatterns` میزبان مجاز کنید؛ renderer پیش‌فرض از `img` استفاده می‌کند.

## Wagtail و doctor

رسیدن `/media/...` به resolver خطای wiring فرانت‌اند است. تبدیل یک 404 به 500 به دلیل نبود `wagtailcore_site` مشکل مستقلی در نصب Wagtail است. `apply_defaults(globals())` را پس از تعریف `MIDDLEWARE` فراخوانی کنید؛ middleware رسمی redirect Wagtail با wrapper محدود جایگزین می‌شود که فقط CMS API و مسیر media را کنار می‌گذارد. رفتار صفحات دیگر و خطاهای واقعی دیتابیس حفظ می‌شوند.

`python manage.py cms_doctor` ترتیب URLها، migrationهای معوق و نبود جدول Wagtail را بررسی می‌کند. اگر Wagtail استفاده می‌شود migrationهایش را اجرا کنید؛ اگر استفاده نمی‌شود apps و middleware آن را آگاهانه حذف کنید. API include باید قبل از catch-all مربوط به Wagtail باشد؛ نصب قدیمی CLI ممکن است آن را به انتهای urlpatterns افزوده باشد و باید ترتیب آن اصلاح شود. مشکل را با catch عمومی دیتابیس یا پاسخ 200 پنهان نکنید.

## آزمون پذیرش

روی staging با homepage و `/blog/[slug]` موجود: Draft بسازید، نبود آن در API عمومی را بررسی کنید، preview را در همان route باز کنید، تصویر upload کنید، منتشر کنید و حضور در فهرست/جزئیات/canonical/sitemap را ببینید. سپس slug را تغییر دهید، redirect قدیمی را بررسی کنید، انتشار را لغو کنید و حذف از فهرست و 404 جزئیات را ببینید. یک تصویر ناموجود، token منقضی، مسیر فارسی و tenant دیگر را هم امتحان کنید. پس از اعمال adapter، homepage و مقالهٔ legacy باید همچنان رفتار قبلی را داشته باشند.

اجرای تست‌های مخزن:

```bash
# از packages/cms-django با PYTHONPATH=src:.
python -m django test tests --settings=tests.settings
python -m django makemigrations --check --dry-run --settings=tests.settings
# از ریشه
npm run test:integration
npm run typecheck
npm run build:admin
npm run test:e2e:host
```

روی Windows مقدار PYTHONPATH برابر `src;.` است. برای مرورگر سیستمی Chrome، `CMS_E2E_BROWSER_CHANNEL=chrome` را تنظیم کنید؛ در CI مرورگر Playwright را نصب کنید. fixture مرورگر دیتابیس و فایل‌های موقت مستقل می‌سازد و از دیتابیس مصرف‌کننده استفاده نمی‌کند.
