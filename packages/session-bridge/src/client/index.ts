/**
 * dsh-session-bridge client half.
 *
 * Takes over the keyed Chat Node seat `conversation.chat.node` / key `context`
 * (the seat that renders non-human user-message sources). Mailbox deliveries
 * (source.kind === "plugin", plugin === "session-bridge") are rendered as a
 * right-aligned user-side bubble with a "[📬 来自会话 <id>]" marker, a
 * hover-visible timestamp and a copy button (native user-message chrome);
 * every other context entry keeps the product's collapsed disclosure row
 * (title + provenance label + bounded code body) via the public
 * `DisclosureRow` / `MessageText` / `JsonBlock` primitives.
 */
import React from "react";
import {
  DisclosureRow,
  IconBrowseOutline16,
  IconCheckOutline16,
  IconCopyOutline16,
  JsonBlock,
  MessageText,
  Tooltip,
  writeClipboard,
} from "@deepseek-ai/dsh-client-ui-primitives";

const PLUGIN_ID = "session-bridge";
const CSS_TAG = "@dsh-external/dsh-session-bridge/mailbox.css";

// ---- i18n ----
const NS = "sessionInfo";
const zh = {
  "view.label": "会话信息",
  "refresh": "刷新",
  "basic": "基本信息",
  "name": "名称",
  "project": "项目",
  "source": "来源",
  "created": "创建",
  "active": "活跃",
  "id": "ID",
  "file": "文件",
  "messages": "消息",
  "total": "合计",
  "user": "用户",
  "agent": "Agent",
  "tool": "工具",
  "tokens": "Token",
  "input": "总输入",
  "output": "输出",
  "cacheRead": "缓存读取",
  "cacheHit": "缓存命中",
  "context": "上下文",
  "current": "当前",
  "contextUsed": "上下文已用",
  "systemPrompt": "系统提示词",
  "tools": "工具",
  "messages": "对话消息",
  "copied": "已复制",
  "copy": "复制",
  "noSession": "未绑定会话",
  "loadFailed": "加载失败",
  "live": "实时 · live",
  "notLoaded": "会话未加载 · 部分统计不可用",
};
const en: Record<string, string> = {
  "view.label": "Session Info",
  "refresh": "Refresh",
  "basic": "Basic",
  "name": "Name",
  "project": "Project",
  "source": "Source",
  "created": "Created",
  "active": "Active",
  "id": "ID",
  "file": "File",
  "messages": "Messages",
  "total": "Total",
  "user": "User",
  "agent": "Agent",
  "tool": "Tool",
  "tokens": "Token",
  "input": "Input",
  "output": "Output",
  "cacheRead": "Cache read",
  "cacheHit": "Cache hit",
  "context": "Context",
  "current": "Current",
  "contextUsed": "Context used",
  "systemPrompt": "System prompt",
  "tools": "Tools",
  "messages": "Messages",
  "copied": "Copied",
  "copy": "Copy",
  "noSession": "No session bound",
  "loadFailed": "Load failed",
  "live": "Live",
  "notLoaded": "Session not loaded · partial stats unavailable",
};
export const i18n = { NS, zh, en };
/** Localized lookup; falls back to zh when the current locale is not en. */
function localeText(dict: Record<string, string>, key: string): string {
  const lang = (typeof document !== "undefined" ? document.documentElement.lang : "") || "";
  const table = lang.toLowerCase().startsWith("en") ? en : zh;
  return table[key] ?? dict[key] ?? key;
}

