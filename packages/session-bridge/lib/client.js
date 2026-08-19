window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-session-bridge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region src/client/index.ts
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
		const PLUGIN_ID = "session-bridge";
		const CSS_TAG = "@dsh-external/dsh-session-bridge/mailbox.css";
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
.sb-info-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
/* Message width ratios (user preference): user bubbles keep the native 82%
   ratio without the fixed 525px cap; mailbox bubbles share it; assistant
   messages are capped at 90% of the chat column. */
[data-chat-flow-kind="user"] .gdEzaW_userStack,
[data-chat-flow-kind="steering"] .gdEzaW_userStack{max-width:82%}
.sb-mailbox-stack{max-width:82%}
[data-chat-flow-kind="assistant-step"]{max-width:90%}
`;
		const BUBBLE_SELECTOR = ".gdEzaW_bubble, .sb-mailbox-bubble";
		const TRIGGER_LINES = 8;
		const COLLAPSE_BTN_CLASS = "sb-collapse-toggle";
		function estimateLineHeight(el) {
			const cs = getComputedStyle(el);
			const lh = cs.lineHeight;
			if (lh && lh !== "normal") {
				const v = Number.parseFloat(lh);
				if (Number.isFinite(v) && v > 0) return v;
			}
			const fs = Number.parseFloat(cs.fontSize);
			return (Number.isFinite(fs) && fs > 0 ? fs : 16) * 1.4;
		}
		function collapseToggleLabel(open) {
			return open ? "收起 · Collapse" : "展开 · Expand";
		}
		/** Measure one bubble; clamp and attach a toggle when it exceeds the trigger. */
		function enhanceBubble(bubble) {
			if (bubble.querySelector(".sb-collapse-toggle")) return;
			if (bubble.hasAttribute("data-sb-clamped")) return;
			const lh = estimateLineHeight(bubble);
			const cs = getComputedStyle(bubble);
			const pad = (Number.parseFloat(cs.paddingTop) || 0) + (Number.parseFloat(cs.paddingBottom) || 0);
			const triggerHeight = lh * TRIGGER_LINES + pad;
			if (bubble.offsetHeight < triggerHeight) return;
			bubble.setAttribute("data-sb-clamped", "");
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = COLLAPSE_BTN_CLASS;
			btn.textContent = collapseToggleLabel(false);
			btn.addEventListener("click", (ev) => {
				ev.stopPropagation();
				if (bubble.hasAttribute("data-sb-open")) {
					bubble.removeAttribute("data-sb-open");
					btn.textContent = collapseToggleLabel(false);
				} else {
					bubble.setAttribute("data-sb-open", "");
					btn.textContent = collapseToggleLabel(true);
				}
			});
			bubble.insertAdjacentElement("afterend", btn);
		}
		function scanBubbleDescendants(root) {
			if (!root.querySelectorAll) return;
			root.querySelectorAll(BUBBLE_SELECTOR).forEach((el) => {
				if (el instanceof HTMLElement) enhanceBubble(el);
			});
		}
		/** Watch chat-area DOM mutations; returns a disposer. */
		function startCollapseEnhancer() {
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
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
			scanBubbleDescendants(document.body);
			let resizeTimer = null;
			const onResize = () => {
				if (resizeTimer !== null) window.clearTimeout(resizeTimer);
				resizeTimer = window.setTimeout(() => scanBubbleDescendants(document.body), 150);
			};
			window.addEventListener("resize", onResize);
			const onFontsReady = () => scanBubbleDescendants(document.body);
			const fonts = document.fonts;
			fonts && typeof fonts.ready?.then === "function" && fonts.ready.then(onFontsReady).catch(() => {});
			return () => {
				observer.disconnect();
				window.removeEventListener("resize", onResize);
				if (resizeTimer !== null) window.clearTimeout(resizeTimer);
			};
		}
		function pad2(n) {
			return String(n).padStart(2, "0");
		}
		/** Date-aware compact clock, mirroring the product's formatMessageClock. */
		function formatClock(time, t) {
			const d = new Date(time);
			const n = /* @__PURE__ */ new Date();
			const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
			if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return clock;
			let datePart = `${d.getMonth() + 1}-${d.getDate()}`;
			if (typeof t === "function") try {
				const labeled = t("clock.md", {
					y: d.getFullYear(),
					m: d.getMonth() + 1,
					d: d.getDate()
				});
				if (typeof labeled === "string" && labeled !== "") datePart = labeled;
			} catch {}
			return `${datePart} ${clock}`;
		}
		function isMailboxSource(source) {
			return Boolean(source && typeof source === "object" && source.kind === "plugin" && source.plugin === PLUGIN_ID);
		}
		/** Extract the sender session id from the durable source (with text fallback). */
		function senderOf(source, text) {
			if (source && typeof source.from === "string" && source.from !== "") return source.from;
			const m = /^\[📬 跨会话消息 from ([^\]]+)\]/.exec(text);
			return m ? m[1] : "";
		}
		/** Render text content blocks; non-text blocks fall back to a JSON block. */
		function renderContentBlocks(content, t) {
			const blocks = Array.isArray(content) ? content : [];
			const out = [];
			for (let i = 0; i < blocks.length; i += 1) {
				const block = blocks[i];
				if (block && typeof block === "object" && block.type === "text" && typeof block.text === "string") out.push(react.default.createElement(_deepseek_ai_dsh_client_ui_primitives.MessageText, {
					key: i,
					text: block.text
				}));
				else out.push(react.default.createElement(_deepseek_ai_dsh_client_ui_primitives.JsonBlock, {
					key: i,
					label: typeof t === "function" ? t("message.extraBlock") : "extra",
					payload: block
				}));
			}
			return out;
		}
		/** Copy button + hover timestamp, mirroring the native user-message chrome. */
		function MailboxActions({ text, time, t }) {
			const [copied, setCopied] = react.default.useState(false);
			const timerRef = react.default.useRef(null);
			react.default.useEffect(() => () => {
				if (timerRef.current !== null) window.clearTimeout(timerRef.current);
			}, []);
			const copyLabel = typeof t === "function" ? t("copy") : "复制 · Copy";
			const copiedLabel = typeof t === "function" ? t("copied") : "已复制 · Copied";
			const onCopy = () => {
				if (copied) return;
				(0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(text).then((ok) => {
					if (!ok) return;
					setCopied(true);
					timerRef.current = window.setTimeout(() => setCopied(false), 1e3);
				});
			};
			return react.default.createElement("div", { className: "sb-mailbox-actions" }, time !== void 0 ? react.default.createElement("span", {
				className: "sb-mailbox-time",
				"data-mailbox-time": true
			}, formatClock(time, t)) : null, react.default.createElement(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: copied ? copiedLabel : copyLabel,
				side: "bottom"
			}, react.default.createElement("button", {
				type: "button",
				className: "sb-mailbox-action",
				"aria-label": copied ? copiedLabel : copyLabel,
				onClick: onCopy
			}, copied ? react.default.createElement(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, null) : react.default.createElement(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, null))));
		}
		/** User-side bubble for one mailbox delivery, with a cross-session marker. */
		function MailboxBubble({ data, t }) {
			const text = Array.isArray(data.content) ? data.content.filter((b) => b && typeof b === "object" && b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n") : "";
			const from = senderOf(data.source, text);
			const label = from === "" ? "跨会话消息 · Cross-session" : `来自会话 ${from} · from ${from}`;
			return react.default.createElement("div", {
				className: "sb-mailbox-row",
				"data-time-hover-root": true,
				"data-mailbox-message": true
			}, react.default.createElement("div", { className: "sb-mailbox-stack" }, react.default.createElement("span", {
				className: "sb-mailbox-badge",
				"data-mailbox-badge": true
			}, react.default.createElement("span", { "aria-hidden": true }, "📬"), react.default.createElement("span", {
				className: "sb-mailbox-from",
				title: from
			}, label)), react.default.createElement("div", { className: "sb-mailbox-bubble" }, ...renderContentBlocks(data.content, t))), react.default.createElement(MailboxActions, {
				text,
				time: data.time,
				t
			}));
		}
		/** Collapsed context row kept faithful to the product's ContextInjectionRow. */
		function GenericContextRow({ data, t }) {
			const [open, setOpen] = react.default.useState(false);
			const provenance = data.provenance ?? {
				role: "inject",
				label: null
			};
			const summary = data.form === "notice" ? data.source && typeof data.source.summary === "string" ? data.source.summary : null : null;
			const title = provenance.role === "recall" ? typeof t === "function" ? t("message.contextRecall") : "会话召回 · Recalled session" : typeof t === "function" ? t("message.contextInjection") : "上下文注入 · Injected context";
			const collapsedContent = provenance.label === null || provenance.label === void 0 ? void 0 : react.default.createElement(react.default.Fragment, null, react.default.createElement("span", {
				className: "sb-context-sep",
				"aria-hidden": true
			}), react.default.createElement("span", {
				className: "sb-context-source",
				"data-context-source": true
			}, String(provenance.label)), summary !== null ? react.default.createElement(react.default.Fragment, null, react.default.createElement("span", {
				className: "sb-context-sep",
				"aria-hidden": true
			}), react.default.createElement("span", {
				className: "sb-context-summary",
				"data-context-summary": true
			}, summary)) : null);
			return react.default.createElement(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
				className: "sb-context-root",
				icon: react.default.createElement(_deepseek_ai_dsh_client_ui_primitives.IconBrowseOutline16, { size: 14 }),
				chevronClassName: "sb-context-chevron",
				title,
				collapsedContent,
				keepContentWhenOpen: true,
				open,
				expandable: true,
				expandOnRowClick: true,
				onToggle: () => setOpen((prev) => !prev)
			}, react.default.createElement("div", {
				className: "sb-context-body",
				"data-context-body": true
			}, ...renderContentBlocks(data.content, t)));
		}
		/** Keyed Chat renderer for every `context` node. */
		function MailboxContextNodeView(props) {
			const data = props?.node?.data;
			if (!data) return null;
			if (isMailboxSource(data.source)) return react.default.createElement(MailboxBubble, {
				data,
				t: props?.t
			});
			return react.default.createElement(GenericContextRow, {
				data,
				t: props?.t
			});
		}
		/** Hard dependency on the client slots service (guarded bundle context). */
		const inject = ["slots"];
		function apply(ctx) {
			if (typeof document !== "undefined") {
				if (document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG) + "]") === null) {
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
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "context",
				priority: -100
			}, (props) => react.default.createElement(MailboxContextNodeView, props)));
			if (typeof document !== "undefined") {
				const disposeCollapse = startCollapseEnhancer();
				ctx.effect(() => disposeCollapse);
			}
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "session-info",
				order: 20,
				label: () => "会话信息 · Session Info",
				inject: (sessionId) => ({ sessionId })
			}, (props) => react.default.createElement(SessionInfoView, props)));
		}
		function fmtTime(ts) {
			if (!ts) return "-";
			const d = new Date(ts);
			const pad = (n) => String(n).padStart(2, "0");
			return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
		}
		function fmtNum(n) {
			return n === void 0 || n === null ? "-" : Number(n).toLocaleString("en-US");
		}
		function InfoRow({ k, v, code }) {
			return react.default.createElement("div", { className: "sb-info-row" }, react.default.createElement("span", { className: "sb-info-key" }, k), react.default.createElement("span", { className: "sb-info-value" + (code ? " sb-info-code" : "") }, v));
		}
		function CopyButton({ text }) {
			const [copied, setCopied] = react.default.useState(false);
			const timerRef = react.default.useRef(null);
			react.default.useEffect(() => () => {
				if (timerRef.current !== null) window.clearTimeout(timerRef.current);
			}, []);
			const onCopy = () => {
				if (copied) return;
				(0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(text).then((ok) => {
					if (!ok) return;
					setCopied(true);
					timerRef.current = window.setTimeout(() => setCopied(false), 1e3);
				});
			};
			return react.default.createElement("button", {
				type: "button",
				className: "sb-info-copy",
				"aria-label": copied ? "已复制" : "复制",
				title: copied ? "已复制 · Copied" : "复制 · Copy",
				onClick: onCopy
			}, copied ? react.default.createElement(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, null) : react.default.createElement(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, null));
		}
		function SessionInfoView(props) {
			const sessionId = props?.sessionId ?? "";
			const [info, setInfo] = react.default.useState(null);
			const [error, setError] = react.default.useState(null);
			const refresh = react.default.useCallback(() => {
				if (!sessionId) return;
				fetch("/api/session-bridge/session-info?sessionId=" + encodeURIComponent(sessionId), { cache: "no-store" }).then((r) => r.json()).then((d) => {
					setInfo(d);
					setError(d?.ok ? null : d?.error ?? "unknown");
				}).catch((e) => setError(String(e)));
			}, [sessionId]);
			react.default.useEffect(() => {
				refresh();
				const timer = window.setInterval(refresh, 3e3);
				return () => window.clearInterval(timer);
			}, [refresh]);
			if (!sessionId) return react.default.createElement("div", { className: "sb-info-root" }, react.default.createElement("span", { className: "sb-info-hint" }, "未绑定会话 · No session bound"));
			if (error && !info) return react.default.createElement("div", { className: "sb-info-root" }, react.default.createElement("span", { className: "sb-info-error" }, "加载失败 · " + error));
			const s = info?.stats;
			const ctx = info?.context;
			const contextText = ctx ? (Number(ctx.messageTokens ?? 0) + Number(ctx.systemTokens ?? 0) + Number(ctx.toolsTokens ?? 0)).toLocaleString("en-US") + " tokens" : "-";
			return react.default.createElement("div", { className: "sb-info-root" }, react.default.createElement("button", {
				type: "button",
				className: "sb-info-refresh",
				onClick: refresh
			}, "刷新 · Refresh"), react.default.createElement("section", { className: "sb-info-section" }, react.default.createElement("span", { className: "sb-info-label" }, "基本信息"), InfoRow({
				k: "名称",
				v: info?.title ?? "-"
			}), InfoRow({
				k: "项目",
				v: info?.project || info?.cwd || "-"
			}), InfoRow({
				k: "来源",
				v: info?.source ?? "DSH"
			}), InfoRow({
				k: "创建",
				v: fmtTime(info?.createdAt)
			}), InfoRow({
				k: "活跃",
				v: fmtTime(info?.activeAt)
			}), InfoRow({
				k: "ID",
				v: info?.id ?? sessionId,
				code: true
			}), react.default.createElement("div", { className: "sb-info-row" }, react.default.createElement("span", { className: "sb-info-key" }, "文件"), react.default.createElement("span", { className: "sb-info-value sb-info-code" }, info?.file ?? "-"), info?.file ? react.default.createElement(CopyButton, { text: info.file }) : null)), react.default.createElement("section", { className: "sb-info-section" }, react.default.createElement("span", { className: "sb-info-label" }, "消息"), InfoRow({
				k: "合计",
				v: fmtNum(s?.messages?.total)
			}), InfoRow({
				k: "用户",
				v: fmtNum(s?.messages?.user)
			}), InfoRow({
				k: "Agent",
				v: fmtNum(s?.messages?.agent)
			}), InfoRow({
				k: "工具",
				v: fmtNum(s?.messages?.tool)
			})), react.default.createElement("section", { className: "sb-info-section" }, react.default.createElement("span", { className: "sb-info-label" }, "Token"), InfoRow({
				k: "合计",
				v: fmtNum(s?.tokens?.total)
			}), InfoRow({
				k: "总输入",
				v: fmtNum(s?.tokens?.input)
			}), InfoRow({
				k: "输出",
				v: fmtNum(s?.tokens?.output)
			}), InfoRow({
				k: "缓存读取",
				v: fmtNum(s?.tokens?.cacheRead)
			})), react.default.createElement("section", { className: "sb-info-section" }, react.default.createElement("span", { className: "sb-info-label" }, "上下文"), InfoRow({
				k: "当前",
				v: contextText
			})), react.default.createElement("span", { className: "sb-info-hint" }, info?.live ? "实时 · live" : "会话未加载 · 部分统计不可用"));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
