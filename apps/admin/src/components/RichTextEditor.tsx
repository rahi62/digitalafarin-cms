"use client";

import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import MediaPicker, { MediaAsset } from "@/components/MediaPicker";
import type { RichTextDoc, RichTextValue } from "@/lib/editor-block-adapter";

type Props = {
  value: RichTextValue;
  onChange: (value: RichTextValue) => void;
  siteId?: string;
};

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}

function cleanPastedHtml(html: string) {
  return html
    .replace(/<\/?o:p[^>]*>/gi, "")
    .replace(/<(meta|link|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(meta|link)[^>]*\/?\s*>/gi, "")
    .replace(/\s(?:class|style|id|lang|data-[\w-]+)=(?:"[^"]*"|'[^']*')/gi, "");
}

function ToolbarButton({ active = false, disabled = false, title, onClick, children }: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={active ? "active" : ""}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({ value, onChange, siteId }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState({ href: "", newTab: false, nofollow: false, sponsored: false });
  const [metrics, setMetrics] = useState(() => ({ words: wordCount(value.text), minutes: value.text ? Math.max(1, Math.ceil(wordCount(value.text) / 200)) : 0 }));

  const extensions = useMemo(() => [
    StarterKit.configure({
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      },
    }),
    Highlight,
    TextAlign.configure({
      types: ["heading", "paragraph"],
      defaultAlignment: "right",
    }),
    Placeholder.configure({
      placeholder: "محتوای خود را اینجا بنویسید…",
    }),
    TableKit.configure({
      table: {
        resizable: true,
        HTMLAttributes: { class: "cmsRichTable" },
      },
    }),
    Image.configure({
      inline: false,
      allowBase64: false,
      resize: { enabled: true },
    }),
  ], []);

  const editor = useEditor({
    immediatelyRender: false,
    textDirection: "rtl",
    extensions,
    content: value.doc,
    editorProps: {
      attributes: {
        class: "cmsRichTextCanvas",
        dir: "rtl",
        spellcheck: "true",
      },
      transformPastedHTML: cleanPastedHtml,
    },
    onCreate({ editor }) {
      const text = editor.getText();
      const words = wordCount(text);
      setMetrics({ words, minutes: words ? Math.max(1, Math.ceil(words / 200)) : 0 });
    },
    onUpdate({ editor }) {
      const text = editor.getText();
      const words = wordCount(text);
      setMetrics({ words, minutes: words ? Math.max(1, Math.ceil(words / 200)) : 0 });
      onChange({
        doc: editor.getJSON() as RichTextDoc,
        html: editor.getHTML(),
        text,
      });
    },
  });

  const serializedValue = useMemo(() => JSON.stringify(value.doc), [value.doc]);

  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    if (current !== serializedValue) {
      editor.commands.setContent(value.doc, { emitUpdate: false });
      const text = editor.getText();
      const words = wordCount(text);
      setMetrics({ words, minutes: words ? Math.max(1, Math.ceil(words / 200)) : 0 });
    }
  }, [editor, serializedValue, value.doc]);

  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fullscreen]);

  if (!editor) return <div className="richEditorLoading">در حال آماده‌سازی ویرایشگر…</div>;
  const activeEditor = editor;

  function setDirection(dir: "rtl" | "ltr") {
    activeEditor.chain().focus().setTextDirection(dir).run();
  }

  function openLinkEditor() {
    const attrs = activeEditor.getAttributes("link") || {};
    const rel = typeof attrs.rel === "string" ? attrs.rel.split(/\s+/) : [];
    setLinkDraft({
      href: typeof attrs.href === "string" ? attrs.href : "",
      newTab: attrs.target === "_blank",
      nofollow: rel.includes("nofollow"),
      sponsored: rel.includes("sponsored"),
    });
    setLinkOpen(true);
  }

  function applyLink() {
    const href = linkDraft.href.trim();
    if (!href) {
      activeEditor.chain().focus().unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const rel = [
      linkDraft.nofollow ? "nofollow" : "",
      linkDraft.sponsored ? "sponsored" : "",
      linkDraft.newTab ? "noopener noreferrer" : "",
    ].filter(Boolean).join(" ");

    activeEditor.chain().focus().extendMarkRange("link").setLink({
      href,
      target: linkDraft.newTab ? "_blank" : null,
      rel: rel || null,
    }).run();
    setLinkOpen(false);
  }

  function selectImage(asset: MediaAsset) {
    if (!asset.url) return;
    activeEditor.chain().focus().setImage({
      src: asset.url,
      alt: asset.alt_text || "",
      title: asset.caption || undefined,
    }).run();
    setPickerOpen(false);
  }

  return (
    <div className={fullscreen ? "richEditorShell fullscreen" : "richEditorShell"}>
      <div className="richEditorToolbar" role="toolbar" aria-label="ابزارهای ویرایش متن">
        <div className="toolbarGroup">
          <ToolbarButton title="برگشت" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>↶</ToolbarButton>
          <ToolbarButton title="جلو" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>↷</ToolbarButton>
        </div>
        <div className="toolbarGroup">
          <ToolbarButton title="متن معمولی" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}>متن</ToolbarButton>
          {[2, 3, 4, 5, 6].map((level) => (
            <ToolbarButton
              key={level}
              title={`تیتر H${level}`}
              active={editor.isActive("heading", { level })}
              onClick={() => editor.chain().focus().toggleHeading({ level: level as 2 | 3 | 4 | 5 | 6 }).run()}
            >
              H{level}
            </ToolbarButton>
          ))}
        </div>
        <div className="toolbarGroup">
          <ToolbarButton title="ضخیم" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></ToolbarButton>
          <ToolbarButton title="مورب" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></ToolbarButton>
          <ToolbarButton title="زیرخط" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarButton>
          <ToolbarButton title="خط‌خورده" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>S</ToolbarButton>
          <ToolbarButton title="هایلایت" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>▣</ToolbarButton>
          <ToolbarButton title="لینک" active={editor.isActive("link")} onClick={openLinkEditor}>🔗</ToolbarButton>
        </div>
        <div className="toolbarGroup">
          <ToolbarButton title="فهرست بولت" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>• لیست</ToolbarButton>
          <ToolbarButton title="فهرست شماره‌ای" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>۱. لیست</ToolbarButton>
          <ToolbarButton title="نقل‌قول" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</ToolbarButton>
          <ToolbarButton title="کد" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>&lt;/&gt;</ToolbarButton>
        </div>
        <div className="toolbarGroup">
          <ToolbarButton title="راست‌چین" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>≡→</ToolbarButton>
          <ToolbarButton title="وسط‌چین" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>≡</ToolbarButton>
          <ToolbarButton title="چپ‌چین" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>←≡</ToolbarButton>
          <ToolbarButton title="راست‌به‌چپ" onClick={() => setDirection("rtl")}>RTL</ToolbarButton>
          <ToolbarButton title="چپ‌به‌راست" onClick={() => setDirection("ltr")}>LTR</ToolbarButton>
        </div>
        <div className="toolbarGroup">
          <ToolbarButton title="تصویر" onClick={() => setPickerOpen(true)}>▧ تصویر</ToolbarButton>
          <ToolbarButton title="جدول ۳×۳" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦ جدول</ToolbarButton>
          <ToolbarButton title="خط جداکننده" onClick={() => editor.chain().focus().setHorizontalRule().run()}>—</ToolbarButton>
          <ToolbarButton title={fullscreen ? "خروج از حالت تمرکز" : "حالت تمرکز"} active={fullscreen} onClick={() => setFullscreen((value) => !value)}>⛶</ToolbarButton>
        </div>
      </div>

      <BubbleMenu editor={editor} options={{ placement: "top" }}>
        <div className="richBubbleMenu">
          <ToolbarButton title="ضخیم" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></ToolbarButton>
          <ToolbarButton title="مورب" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></ToolbarButton>
          <ToolbarButton title="زیرخط" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarButton>
          <ToolbarButton title="لینک" active={editor.isActive("link")} onClick={openLinkEditor}>🔗</ToolbarButton>
        </div>
      </BubbleMenu>

      <EditorContent editor={editor} />

      <div className="richEditorStatus">
        <span>{metrics.words.toLocaleString("fa-IR")} کلمه</span>
        <span>حدود {metrics.minutes.toLocaleString("fa-IR")} دقیقه مطالعه</span>
        <span>Paste پاک‌سازی‌شده · H1 از عنوان صفحه</span>
        <span>Tiptap JSON · ذخیره ساختاریافته</span>
      </div>

      {editor.isActive("table") && (
        <div className="tableToolbar">
          <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()}>+ ردیف</button>
          <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ ستون</button>
          <button type="button" onClick={() => editor.chain().focus().deleteRow().run()}>حذف ردیف</button>
          <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()}>حذف ستون</button>
          <button type="button" className="danger" onClick={() => editor.chain().focus().deleteTable().run()}>حذف جدول</button>
        </div>
      )}

      {linkOpen && (
        <div className="editorDialogBackdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setLinkOpen(false); }}>
          <div className="editorDialog" role="dialog" aria-modal="true" aria-label="تنظیم لینک">
            <div className="editorDialogHeader"><strong>تنظیم لینک</strong><button type="button" onClick={() => setLinkOpen(false)}>×</button></div>
            <label>آدرس<input dir="ltr" autoFocus value={linkDraft.href} placeholder="https://... یا /path" onChange={(e) => setLinkDraft({ ...linkDraft, href: e.target.value })} /></label>
            <label className="editorCheck"><input type="checkbox" checked={linkDraft.newTab} onChange={(e) => setLinkDraft({ ...linkDraft, newTab: e.target.checked })} />باز شدن در تب جدید</label>
            <label className="editorCheck"><input type="checkbox" checked={linkDraft.nofollow} onChange={(e) => setLinkDraft({ ...linkDraft, nofollow: e.target.checked })} />nofollow</label>
            <label className="editorCheck"><input type="checkbox" checked={linkDraft.sponsored} onChange={(e) => setLinkDraft({ ...linkDraft, sponsored: e.target.checked })} />sponsored</label>
            <div className="actions">
              <button type="button" className="btn" onClick={applyLink}>اعمال لینک</button>
              {editor.isActive("link") && <button type="button" className="btn secondary" onClick={() => { editor.chain().focus().unsetLink().run(); setLinkOpen(false); }}>حذف لینک</button>}
            </div>
          </div>
        </div>
      )}

      <MediaPicker
        siteId={siteId}
        open={pickerOpen}
        imageOnly
        onClose={() => setPickerOpen(false)}
        onSelect={selectImage}
      />
    </div>
  );
}