const CSS = `
.sb-mailbox-row{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.sb-mailbox-stack{display:flex;flex-direction:column;align-items:flex-end;gap:8px;min-width:0;max-width:min(525px,82%)}
.sb-mailbox-bubble{background:var(--dsw-specific-bubble);max-width:100%;color:var(--dsw-alias-label-primary);border-radius:22px;padding:10px 16px;font-size:16px;line-height:24px;overflow-wrap:anywhere}
.sb-mailbox-badge{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:2px 10px;border-radius:999px;background:var(--dsw-alias-markdown-code-block);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;user-select:none}
.sb-mailbox-from{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--ds-font-family-code)}
.sb-mailbox-actions{align-items:center;gap:10px;height:28px;display:flex}
.sb-mailbox-time{color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-right:12px;font-size:14px;line-height:24px}
.sb-mailbox-action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}
.sb-mailbox-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
@media (hover:hover){[data-time-hover-root] .sb-mailbox-time{opacity:0;transition:opacity 80ms}[data-time-hover-root]:hover .sb-mailbox-time,[data-time-hover-root]:focus-within .sb-mailbox-time{opacity:1}}
.sb-context-root{min-width:0}
.sb-context-root[data-open]{padding-bottom:4px}
.sb-context-chevron{color:var(--dsw-alias-label-secondary)}
.sb-context-sep{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}
.sb-context-source{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:none;font-size:14px;line-height:24px;overflow:hidden}
.sb-context-summary{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:auto;font-size:14px;line-height:24px;overflow:hidden}
.sb-context-body{box-sizing:border-box;background:var(--dsw-alias-markdown-code-block);width:calc(100% - 22px);max-height:141px;color:var(--dsw-alias-label-tertiary);font:400 11px/16px var(--ds-font-family-code);border:none;border-radius:8px;margin:4px 0 0 22px;padding:10px 16px 12px 12px;overflow:auto}
/* Multi-line collapse for user bubbles (native user bubble + mailbox bubble). */
.gdEzaW_bubble[data-sb-clamped]{display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden;-webkit-mask-image:linear-gradient(#000 0,#000 calc(100% - 34px),transparent);mask-image:linear-gradient(#000 0,#000 calc(100% - 34px),transparent)}
.gdEzaW_bubble[data-sb-clamped][data-sb-open]{display:block;-webkit-line-clamp:unset;-webkit-mask-image:none;mask-image:none;overflow:visible}
.sb-mailbox-bubble[data-sb-clamped]{display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden;-webkit-mask-image:linear-gradient(#000 0,#000 calc(100% - 34px),transparent);mask-image:linear-gradient(#000 0,#000 calc(100% - 34px),transparent)}
.sb-mailbox-bubble[data-sb-clamped][data-sb-open]{display:block;-webkit-line-clamp:unset;-webkit-mask-image:none;mask-image:none;overflow:visible}
.sb-collapse-toggle{display:block;width:100%;margin-top:6px;padding:0;border:0;background:0 0;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;line-height:20px;text-align:left}
.sb-collapse-toggle:hover{color:var(--dsw-alias-label-primary)}
/* Widen the chat content column (user preference). The double class raises
   specificity above the product's .wSkVaW_root definition; composer card
   width follows via its own calc(var(--dsh-chat-content-width) + 32px). */
.wSkVaW_root.wSkVaW_root{--dsh-chat-content-width:1200px}
/* Session info view */
.sb-info-root{max-width:720px;margin:0 auto;padding:24px 20px;display:flex;flex-direction:column;gap:20px}
.sb-info-section{display:flex;flex-direction:column;gap:6px}
.sb-info-label{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px}
.sb-info-row{display:flex;align-items:center;gap:8px;min-width:0}
.sb-info-key{color:var(--dsw-alias-label-tertiary);flex:none;width:72px;font-size:13px;line-height:20px}
.sb-info-value{color:var(--dsw-alias-label-primary);min-width:0;flex:auto;font-size:13px;line-height:20px;overflow-wrap:anywhere}
.sb-info-code{font-family:var(--ds-font-family-code);font-size:12px;line-height:18px}
.sb-info-copy{width:28px;height:28px;flex:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:28px;place-items:center;display:inline-flex;padding:6px}
.sb-info-copy:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.sb-info-refresh{align-self:flex-start;color:var(--dsw-alias-label-secondary);cursor:pointer;background:var(--dsw-alias-interactive-bg-hover);border:none;border-radius:8px;padding:6px 12px;font-size:13px;line-height:20px}
.sb-info-refresh:hover{color:var(--dsw-alias-label-primary)}
.sb-info-error{color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:20px}

/* Input caret enhancement: theme-adaptive contrast color + block caret (progressive). */
textarea,
input:not([type]),
input[type="text"],
input[type="search"] {
  caret-color: var(--sb-caret-color, var(--dsw-alias-label-primary));
  caret-shape: block;
}
.sb-info-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
/* Message width ratios (user preference): user bubbles keep the native 82%
   ratio without the fixed 525px cap; mailbox bubbles share it; assistant
   messages are capped at 90% of the chat column. */
[data-chat-flow-kind="user"] .gdEzaW_userStack,
[data-chat-flow-kind="steering"] .gdEzaW_userStack{max-width:82%}
.sb-mailbox-stack{max-width:82%}
[data-chat-flow-kind="assistant-step"]{max-width:90%}
`;

