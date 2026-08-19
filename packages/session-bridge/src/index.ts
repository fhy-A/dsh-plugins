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
              const contextView: any = live?.getSnapshot?.()?.views?.get?.("contextBreakdown") ?? null;
              const lastEvent: any = Array.isArray(events) && events.length > 0 ? events[events.length - 1] : null;
              payload = {
                ok: true,
                id: sessionId,
                title,
                project: cwd === "" ? "" : path.basename(cwd),
                cwd,
                source: "DSH",
                live: Boolean(live),
                createdAt: header.createdAt ?? null,
                activeAt: lastEvent?.time ?? null,
                file: path.join(home, "sessions", encodeSessionDir(cwd), sessionId, "session.jsonl.zstd"),
                stats: events ? aggregateSessionStats(events) : null,
                context: contextView,
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