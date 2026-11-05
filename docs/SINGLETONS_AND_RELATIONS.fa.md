# Singleton/Collection و کنترل وابستگی محتوا — گزارش توسعه

**وضعیت:** شاخه `feat/cms-singletons-and-relation-integrity`، PR #57؛ هنوز Merge/Deploy/Publish نشده است.

## Singleton / Collection
- `ContentTypeDefinition.kind` دو مقدار دارد: `collection` (پیش‌فرض همه نوع‌محتوای موجود) و `singleton`.
- برای نوع Singleton فقط یک `ContentEntry` مجاز است؛ فیلد `singleton_slot` با `OneToOneField` محدودیت را در دیتابیس اعمال می‌کند.
- با Migration افزایشی 0004، رکوردهای موجود به‌عنوان Collection باقی می‌مانند؛ هیچ رکوردی حذف یا منتقل نمی‌شود.
- Singleton از مسیر دستی خود محتوا استفاده می‌کند؛ `collection_path` و `entry_path_pattern` برای آن معتبر نیستند.
- تا زمانی که نوع محتوا رکورد دارد، تغییر Collection↔Singleton مسدود است؛ تبدیل باید Migration صریح و قابل بازگشت داشته باشد.
- مسیر `GET /content/types/{id}/singleton-entry/` رکورد یکتا را برای پنل معرفی می‌کند؛ ساخت فرم جدید هنگام وجود رکورد ممنوع است.
- این قابلیت جایگزین یا مالک خودکار Routeهای Next.js نیست؛ صفحات اختصاصی میزبان بدون تغییر باقی می‌مانند.

## Referential integrity
- حذف از API برای رکوردهای دارای نسخه عمومی منتشرشده ممنوع است. ابتدا باید Unpublish در گردش کار انجام شود.
- حذف رکوردی که در Relation (حتی در Group/Repeater یا Snapshot منتشرشده) استفاده شده مسدود می‌شود؛ API فهرست نمونه منابع وابسته را بازمی‌گرداند.
- تغییر Slug نوع محتوایی که Schemaهای دیگر به آن اشاره دارند یا حذف آن نوع بدون رفع روابط ممنوع است.
- بررسی وابستگی فعلاً با اسکن محدود به **یک سایت** انجام می‌شود. برای سایت‌های بزرگ، مرحله بعدی ایجاد جدول/index رابطه‌ای برای کاهش هزینه Query است.
- مسیرهای مستقیم ORM مثل `ContentEntry.objects.filter(...).delete()` از API guard عبور نمی‌کنند؛ برای حذف سراسری باید سرویس یکپارچه و Trash/Restore طراحی شود.
- Permissionهای TenantScopedViewSetMixin همچنان در endpointها اجرا می‌شوند.

## پیش از انتشار
- تأیید کامل CI روی SHA نهایی، مرور migration graph و اجرای staging backup/restore ضروری است.
- هنوز Trash/Restore، بازگشت نسخه زنده، relation indexing، Singleton navigation هوشمند و Component Registry کامل نشده‌اند.
- **هیچ Merge یا Deploy خودکار برای این PR انجام نشود.**