// ---- Multi-line collapse enhancer (DOM-level, no seat takeover) ----
// Applies to the native user-message bubble (compiled CSS module class) and
// to the plugin's own mailbox bubble. Content taller than TRIGGER_LINES is
// clamped to PREVIEW_LINES with a fade; a toggle button expands/collapses.
// The enhancement is purely additive: when the selector no longer matches
// (e.g. after a DSH upgrade changes the hashed class) the feature degrades
// to no collapse without breaking native rendering.

const BUBBLE_SELECTOR = ".gdEzaW_bubble, .sb-mailbox-bubble";
const PREVIEW_LINES = 6;
const TRIGGER_LINES = 8;
const COLLAPSE_BTN_CLASS = "sb-collapse-toggle";

function estimateLineHeight(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  const lh = cs.lineHeight;
  if (lh && lh !== "normal") {
    const v = Number.parseFloat(lh);
    if (Number.isFinite(v) && v > 0) return v;
  }
  const fs = Number.parseFloat(cs.fontSize);
  return (Number.isFinite(fs) && fs > 0 ? fs : 16) * 1.4;
}

function collapseToggleLabel(open: boolean): string {
  return open ? "收起 · Collapse" : "展开 · Expand";
}

/** Measure one bubble; clamp and attach a toggle when it exceeds the trigger. */
function enhanceBubble(bubble: HTMLElement): void {
  if (bubble.querySelector("." + COLLAPSE_BTN_CLASS)) return;
  if (bubble.hasAttribute("data-sb-clamped")) return;
  const lh = estimateLineHeight(bubble);
  const cs = getComputedStyle(bubble);
  const pad =
    (Number.parseFloat(cs.paddingTop) || 0) + (Number.parseFloat(cs.paddingBottom) || 0);
  const triggerHeight = lh * TRIGGER_LINES + pad;
  if (bubble.offsetHeight < triggerHeight) return; // short content: keep untouched
  bubble.setAttribute("data-sb-clamped", "");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = COLLAPSE_BTN_CLASS;
  btn.textContent = collapseToggleLabel(false);
  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const open = bubble.hasAttribute("data-sb-open");
    if (open) {
      bubble.removeAttribute("data-sb-open");
      btn.textContent = collapseToggleLabel(false);
    } else {
      bubble.setAttribute("data-sb-open", "");
      btn.textContent = collapseToggleLabel(true);
    }
  });
  bubble.insertAdjacentElement("afterend", btn);
}

function scanBubbleDescendants(root: ParentNode): void {
  if (!root.querySelectorAll) return;
  root.querySelectorAll(BUBBLE_SELECTOR).forEach((el) => {
    if (el instanceof HTMLElement) enhanceBubble(el);
  });
}

/** Watch chat-area DOM mutations; returns a disposer. */
function startCollapseEnhancer(): () => void {
  const observer = new MutationObserver((records) => {
    for (const rec of records) {
      if (rec.type !== "childList") continue;
      rec.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches(BUBBLE_SELECTOR)) enhanceBubble(node);
        else scanBubbleDescendants(node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scanBubbleDescendants(document.body);

  let resizeTimer: number | null = null;
  const onResize = () => {
    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => scanBubbleDescendants(document.body), 150);
  };
  window.addEventListener("resize", onResize);

  const onFontsReady = () => scanBubbleDescendants(document.body);
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  const fontsPromise = fonts && typeof fonts.ready?.then === "function" ? fonts.ready.then(onFontsReady).catch(() => {}) : null;

  return () => {
    observer.disconnect();
    window.removeEventListener("resize", onResize);
    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date-aware compact clock, mirroring the product's formatMessageClock. */
function formatClock(time: number, t: any): string {
  const d = new Date(time);
  const n = new Date();
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return clock;
  let datePart = `${d.getMonth() + 1}-${d.getDate()}`;
  if (typeof t === "function") {
    try {
      const labeled = t("clock.md", { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });
      if (typeof labeled === "string" && labeled !== "") datePart = labeled;
    } catch {
      /* fall back to numeric date */
    }
  }
  return `${datePart} ${clock}`;
}

function isMailboxSource(source: any): boolean {
  return Boolean(
    source &&
    typeof source === "object" &&
    source.kind === "plugin" &&
    source.plugin === PLUGIN_ID,
  );
}

/** Extract the sender session id from the durable source (with text fallback). */
function senderOf(source: any, text: string): string {
  if (source && typeof source.from === "string" && source.from !== "") return source.from;
  const m = /^\[📬 跨会话消息 from ([^\]]+)\]/.exec(text);
  return m ? m[1] : "";
}

/** Render text content blocks; non-text blocks fall back to a JSON block. */
function renderContentBlocks(content: any, t: any): React.ReactNode[] {
  const blocks = Array.isArray(content) ? content : [];
  const out: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
      out.push(React.createElement(MessageText, { key: i, text: block.text }));
    } else {
      out.push(React.createElement(JsonBlock, {
        key: i,
        label: typeof t === "function" ? t("message.extraBlock") : "extra",
        payload: block,
      }));
    }
  }
  return out;
}

/** Copy button + hover timestamp, mirroring the native user-message chrome. */
function MailboxActions({ text, time, t }: { text: string; time: number | undefined; t: any }): React.ReactElement {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof window.setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);
  const copyLabel = typeof t === "function" ? t("copy") : "复制 · Copy";
  const copiedLabel = typeof t === "function" ? t("copied") : "已复制 · Copied";
  const onCopy = () => {
    if (copied) return;
    writeClipboard(text).then((ok: boolean) => {
      if (!ok) return;
      setCopied(true);
      timerRef.current = window.setTimeout(() => setCopied(false), 1000);
    });
  };
  return React.createElement("div", { className: "sb-mailbox-actions" },
    time !== undefined
      ? React.createElement("span", { className: "sb-mailbox-time", "data-mailbox-time": true }, formatClock(time, t))
      : null,
    React.createElement(Tooltip, { label: copied ? copiedLabel : copyLabel, side: "bottom" },
      React.createElement("button", {
        type: "button",
        className: "sb-mailbox-action",
        "aria-label": copied ? copiedLabel : copyLabel,
        onClick: onCopy,
      },
        copied ? React.createElement(IconCheckOutline16, null) : React.createElement(IconCopyOutline16, null),
      ),
    ),
  );
}

