"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Workflow = {
  role: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  can_publish: boolean;
  can_schedule: boolean;
  can_submit_review: boolean;
  can_return_draft: boolean;
  can_unschedule: boolean;
};

type Props = {
  entryId: string;
  onUpdated: (entry: any) => void;
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  review: "In Review",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
};

function localInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function EditorialWorkflowPanel({ entryId, onUpdated }: Props) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    try {
      const data = await apiFetch<Workflow>(`/content/entries/${entryId}/workflow/`);
      setWorkflow(data);
      setScheduleAt(localInputValue(data.scheduled_at));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در بارگذاری workflow");
    }
  }

  useEffect(() => { load(); }, [entryId]);

  async function run(action: string, body: Record<string, unknown> = {}, success = "وضعیت محتوا به‌روزرسانی شد") {
    setBusy(action);
    setMessage("");
    try {
      const entry = await apiFetch<any>(`/content/entries/${entryId}/${action}/`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onUpdated(entry);
      setMessage(success);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در تغییر workflow");
    } finally {
      setBusy("");
    }
  }

  async function schedule() {
    if (!scheduleAt) {
      setMessage("زمان انتشار را انتخاب کنید");
      return;
    }
    const date = new Date(scheduleAt);
    if (Number.isNaN(date.getTime())) {
      setMessage("زمان انتشار نامعتبر است");
      return;
    }
    await run("schedule", { scheduled_at: date.toISOString() }, "انتشار زمان‌بندی شد");
  }

  if (!workflow) return <section className="panel editorialPanel">در حال بارگذاری Workflow...</section>;

  return (
    <section className="panel editorialPanel">
      <div className="editorialHeader">
        <div>
          <h2>Editorial Workflow</h2>
          <p>بررسی، انتشار و زمان‌بندی محتوا با توجه به نقش کاربری.</p>
        </div>
        <div className={`workflowStatus status-${workflow.status}`}>
          <strong>{statusLabels[workflow.status] || workflow.status}</strong>
          <span>{workflow.role || "unknown role"}</span>
        </div>
      </div>

      {message && <div className={message.includes("خطا") || message.includes("نامعتبر") || message.includes("انتخاب") ? "error" : "notice"}>{message}</div>}

      <div className="workflowFacts">
        <span><small>آخرین انتشار</small><strong>{dateLabel(workflow.published_at)}</strong></span>
        <span><small>زمان‌بندی</small><strong>{dateLabel(workflow.scheduled_at)}</strong></span>
        <span><small>دسترسی انتشار</small><strong>{workflow.can_publish ? "دارد" : "ندارد"}</strong></span>
      </div>

      <div className="workflowActions">
        {workflow.can_submit_review && workflow.status !== "review" && (
          <button type="button" className="btn secondary" disabled={Boolean(busy)} onClick={() => run("submit-review", {}, "برای بررسی ارسال شد")}>ارسال برای بررسی</button>
        )}
        {workflow.can_return_draft && workflow.status !== "draft" && (
          <button type="button" className="btn secondary" disabled={Boolean(busy)} onClick={() => run("return-draft", {}, "به Draft برگشت")}>بازگشت به Draft</button>
        )}
        {workflow.can_publish && workflow.status !== "published" && (
          <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => run("publish", {}, "منتشر شد")}>انتشار اکنون</button>
        )}
        {workflow.can_unschedule && (
          <button type="button" className="btn dangerBtn" disabled={Boolean(busy)} onClick={() => run("unschedule", {}, "زمان‌بندی لغو شد")}>لغو زمان‌بندی</button>
        )}
      </div>

      {workflow.can_schedule && workflow.status !== "published" && (
        <div className="scheduleBox">
          <div>
            <strong>Scheduled Publishing</strong>
            <span>زمان براساس timezone مرورگر شما به UTC تبدیل و ذخیره می‌شود.</span>
          </div>
          <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          <button type="button" className="btn secondary" disabled={Boolean(busy)} onClick={schedule}>زمان‌بندی انتشار</button>
        </div>
      )}

      {!workflow.can_publish && (
        <div className="workflowHint">نقش شما می‌تواند محتوا را ویرایش و برای بررسی ارسال کند، اما انتشار یا زمان‌بندی نیازمند Editor، SEO Manager، Admin یا Owner است.</div>
      )}
    </section>
  );
}
