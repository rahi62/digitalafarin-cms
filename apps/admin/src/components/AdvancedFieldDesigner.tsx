"use client";

import type { CustomFieldDefinition, CustomFieldType } from "@/components/CustomFieldsEditor";

const choices: Array<{ type: CustomFieldType; label: string }> = [
  { type: "text", label: "متن" }, { type: "textarea", label: "متن بلند" },
  { type: "number", label: "عدد" }, { type: "boolean", label: "بله/خیر" },
  { type: "date", label: "تاریخ" }, { type: "datetime", label: "تاریخ و ساعت" },
  { type: "url", label: "لینک" }, { type: "email", label: "ایمیل" },
  { type: "select", label: "انتخابی" }, { type: "media", label: "رسانه" },
  { type: "json", label: "JSON" },
  { type: "relation", label: "ارتباط با محتوا" },
  { type: "group", label: "گروه فیلد" }, { type: "repeater", label: "فیلد تکرارشونده" },
  { type: "gallery", label: "گالری" },
];

const makeField = (number: number): CustomFieldDefinition => ({
  key: "nested_" + number, label: "فیلد " + number, type: "text", required: false,
});

export default function AdvancedFieldDesigner({ field, onChange, depth = 0 }: {
  field: CustomFieldDefinition; onChange: (next: CustomFieldDefinition) => void; depth?: number;
}) {
  const type = field.type || "text";
  const nested = field.fields || [];
  const editableNested = type === "group" || type === "repeater";
  const patch = (data: Partial<CustomFieldDefinition>) => onChange({ ...field, ...data });
  const updateChild = (index: number, next: CustomFieldDefinition) =>
    patch({ fields: nested.map((current, pos) => pos === index ? next : current) });
  return <div className="cmsDesignerAdvanced">
    {type === "relation" && <div className="field">
      <label>Slug نوع محتوای مقصد</label>
      <input dir="ltr" required value={field.target_content_type || ""} placeholder="destination"
        onChange={(event) => patch({ target_content_type: event.target.value.trim().toLowerCase() })} />
      <small>ارتباط فقط با رکوردهای همین سایت و نوع محتوای انتخابی مجاز است.</small>
    </div>}
    {(type === "repeater" || type === "gallery") && <div className="cmsDesignerLimits">
      <label className="field">حداقل تعداد
        <input type="number" min={0} max={50} value={field.min_items ?? 0}
          onChange={(event) => patch({ min_items: Number(event.target.value) })} />
      </label>
      <label className="field">حداکثر تعداد
        <input type="number" min={0} max={50} value={field.max_items ?? 50}
          onChange={(event) => patch({ max_items: Number(event.target.value) })} />
      </label>
    </div>}
    {editableNested && <div className="cmsDesignerNested">
      <div className="cmsDesignerNestedHeader"><strong>فیلدهای داخلی</strong>
        <button type="button" className="btn secondary small" disabled={nested.length >= 50 || depth >= 3}
          onClick={() => patch({ fields: [...nested, makeField(nested.length + 1)] })}>+ افزودن فیلد داخلی</button>
      </div>
      {nested.length === 0 && <p className="cmsDesignerEmpty">ابتدا یک فیلد داخلی بسازید.</p>}
      {nested.map((child, index) => <div className="cmsDesignerNestedRow" key={index}>
        <div className="cmsDesignerNestedRowTop">
          <span>فیلد {(index + 1).toLocaleString("fa-IR")}</span>
          <button type="button" className="btn secondary small" onClick={() => patch({ fields: nested.filter((_, pos) => pos !== index) })}>حذف</button>
        </div>
        <div className="cmsDesignerNestedInputs">
          <label className="field">عنوان
            <input value={child.label || ""} onChange={(event) => updateChild(index, { ...child, label: event.target.value })} />
          </label>
          <label className="field">شناسه
            <input dir="ltr" value={child.key} onChange={(event) => updateChild(index, { ...child, key: event.target.value.replace(/[^a-zA-Z0-9_]/g, "") })} />
          </label>
          <label className="field">نوع
            <select value={child.type || "text"} onChange={(event) => updateChild(index, {
              ...child, type: event.target.value as CustomFieldType,
            })}>
              {choices.filter((item) => depth < 2 || !["group", "repeater"].includes(item.type))
                .map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
            </select>
          </label>
          <label className="cmsDesignerRequired"><input type="checkbox" checked={Boolean(child.required)}
            onChange={(event) => updateChild(index, { ...child, required: event.target.checked })} /> الزامی</label>
        </div>
        {child.type === "select" && <label className="field">گزینه‌ها (جداشده با کاما)
          <input value={(child.options || []).map((item) => typeof item === "string" ? item : item.value).join(", ")}
            onChange={(event) => updateChild(index, { ...child, options: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} />
        </label>}
        <AdvancedFieldDesigner field={child} depth={depth + 1} onChange={(next) => updateChild(index, next)} />
      </div>)}
    </div>}
  </div>;
}
