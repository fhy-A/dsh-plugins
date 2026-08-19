/**
 * dsh-session-bridge: cross-session mailbox for DSH web sessions.
 *
 * Host-half plugin registering five model-facing tools:
 *   mailbox_send     - send a message to another session (or the shared board)
 *   mailbox_poll     - read new messages addressed to THIS session + board
 *   mailbox_read     - pull-only read of ANY session's recent messages (no cursor, no wake)
 *   mailbox_inspect  - list known sessions with unread counts
 *   mailbox_board    - read recent shared-board messages
 *
 * Storage: <DSH_HOME>/session-bridge/ (append-only JSONL per mailbox).
 *
 * Delivery (v6, push model): mailbox_send to a LIVE session writes the store
 * and delivers the message into that session's chat history (v3 bubble
 * rendering) via Agent.followup — the target agent is woken to process it in
 * an automatic turn and reply. Turns are only ever triggered by a real new
 * message: there is no polling and no auto-read (mailbox_read / mailbox_poll
 * are explicit pull tools), and to=board never wakes anyone, so the reply
 * chain is bounded by actual work and cannot self-loop. Non-live targets keep
 * the v1 store-only behavior; delivered seqs are tracked so mailbox_poll
 * skips them.
 */
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import {
  BOARD,
  aggregateSessionStats,
  boardMessages,
  deliveryText,
  encodeSessionDir,
  lastSessionTitle,
  markDelivered,
  poll,
  recentMessages,
  rootDir,
  sanitizeId,
  send,
  unreadCount,
} from "./store.js";

export const name = "session-bridge";

export const inject = ["tools", "sessionQuery", "agents", "sessions", "webServer"];

function render(_args: unknown, value: unknown) {
  return [{ type: "text" as const, text: JSON.stringify(value, null, 2) }];
}

/** Build one plugin-source user message carrying a delivered mailbox message. */
function buildDeliveryMessage(text: string, from: string) {
  return {
    id: randomUUID(),
    role: "user" as const,
    content: [{ type: "text" as const, text }],
    source: { kind: "plugin" as const, plugin: "session-bridge", from },
  };
}

/**
 * Deliver one stored message into a live target agent's session history and
 * wake the target agent to process it (Agent.followup): the message becomes
 * visible in the target's chat history and the target runs an automatic turn
 * and replies. Turns are only ever triggered by a real new message — there is
 * no polling, no auto-read, and the shared board never wakes anyone — so the
 * reply chain is bounded by actual work. Returns true when delivery
 * succeeded; never throws.
 */
function tryDeliver(ctx: any, to: string, msg: { seq: number; from: string; subject: string; body: string }): { ok: boolean; error?: string } {
  const target = ctx.agents?.get?.(to);
  if (!target || typeof target.followup !== "function") return { ok: false };
  try {
    target.followup(buildDeliveryMessage(deliveryText(msg), msg.from));
    return { ok: true };
  } catch (e: any) {
    const error = e?.message ?? String(e);
    try {
      ctx.logger?.warn?.(`session-bridge: delivery to ${to} failed: ${error}`);
    } catch {
      /* logging must never break the send path */
    }
    return { ok: false, error };
  }
}