/** User-side bubble for one mailbox delivery, with a cross-session marker. */
function MailboxBubble({ data, t }: { data: any; t: any }): React.ReactElement {
  const text = Array.isArray(data.content)
    ? data.content
      .filter((b: any) => b && typeof b === "object" && b.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("\n")
    : "";
  const from = senderOf(data.source, text);
  const label = from === "" ? "跨会话消息 · Cross-session" : `来自会话 ${from} · from ${from}`;
  return React.createElement("div", { className: "sb-mailbox-row", "data-time-hover-root": true, "data-mailbox-message": true },
    React.createElement("div", { className: "sb-mailbox-stack" },
      React.createElement("span", { className: "sb-mailbox-badge", "data-mailbox-badge": true },
        React.createElement("span", { "aria-hidden": true }, "📬"),
        React.createElement("span", { className: "sb-mailbox-from", title: from }, label),
      ),
      React.createElement("div", { className: "sb-mailbox-bubble" },
        ...renderContentBlocks(data.content, t),
      ),
    ),
    React.createElement(MailboxActions, { text, time: data.time, t }),
  );
}

/** Collapsed context row kept faithful to the product's ContextInjectionRow. */
function GenericContextRow({ data, t }: { data: any; t: any }): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const provenance = data.provenance ?? { role: "inject", label: null };
  const summary =
    data.form === "notice"
      ? (data.source && typeof data.source.summary === "string" ? data.source.summary : null)
      : null;
  const title =
    provenance.role === "recall"
      ? (typeof t === "function" ? t("message.contextRecall") : "会话召回 · Recalled session")
      : (typeof t === "function" ? t("message.contextInjection") : "上下文注入 · Injected context");
  const collapsedContent =
    provenance.label === null || provenance.label === undefined
      ? undefined
      : React.createElement(React.Fragment, null,
          React.createElement("span", { className: "sb-context-sep", "aria-hidden": true }),
          React.createElement("span", { className: "sb-context-source", "data-context-source": true }, String(provenance.label)),
          summary !== null
            ? React.createElement(React.Fragment, null,
                React.createElement("span", { className: "sb-context-sep", "aria-hidden": true }),
                React.createElement("span", { className: "sb-context-summary", "data-context-summary": true }, summary),
              )
            : null,
        );
  return React.createElement(DisclosureRow, {
    className: "sb-context-root",
    icon: React.createElement(IconBrowseOutline16, { size: 14 }),
    chevronClassName: "sb-context-chevron",
    title,
    collapsedContent,
    keepContentWhenOpen: true,
    open,
    expandable: true,
    expandOnRowClick: true,
    onToggle: () => setOpen((prev) => !prev),
  },
    React.createElement("div", { className: "sb-context-body", "data-context-body": true },
      ...renderContentBlocks(data.content, t),
    ),
  );
}

