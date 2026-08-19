/**
 * Mailbox store for dsh-session-bridge.
 *
 * Pure Node-fs logic, independent of Cordis so it can be unit-tested.
 * Layout under <DSH_HOME>/session-bridge/:
 *   mailbox/<sanitized-session-id>.jsonl  - per-recipient append-only messages
 *   board.jsonl                           - shared public board
 *   cursors/<sanitized-session-id>.json   - per-session read cursor
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface MailMessage {
  seq: number;
  ts: number;
  from: string;
  to: string;
  subject: string;
  body: string;
}

export interface Cursor {
  last: number;
  lastBoard: number;
}

export const BOARD = "board";

const HOME: string = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");

export function rootDir(home: string = HOME): string {
  return path.join(home, "session-bridge");
}

export function sanitizeId(id: string): string {
  return String(id).replace(/[^A-Za-z0-9._-]/g, "_");
}

export function mailboxPath(root: string, sessionId: string): string {
  return path.join(root, "mailbox", sanitizeId(sessionId) + ".jsonl");
}

export function cursorPath(root: string, sessionId: string): string {
  return path.join(root, "cursors", sanitizeId(sessionId) + ".json");
}

export function deliveredPath(root: string, sessionId: string): string {
  return path.join(root, "delivered", sanitizeId(sessionId) + ".jsonl");
}

export function boardPath(root: string): string {
  return path.join(root, "board.jsonl");
}

function ensureDirs(root: string): void {
  fs.mkdirSync(path.join(root, "mailbox"), { recursive: true });
  fs.mkdirSync(path.join(root, "cursors"), { recursive: true });
  fs.mkdirSync(path.join(root, "delivered"), { recursive: true });
}

function readLines(file: string): string[] {
  if (!fs.existsSync(file)) return [];
  try {
    return fs.readFileSync(file, "utf8").split("\n");
  } catch {
    return [];
  }
}

function parseMessage(line: string): MailMessage | null {
  if (!line.trim()) return null;
  try {
    const m = JSON.parse(line);
    if (!m || typeof m !== "object" || !Number.isFinite(Number(m.seq))) return null;
    return {
      seq: Number(m.seq),
      ts: Number(m.ts) || 0,
      from: String(m.from ?? ""),
      to: String(m.to ?? ""),
      subject: String(m.subject ?? ""),
      body: String(m.body ?? ""),
    };
  } catch {
    return null; // tolerate corrupt lines
  }
}

export function readMessages(file: string, afterSeq = 0): MailMessage[] {
  const out: MailMessage[] = [];
  for (const line of readLines(file)) {
    const m = parseMessage(line);
    if (m && m.seq > afterSeq) out.push(m);
  }
  return out;
}

function nextSeq(file: string): number {
  let max = 0;
  for (const line of readLines(file)) {
    const m = parseMessage(line);
    if (m && m.seq > max) max = m.seq;
  }
  return max + 1;
}

export function readCursor(root: string, sessionId: string): Cursor {
  try {
    const raw = fs.readFileSync(cursorPath(root, sessionId), "utf8");
    const j = JSON.parse(raw);
    return {
      last: Number.isFinite(Number(j?.last)) ? Number(j.last) : 0,
      lastBoard: Number.isFinite(Number(j?.lastBoard)) ? Number(j.lastBoard) : 0,
    };
  } catch {
    return { last: 0, lastBoard: 0 };
  }
}

export function writeCursor(root: string, sessionId: string, cursor: Cursor): void {
  ensureDirs(root);
  fs.writeFileSync(cursorPath(root, sessionId), JSON.stringify(cursor), "utf8");
}

export function send(root: string, from: string, to: string, subject: string, body: string): MailMessage {
  ensureDirs(root);
  const file = to === BOARD ? boardPath(root) : mailboxPath(root, to);
  const msg: MailMessage = {
    seq: nextSeq(file),
    ts: Date.now(),
    from,
    to,
    subject: String(subject ?? ""),
    body: String(body ?? ""),
  };
  fs.appendFileSync(file, JSON.stringify(msg) + "\n", "utf8");
  return msg;
}

export function poll(root: string, sessionId: string): { direct: MailMessage[]; board: MailMessage[]; cursor: Cursor } {
  ensureDirs(root);
  const cursor = readCursor(root, sessionId);
  const delivered = deliveredSeqs(root, sessionId);
  // Delivered messages are already visible in the session history, so poll
  // skips them explicitly; the cursor only ever records poll consumption.
  // Skipping delivered seqs by set (not by cursor) keeps earlier messages
  // readable even when a later message was delivered out of order (e.g. the
  // target was offline when the earlier one arrived).
  const direct = readMessages(mailboxPath(root, sessionId), 0)
    .filter((m) => !delivered.has(m.seq) && m.seq > cursor.last);
  const board = readMessages(boardPath(root), cursor.lastBoard);
  let last = cursor.last;
  let lastBoard = cursor.lastBoard;
  for (const m of direct) if (m.seq > last) last = m.seq;
  for (const m of board) if (m.seq > lastBoard) lastBoard = m.seq;
  const next: Cursor = { last, lastBoard };
  writeCursor(root, sessionId, next);
  return { direct, board, cursor: next };
}

export function unreadCount(root: string, sessionId: string): number {
  const cursor = readCursor(root, sessionId);
  const delivered = deliveredSeqs(root, sessionId);
  return readMessages(mailboxPath(root, sessionId), 0)
    .filter((m) => !delivered.has(m.seq) && m.seq > cursor.last).length;
}

export function boardMessages(root: string, limit = 20): MailMessage[] {
  const all = readMessages(boardPath(root), 0);
  const n = Math.min(50, Math.max(1, limit));
  return all.slice(-n);
}

/**
 * Read the most recent messages of any mailbox (session inbox or the shared
 * board) without consuming the read cursor. Pull-only: the caller decides
 * when to look, so reading never wakes anyone and cannot create reply loops.
 */
export function recentMessages(root: string, sessionId: string, limit = 20): MailMessage[] {
  const file = sessionId === BOARD ? boardPath(root) : mailboxPath(root, sessionId);
  const all = readMessages(file, 0);
  const n = Math.min(50, Math.max(1, limit));
  return all.slice(-n);
}

/**
 * Compose the user-visible text of a delivered mailbox message, as it appears
 * in the target session's chat history (plugin-source user message).
 */
export function deliveryText(msg: MailMessage): string {
  const header = `[📬 跨会话消息 from ${msg.from}]`;
  const subject = msg.subject ? `\n主题：${msg.subject}` : "";
  return `${header}${subject}\n${msg.body}`;
}

/**
 * Set of seqs already delivered into a session's chat history. Poll skips
 * these so a delivered message is never returned twice.
 */
export function deliveredSeqs(root: string, sessionId: string): Set<number> {
  const set = new Set<number>();
  for (const line of readLines(deliveredPath(root, sessionId))) {
    const n = Number(line.trim());
    if (Number.isFinite(n)) set.add(n);
  }
  return set;
}

/**
 * Record one message as delivered (visible in the session history), so
 * mailbox_poll skips it. Idempotent: repeating a seq writes nothing. This
 * never touches the read cursor — the cursor only records poll consumption,
 * so an earlier undelivered message stays readable even when a later message
 * is delivered first.
 */
export function markDelivered(root: string, sessionId: string, seq: number): void {
  ensureDirs(root);
  const file = deliveredPath(root, sessionId);
  if (deliveredSeqs(root, sessionId).has(seq)) return;
  fs.appendFileSync(file, seq + "\n", "utf8");
}