export function apply(ctx: any): void {
  const root = rootDir();

  ctx.tools.register(defineTool({
    name: "mailbox_send",
    description:
      "Send a message to another DSH session's mailbox (cross-session communication) or to the shared board. " +
      "Use mailbox_inspect first to find the target session id and see who is active. " +
      "Reply targeting is YOUR decision: send to another session only when that agent's continued work is " +
      "actually needed (e.g. an approval request). When the task is done, or a user decision or report is " +
      "required, reply to the user directly in this session instead of mechanically replying to the sender. " +
      "When you are waiting on another agent's reply, do NOT poll: read their recent messages with " +
      "mailbox_read within your own turns and decide the next step from what you see — that costs no extra " +
      "turns and triggers nothing on their side. " +
      "If the target session is live, the message is ALSO delivered into its chat history as a " +
      "'[📬 跨会话消息]' entry (visible as a message bubble with marker/timestamp/copy) AND the target " +
      "agent is woken to process it in an automatic turn and reply. Turns are only ever triggered by a real " +
      "new message: there is no polling and no auto-read (mailbox_read/mailbox_poll are explicit pull tools), " +
      "and to=board never wakes anyone, so the reply chain is bounded by actual work and cannot self-loop. " +
      "Delivered messages are tracked and skipped by mailbox_poll (which never returns them twice). " +
      "If the target is not live, or for to=board, the message only lands in the store. " +
      "Messages are persisted under <DSH_HOME>/session-bridge/ and are only visible to the addressed session " +
      "(plus everyone on the board). Never put API keys or secrets in a message.",
    parameters: {
      to: {
        type: "string",
        required: true,
        description: "Target session id from mailbox_inspect, or the literal 'board' for the shared public board.",
      },
      subject: {
        type: "string",
        required: true,
        description: "Short subject line, e.g. 'AP-001 待审批'.",
      },
      body: {
        type: "string",
        required: true,
        description: "Full message body.",
      },
    },
    output: { schema: { type: "json" }, render },
    async execute(args: any, exec: any) {
      const from = exec?.agent?.id ?? "unknown";
      const to = String(args?.to ?? "").trim();
      if (!to) return { ok: false, error: "missing 'to'" };
      const msg = send(root, from, to, args?.subject ?? "", args?.body ?? "");
      let delivered = false;
      let deliveryError: string | undefined;
      if (to !== BOARD && to !== from) {
        const outcome = tryDeliver(ctx, to, msg);
        delivered = outcome.ok;
        deliveryError = outcome.error;
        if (delivered) markDelivered(root, to, msg.seq);
      }
      return {
        ok: true,
        messageId: sanitizeId(to) + "#" + msg.seq,
        to,
        from,
        seq: msg.seq,
        ts: msg.ts,
        delivered,
        ...(deliveryError !== undefined ? { deliveryError } : {}),
        ...(delivered
          ? { note: "delivered into target history and target agent woken to process it (push model)" }
          : to !== BOARD && deliveryError === undefined
            ? { note: "target session is not live; message queued for mailbox_poll" }
            : {}),
      };
    },
  }));

  ctx.tools.register(defineTool({
    name: "mailbox_read",
    description:
      "Pull-only read of the most recent messages of ANY session's mailbox (or the shared board). " +
      "Unlike mailbox_poll it does NOT consume the read cursor and does NOT wake anyone, so it is safe to " +
      "call whenever you need to check what another session recently sent or received — e.g. a developer " +
      "session reading the approver's latest messages before replying, or an approver checking the " +
      "developer's progress within its own turn while waiting for a reply (read within your own turns; " +
      "never schedule or repeat reads as polling — that wastes turns and this read never triggers them). " +
      "Use mailbox_inspect to find session ids; use mailbox_poll to consume your own new messages.",
    parameters: {
      sessionId: {
        type: "string",
        required: true,
        description: "Target session id from mailbox_inspect, or the literal 'board' for the shared public board.",
      },
      limit: {
        type: "number",
        description: "Maximum number of recent messages to return (1..50, default 20).",
      },
    },
    output: { schema: { type: "json" }, render },
    async execute(args: any) {
      const sid = String(args?.sessionId ?? "").trim();
      if (!sid) return { ok: false, error: "missing 'sessionId'" };
      const limit = Math.min(50, Math.max(1, Number(args?.limit) || 20));
      const messages = recentMessages(root, sid, limit);
      return { ok: true, sessionId: sid, count: messages.length, messages };
    },
  }));

  ctx.tools.register(defineTool({
    name: "mailbox_poll",
    description:
      "Read new messages addressed to THIS session plus new shared-board messages. " +
      "Messages delivered to a live session are already visible in this chat history and are skipped here; " +
      "poll returns only messages that were NOT delivered (target was not live, or board traffic). " +
      "Polling advances a per-session read cursor, so each message is returned exactly once. " +
      "For a non-consuming look at ANY session's recent messages use mailbox_read instead. " +
      "Call this at the start of work or when the user asks you to check for messages, " +
      "especially in a dual-agent workflow (developer session <-> approval session).",
    parameters: {},
    output: { schema: { type: "json" }, render },
    async execute(_args: any, exec: any) {
      const sid = exec?.agent?.id;
      if (!sid) return { ok: false, error: "no agent context" };
      const result = poll(root, sid);
      return {
        ok: true,
        session: sid,
        count: result.direct.length + result.board.length,
        direct: result.direct,
        board: result.board,
      };
    },
  }));

  ctx.tools.register(defineTool({
    name: "mailbox_inspect",
    description:
      "List all known DSH sessions (id, cwd, created, live/persisted, unread message counts) so you can " +
      "address mailbox_send and see which sessions are active. Also returns your own session id.",
    parameters: {},
    output: { schema: { type: "json" }, render },
    async execute(_args: any, exec: any) {
      let records: any[] = [];
      try {
        records = await ctx.sessionQuery.listSessions();
      } catch (e: any) {
        return { ok: false, error: "listSessions failed: " + (e?.message ?? String(e)) };
      }
      const rows: any[] = [];
      for (const rec of records) {
        const sid = rec?.header?.id;
        if (!sid) continue;
        rows.push({
          id: sid,
          cwd: rec?.header?.cwd ?? "",
          createdAt: rec?.header?.createdAt ?? null,
          live: Boolean(rec?.live),
          persisted: Boolean(rec?.persisted),
          unread: unreadCount(root, sid),
        });
      }
      rows.sort((a: any, b: any) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
      return {
        ok: true,
        self: exec?.agent?.id ?? null,
        sessions: rows,
        hint: "Send with mailbox_send to=<id>; broadcast with to=board; pull-read any session with mailbox_read.",
      };
    },
  }));

  if (ctx.webServer) {
    ctx.effect(() => ctx.webServer.register({
      kind: "exact",
      path: "/api/session-bridge/session-info",
      handler: async (req: any, res: any) => {
        let sessionId = "";
        try {
          sessionId = new URL(req.url ?? "/", "http://localhost").searchParams.get("sessionId") ?? "";
        } catch { /* keep empty */ }
        const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
        let payload: any = { ok: false, error: "session not found" };
        if (/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) {
          try {
            const live: any = ctx.sessions?.get?.(sessionId);
            let header: any = null;
            let events: any = null;
            let title: string | null = null;
            if (live) {
              header = live.header;
              events = live.events;
              title = lastSessionTitle(events);
            } else {
              const records: any = await ctx.sessionQuery.listSessions();
              const rec = (records ?? []).find((r: any) => r?.header?.id === sessionId);
              if (rec) header = rec.header;
            }
            if (header) {
              const cwd = header.cwd ?? "";
              const lastEvent: any = Array.isArray(events) && events.length > 0 ? events[events.length - 1] : null;
              // Projection cache (persisted by DSH) is the preferred source for
              // title / token usage / context pressure; event aggregation is a fallback.
              let cacheRow: any = null;
              try {
                const raw = fs.readFileSync(path.join(home, "storages", "session_projcache.json"), "utf8");
                const cache: any = JSON.parse(raw);
                cacheRow = cache?.tables?.sessions?.[sessionId] ?? null;
              } catch { /* cache unavailable */ }
              if (cacheRow?.rows?.title?.val && typeof cacheRow.rows.title.val === "string") title = cacheRow.rows.title.val;
              const tu: any = cacheRow?.rows?.tokenUsage?.val;
              const cp: any = cacheRow?.rows?.contextPressure?.val;
              const cb: any = cacheRow?.rows?.contextBreakdown?.val;
              const fallbackStats = events ? aggregateSessionStats(events) : null;
              const stats = {
                messages: fallbackStats?.messages ?? { total: 0, user: 0, agent: 0, tool: 0 },
                tokens: tu?.totals
                  ? {
                      total: (Number(tu.totals.uncachedInputTokens) || 0) + (Number(tu.totals.outputTokens) || 0),
                      input: Number(tu.totals.uncachedInputTokens) || 0,
                      output: Number(tu.totals.outputTokens) || 0,
                      cacheRead: Number(tu.totals.cacheReadTokens) || 0,
                      cacheWrite: Number(tu.totals.cacheWriteTokens) || 0,
                      reasoning: 0,
                    }
                  : fallbackStats?.tokens ?? null,
              };
              payload = {
                ok: true,
                id: sessionId,
                title,
                project: cwd === "" ? "" : path.basename(cwd),
                cwd,
                source: "DSH",
                live: Boolean(live),
                createdAt: header.createdAt ?? null,
                activeAt: lastEvent?.time ?? cacheRow?.rows?.sessionListMetadata?.val?.lastPromptAt ?? null,
                file: path.join(home, "sessions", encodeSessionDir(cwd), sessionId, "session.jsonl.zstd"),
                stats,
                context: cp ?? null,
                contextBreakdown: cb ?? null,
              };
            }
          } catch (e: any) {
            payload = { ok: false, error: "aggregate failed: " + (e?.message ?? String(e)) };
          }
        } else {
          payload = { ok: false, error: "invalid sessionId" };
        }
        const body = JSON.stringify(payload);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Content-Length": Buffer.byteLength(body),
        });
        res.end(body);
      },
    }), "session-bridge: session-info route");
  }
  // ---- Desktop notifications (task done / failed / blocked when user is away) ----
  const heartbeats = new Map<string, number>();
  const lastNotifyAt = new Map<string, number>();
  const pendingCompletes = new Map<string, ReturnType<typeof setTimeout>>();
  const NOTIFY_DEDUP_MS = 30_000;
  const AWAY_MS = 30_000;
  const COMPLETE_DELAY_MS = 6_000;

  const AUMID = "dsh-session-bridge";
  const notifyWindows = (title: string, text: string) => {
    try {
      const script = [
        "Add-Type -AssemblyName System.Runtime.WindowsRuntime",
        "$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]",
        "$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]",
        "$tmpl = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)",
        "$toastNode = $tmpl.SelectSingleNode('/toast')",
        "$a1 = $tmpl.CreateAttribute('activationType'); $a1.Value = 'protocol'; $toastNode.Attributes.SetNamedItem($a1) | Out-Null",
        "$a2 = $tmpl.CreateAttribute('launch'); $a2.Value = 'http://127.0.0.1:3080'; $toastNode.Attributes.SetNamedItem($a2) | Out-Null",
        "$texts = $tmpl.GetElementsByTagName('text')",
        "$texts.Item(0).AppendChild($tmpl.CreateTextNode(" + JSON.stringify(title) + ")) | Out-Null",
        "$texts.Item(1).AppendChild($tmpl.CreateTextNode(" + JSON.stringify(text) + ")) | Out-Null",
        "$toast = [Windows.UI.Notifications.ToastNotification]::new($tmpl)",
        "$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(" + JSON.stringify(AUMID) + ")",
        "$notifier.Show($toast)",
      ].join("; ");
      spawn("powershell", ["-NoProfile", "-Command", script], { stdio: "ignore" });
    } catch { /* notifications are best-effort */ }
  };

  const away = () => {
    const last = heartbeats.get("__global__") ?? 0;
    return Date.now() - last > AWAY_MS;
  };

  const maybeNotify = (kind: string, title: string, text: string) => {
    const now = Date.now();
    const last = lastNotifyAt.get(kind) ?? 0;
    if (now - last < NOTIFY_DEDUP_MS) return;
    lastNotifyAt.set(kind, now);
    if (away()) notifyWindows(title, text);
  };

  const sessionLabel = (session: any) => {
    try {
      const header = session?.header ?? {};
      const cwd: string = header.cwd ?? "";
      return cwd === "" ? "DSH" : cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "DSH";
    } catch {
      return "DSH";
    }
  };

  const sessionTitleOf = (session: any): string => {
    try {
      const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
      const raw = fs.readFileSync(path.join(home, "storages", "session_projcache.json"), "utf8");
      const cache = JSON.parse(raw);
      const title = cache?.tables?.sessions?.[session?.id]?.rows?.title?.val;
      if (typeof title === "string" && title !== "") return title;
    } catch { /* fall through to event title */ }
    try {
      const t = lastSessionTitle(session?.events);
      if (t) return t;
    } catch { /* ignore */ }
    return sessionLabel(session);
  };

  const replyPreviewOf = (session: any): string => {
    try {
      const events = session?.events ?? [];
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const ev = events[i];
        if (ev?.type !== "assistant/message") continue;
        const content = ev?.data?.content;
        if (!Array.isArray(content)) continue;
        const text = content
          .filter((b: any) => b && typeof b === "object" && b.type === "text" && typeof b.text === "string")
          .map((b: any) => b.text)
          .join(" ")
          .trim();
        if (text !== "") return text.length > 120 ? text.slice(0, 120) + "…" : text;
      }
    } catch { /* ignore */ }
    return "";
  };

  if (ctx.webServer) {
    ctx.effect(() => ctx.webServer.register({
      kind: "exact",
      path: "/api/session-bridge/heartbeat",
      handler: async (_req: any, res: any) => {
        heartbeats.set("__global__", Date.now());
        const body = JSON.stringify({ ok: true });
        res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
        res.end(body);
      },
    }), "session-bridge: heartbeat route");
  }

  ctx.on("session/event", (session: any, event: any) => {
    if (!event || typeof event !== "object") return;
    const type = event.type;
    if (type === "turn/start") {
      const key = session?.id;
      if (key && pendingCompletes.has(key)) {
        clearTimeout(pendingCompletes.get(key)!);
        pendingCompletes.delete(key);
      }
      return;
    }
    if (type !== "turn/end") return;
    const reason = event?.data?.reason?.kind ?? "completed";
    const label = sessionLabel(session);
    if (reason === "completed") {
      const key = session?.id;
      if (!key) return;
      const timer = setTimeout(() => {
        pendingCompletes.delete(key);
        const title = sessionTitleOf(session);
        const preview = replyPreviewOf(session);
        maybeNotify("completed", "DSH · 任务完成 · " + title, preview === "" ? label + " 的任务已完成。" : preview);
      }, COMPLETE_DELAY_MS);
      pendingCompletes.set(key, timer);
    } else if (reason === "error" || reason === "max-tokens" || reason === "interrupted") {
      const title = sessionTitleOf(session);
      const preview = replyPreviewOf(session);
      maybeNotify("failed", "DSH · 任务失败 · " + title, preview === "" ? label + " 的任务出错（" + reason + "）。" : preview);
    } else if (reason === "blocked") {
      const title = sessionTitleOf(session);
      maybeNotify("blocked", "DSH · 需要处理 · " + title, label + " 的任务被阻塞，需要你处理。");
    }
  });

  ctx.tools.register(defineTool({
    name: "mailbox_board",
    description:
      "Read the most recent messages from the shared public board. The board is a common channel every " +
      "session can read; send to it with mailbox_send to=board.",
    parameters: {
      limit: {
        type: "number",
        description: "Maximum number of recent messages to return (1..50, default 20).",
      },
    },
    output: { schema: { type: "json" }, render },
    async execute(args: any) {
      const limit = Math.min(50, Math.max(1, Number(args?.limit) || 20));
      return { ok: true, messages: boardMessages(root, limit) };
    },
  }));
}