/** Keyed Chat renderer for every `context` node. */
function MailboxContextNodeView(props: any): React.ReactElement | null {
  const data = props?.node?.data;
  if (!data) return null;
  if (isMailboxSource(data.source)) {
    return React.createElement(MailboxBubble, { data, t: props?.t });
  }
  return React.createElement(GenericContextRow, { data, t: props?.t });
}

/** Hard dependency on the client slots service (guarded bundle context). */
export const inject = ["slots", "locale"];

export function apply(ctx: any): void {
  if (typeof document !== "undefined") {
    const existing = document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG) + "]");
    if (existing === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@dsh-external/dsh-session-bridge";
      tag.dataset.pluginCss = CSS_TAG;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      ctx.effect(() => () => {
        tag.remove();
      });
    }
  }
  ctx.locale?.register?.(NS, { zh, en });
  ctx.slots.inject("conversation.chat.node", () => ctx.slots.register(
    { name: "conversation.chat.node", key: "context", priority: -100 },
    (props: any) => React.createElement(MailboxContextNodeView, props),
  ));
  if (typeof document !== "undefined") {
    const disposeCollapse = startCollapseEnhancer();
    ctx.effect(() => disposeCollapse);
    // Input caret theme adaptation: pick a high-contrast caret color for the
    // active color scheme and re-apply when the theme engine flips it.
    const applyCaretTheme = () => {
      const root = document.documentElement;
      const scheme = root.style.colorScheme
        || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      root.style.setProperty("--sb-caret-color", scheme === "dark" ? "#a5b4fc" : "#3b5bdb");
    };
    applyCaretTheme();
    let caretTimer: number | null = null;
    const caretObserver = new MutationObserver(() => {
      if (caretTimer !== null) window.clearTimeout(caretTimer);
      caretTimer = window.setTimeout(applyCaretTheme, 60);
    });
    caretObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    const caretMq = window.matchMedia("(prefers-color-scheme: dark)");
    const onCaretMq = () => applyCaretTheme();
    caretMq.addEventListener?.("change", onCaretMq);
    ctx.effect(() => () => {
      caretObserver.disconnect();
      if (caretTimer !== null) window.clearTimeout(caretTimer);
      caretMq.removeEventListener?.("change", onCaretMq);
    });
  }
  ctx.slots.inject("conversation.view", () => ctx.slots.register(
    {
      name: "conversation.view",
      id: "session-info",
      order: 20,
      locale: NS,
      label: () => localeText(zh, "view.label"),
      inject: (sessionId: string) => ({ sessionId }),
    },
    (props: any) => React.createElement(SessionInfoView, props),
  ));
}

// ---- Session info view (conversation.view seat) ----

function fmtTime(ts: number | null | undefined): string {
  if (!ts) return "-";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function fmtNum(n: number | undefined | null): string {
  return n === undefined || n === null ? "-" : Number(n).toLocaleString("en-US");
}

function InfoRow({ k, v, code }: { k: string; v: React.ReactNode; code?: boolean }): React.ReactElement {
  return React.createElement("div", { className: "sb-info-row" },
    React.createElement("span", { className: "sb-info-key" }, k),
    React.createElement("span", { className: "sb-info-value" + (code ? " sb-info-code" : "") }, v),
  );
}

function CopyButton({ text, t }: { text: string; t: (k: string) => string }): React.ReactElement {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof window.setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);
  const onCopy = () => {
    if (copied) return;
    writeClipboard(text).then((ok: boolean) => {
      if (!ok) return;
      setCopied(true);
      timerRef.current = window.setTimeout(() => setCopied(false), 1000);
    });
  };
  return React.createElement("button", {
    type: "button",
    className: "sb-info-copy",
    "aria-label": copied ? t("copied") : t("copy"),
    title: copied ? t("copied") : t("copy"),
    onClick: onCopy,
  }, copied ? React.createElement(IconCheckOutline16, null) : React.createElement(IconCopyOutline16, null));
}

