export type ComponentSlotDraft = {
  id: string;
  component: string;
  route: string;
  props: Array<{ name: string; source: string; required: boolean }>;
};

export type RouteReportItem = {
  url: string;
  file: string;
  kind: "page" | "route";
  route_kind: string;
  reserved: boolean;
  parallel: boolean;
  intercepted: boolean;
};

export type SiteContentType = {
  id: string;
  site: string;
  name: string;
  slug: string;
  schema?: { fields?: FieldDefinition[] };
};

type FieldDefinition = { key: string; type?: string; fields?: FieldDefinition[] };

const identifier = /^[A-Za-z][A-Za-z0-9_]*$/;
const invalidIdentifiers = new Set(["__proto__", "constructor", "prototype"]);
const reserved = new Set(["api", "admin", "cms", "media", "_next", "static"]);

export const defaultPropSources = [
  { value: "content.title", label: "عنوان محتوا" },
  { value: "content.excerpt", label: "خلاصه محتوا" },
  { value: "content.slug", label: "شناسه آدرس" },
  { value: "content.path", label: "مسیر محتوا" },
  { value: "site.name", label: "نام سایت" },
  { value: "site.domain", label: "دامنه سایت" },
  { value: "site.language", label: "زبان سایت" },
  { value: "seo.title", label: "عنوان سئو" },
  { value: "seo.description", label: "توضیحات متا" },
  { value: "seo.og_title", label: "عنوان اشتراک‌گذاری" },
  { value: "seo.og_description", label: "توضیح اشتراک‌گذاری" },
  { value: "seo.og_image", label: "تصویر اشتراک‌گذاری" },
];

export function customFieldSources(fields: FieldDefinition[] = [], prefix = "", depth = 0): Array<{ value: string; label: string }> {
  if (depth > 6) return [];
  const result: Array<{ value: string; label: string }> = [];
  for (const field of fields) {
    if (!field || typeof field.key !== "string" || !identifier.test(field.key) || invalidIdentifiers.has(field.key)) continue;
    const path = prefix ? `${prefix}.${field.key}` : field.key;
    if (field.type === "group") {
      result.push(...customFieldSources(field.fields || [], path, depth + 1));
    } else if (field.type !== "repeater" && field.type !== "gallery") {
      // The v1 SDK reads own named properties, not array indices.
      result.push({ value: `content.custom_fields.${path}`, label: path });
    }
  }
  return result;
}

export function normalizeRegistryRoute(path: string): string | null {
  if (!path.startsWith("/") || path.startsWith("//") || /[?#%\\:{}]/.test(path) || /[\x00-\x20]/.test(path)) return null;
  const parts = path.split("/").filter(Boolean);
  if (parts.some((item) => item === "." || item === "..") || (parts[0] && reserved.has(parts[0].toLowerCase()))) return null;
  return parts.length ? `/${parts.join("/")}/` : "/";
}

export function eligibleRoute(item: RouteReportItem) {
  return item.kind === "page" && !item.reserved && !item.parallel && !item.intercepted &&
    item.route_kind === "static" && normalizeRegistryRoute(item.url) !== null;
}

export function validateComponentSlots(slots: ComponentSlotDraft[], allowedRoutes: RouteReportItem[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const [index, slot] of slots.entries()) {
    const name = `اتصال ${index + 1}`;
    if (!identifier.test(slot.id) || invalidIdentifiers.has(slot.id)) errors.push(`${name}: شناسه نامعتبر است.`);
    if (!identifier.test(slot.component) || invalidIdentifiers.has(slot.component)) errors.push(`${name}: نام کامپوننت معتبر نیست.`);
    if (ids.has(slot.id)) errors.push(`${name}: شناسه تکراری است.`);
    ids.add(slot.id);
    const canonical = normalizeRegistryRoute(slot.route);
    if (!canonical || !allowedRoutes.some((route) => eligibleRoute(route) && normalizeRegistryRoute(route.url) === canonical)) {
      errors.push(`${name}: این مسیر در گزارش پروژه به‌صورت صفحه استاتیک مجاز وجود ندارد.`);
    }
    if (!slot.props.length) errors.push(`${name}: حداقل یک Props تعریف کنید.`);
    if (slot.props.length > 50) errors.push(`${name}: بیش از ۵۰ Props مجاز نیست.`);
    const keys = new Set<string>();
    for (const prop of slot.props) {
      if (!identifier.test(prop.name) || invalidIdentifiers.has(prop.name)) errors.push(`${name}: نام Props نامعتبر است.`);
      if (keys.has(prop.name)) errors.push(`${name}: نام Props تکراری است.`);
      keys.add(prop.name);
      if (!isAllowedBinding(prop.source)) errors.push(`${name}: منبع فیلد مجاز نیست: ${prop.source}`);
    }
  }
  if (slots.length > 100) errors.push("حداکثر ۱۰۰ اتصال مجاز است.");
  return errors;
}

export function isAllowedBinding(source: string): boolean {
  if (typeof source !== "string") return false;
  if (defaultPropSources.some((option) => option.value === source)) return true;
  const parts = source.split(".");
  return parts.length >= 3 && parts.length <= 9 &&
    parts[0] === "content" && parts[1] === "custom_fields" &&
    parts.slice(2).every((part) => identifier.test(part) && !invalidIdentifiers.has(part));
}

export function generateRegistryCode(slots: ComponentSlotDraft[]): string {
  const serialized = slots.map((slot) => ({
    id: slot.id,
    component: slot.component,
    route: normalizeRegistryRoute(slot.route) || slot.route,
    props: Object.fromEntries(slot.props.map((prop) => [prop.name, prop.source])),
    required: slot.props.filter((prop) => prop.required).map((prop) => prop.name),
  }));
  return [
    'import { defineCmsComponentRegistry } from "@digitalafarin/cms-next";',
    "",
    "// Generated by DigitalAfarin CMS Admin. Review and commit in your Next.js project.",
    "export const cmsComponents = defineCmsComponentRegistry(",
    JSON.stringify(serialized, null, 2) + ");",
    "",
  ].join("\n");
}