function SessionInfoView(props: any): React.ReactElement {
  const sessionId: string = props?.sessionId ?? "";
  const t = (typeof props?.t === "function" ? props.t : (k: string) => localeText(zh, k));
  const [info, setInfo] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const refresh = React.useCallback(() => {
    if (!sessionId) return;
    fetch("/api/session-bridge/session-info?sessionId=" + encodeURIComponent(sessionId), { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setInfo(d); setError(d?.ok ? null : (d?.error ?? "unknown")); })
      .catch((e) => setError(String(e)));
  }, [sessionId]);
  React.useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  if (!sessionId) {
    return React.createElement("div", { className: "sb-info-root" },
      React.createElement("span", { className: "sb-info-hint" }, t("noSession")));
  }
  if (error && !info) {
    return React.createElement("div", { className: "sb-info-root" },
      React.createElement("span", { className: "sb-info-error" }, t("loadFailed") + " · " + error));
  }
  const s = info?.stats;
  const billedInput = (s?.tokens?.input ?? 0) + (s?.tokens?.cacheRead ?? 0) + (s?.tokens?.cacheWrite ?? 0);
  const totalTokens = billedInput + (s?.tokens?.output ?? 0);
  const cacheHitPct = billedInput > 0 ? Math.round(((s?.tokens?.cacheRead ?? 0) / billedInput) * 100) : null;
  const pressure = info?.context ?? {};
  const breakdown = info?.contextBreakdown ?? {};
  const usedTokens = Number(pressure.projectedTokens ?? pressure.pressureTokens) || 0;
  const contextWindow = Number(pressure.contextWindow) || 0;
  const contextPercent = contextWindow > 0 ? Math.min(100, Math.round((usedTokens / contextWindow) * 100)) : null;
  const contextTotal = contextWindow > 0 ? "~" + fmtNum(usedTokens) + " / " + fmtNum(contextWindow) : "-";
  const breakdownRows = [
    InfoRow({ k: t("systemPrompt"), v: "~" + fmtNum(breakdown.systemTokens) }),
    InfoRow({ k: t("tools"), v: "~" + fmtNum(breakdown.toolsTokens) }),
    InfoRow({ k: t("messages"), v: "~" + fmtNum(breakdown.messageTokens) }),
  ];
  return React.createElement("div", { className: "sb-info-root" },
    React.createElement("button", { type: "button", className: "sb-info-refresh", onClick: refresh }, t("refresh")),
    React.createElement("section", { className: "sb-info-section" },
      React.createElement("span", { className: "sb-info-label" }, t("basic")),
      InfoRow({ k: t("name"), v: info?.title ?? "-" }),
      InfoRow({ k: t("project"), v: info?.project || info?.cwd || "-" }),
      InfoRow({ k: t("source"), v: info?.source ?? "DSH" }),
      InfoRow({ k: t("created"), v: fmtTime(info?.createdAt) }),
      InfoRow({ k: t("active"), v: fmtTime(info?.activeAt) }),
      InfoRow({ k: t("id"), v: info?.id ?? sessionId, code: true }),
      React.createElement("div", { className: "sb-info-row" },
        React.createElement("span", { className: "sb-info-key" }, t("file")),
        React.createElement("span", { className: "sb-info-value sb-info-code" }, info?.file ?? "-"),
        info?.file ? React.createElement(CopyButton, { text: info.file, t }) : null,
      ),
    ),
    React.createElement("section", { className: "sb-info-section" },
      React.createElement("span", { className: "sb-info-label" }, t("messages")),
      InfoRow({ k: t("total"), v: fmtNum(s?.messages?.total) }),
      InfoRow({ k: t("user"), v: fmtNum(s?.messages?.user) }),
      InfoRow({ k: t("agent"), v: fmtNum(s?.messages?.agent) }),
      InfoRow({ k: t("tool"), v: fmtNum(s?.messages?.tool) }),
    ),
    React.createElement("section", { className: "sb-info-section" },
      React.createElement("span", { className: "sb-info-label" }, t("tokens")),
      InfoRow({ k: t("total"), v: fmtNum(totalTokens) }),
      InfoRow({ k: t("input"), v: fmtNum(billedInput) }),
      InfoRow({ k: t("output"), v: fmtNum(s?.tokens?.output) }),
      InfoRow({ k: t("cacheRead"), v: fmtNum(s?.tokens?.cacheRead) }),
      InfoRow({ k: t("cacheHit"), v: cacheHitPct !== null ? cacheHitPct + "%" : "-" }),
    ),
    React.createElement("section", { className: "sb-info-section" },
      React.createElement("span", { className: "sb-info-label" }, t("context")),
      InfoRow({ k: t("contextUsed"), v: contextPercent !== null ? contextPercent + "%" : "-" }),
      InfoRow({ k: t("current"), v: contextTotal }),
      ...breakdownRows,
    ),
    React.createElement("span", { className: "sb-info-hint" },
      info?.live ? t("live") : t("notLoaded")),
  );
}