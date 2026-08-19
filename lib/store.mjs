import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
//#region src/store.ts
/**
* Mailbox store for dsh-session-bridge.
*
* Pure Node-fs logic, independent of Cordis so it can be unit-tested.
* Layout under <DSH_HOME>/session-bridge/:
*   mailbox/<sanitized-session-id>.jsonl  - per-recipient append-only messages
*   board.jsonl                           - shared public board
*   cursors/<sanitized-session-id>.json   - per-session read cursor
*/
const BOARD = "board";
const HOME = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
function rootDir(home = HOME) {
	return path.join(home, "session-bridge");
}
function sanitizeId(id) {
	return String(id).replace(/[^A-Za-z0-9._-]/g, "_");
}
function mailboxPath(root, sessionId) {
	return path.join(root, "mailbox", sanitizeId(sessionId) + ".jsonl");
}
function cursorPath(root, sessionId) {
	return path.join(root, "cursors", sanitizeId(sessionId) + ".json");
}
function deliveredPath(root, sessionId) {
	return path.join(root, "delivered", sanitizeId(sessionId) + ".jsonl");
}
function boardPath(root) {
	return path.join(root, "board.jsonl");
}
function ensureDirs(root) {
	fs.mkdirSync(path.join(root, "mailbox"), { recursive: true });
	fs.mkdirSync(path.join(root, "cursors"), { recursive: true });
	fs.mkdirSync(path.join(root, "delivered"), { recursive: true });
}
function readLines(file) {
	if (!fs.existsSync(file)) return [];
	try {
		return fs.readFileSync(file, "utf8").split("\n");
	} catch {
		return [];
	}
}
function parseMessage(line) {
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
			body: String(m.body ?? "")
		};
	} catch {
		return null;
	}
}
function readMessages(file, afterSeq = 0) {
	const out = [];
	for (const line of readLines(file)) {
		const m = parseMessage(line);
		if (m && m.seq > afterSeq) out.push(m);
	}
	return out;
}
function nextSeq(file) {
	let max = 0;
	for (const line of readLines(file)) {
		const m = parseMessage(line);
		if (m && m.seq > max) max = m.seq;
	}
	return max + 1;
}
function readCursor(root, sessionId) {
	try {
		const raw = fs.readFileSync(cursorPath(root, sessionId), "utf8");
		const j = JSON.parse(raw);
		return {
			last: Number.isFinite(Number(j?.last)) ? Number(j.last) : 0,
			lastBoard: Number.isFinite(Number(j?.lastBoard)) ? Number(j.lastBoard) : 0
		};
	} catch {
		return {
			last: 0,
			lastBoard: 0
		};
	}
}
function writeCursor(root, sessionId, cursor) {
	ensureDirs(root);
	fs.writeFileSync(cursorPath(root, sessionId), JSON.stringify(cursor), "utf8");
}
function send(root, from, to, subject, body) {
	ensureDirs(root);
	const file = to === "board" ? boardPath(root) : mailboxPath(root, to);
	const msg = {
		seq: nextSeq(file),
		ts: Date.now(),
		from,
		to,
		subject: String(subject ?? ""),
		body: String(body ?? "")
	};
	fs.appendFileSync(file, JSON.stringify(msg) + "\n", "utf8");
	return msg;
}
function poll(root, sessionId) {
	ensureDirs(root);
	const cursor = readCursor(root, sessionId);
	const delivered = deliveredSeqs(root, sessionId);
	const direct = readMessages(mailboxPath(root, sessionId), 0).filter((m) => !delivered.has(m.seq) && m.seq > cursor.last);
	const board = readMessages(boardPath(root), cursor.lastBoard);
	let last = cursor.last;
	let lastBoard = cursor.lastBoard;
	for (const m of direct) if (m.seq > last) last = m.seq;
	for (const m of board) if (m.seq > lastBoard) lastBoard = m.seq;
	const next = {
		last,
		lastBoard
	};
	writeCursor(root, sessionId, next);
	return {
		direct,
		board,
		cursor: next
	};
}
function unreadCount(root, sessionId) {
	const cursor = readCursor(root, sessionId);
	const delivered = deliveredSeqs(root, sessionId);
	return readMessages(mailboxPath(root, sessionId), 0).filter((m) => !delivered.has(m.seq) && m.seq > cursor.last).length;
}
function boardMessages(root, limit = 20) {
	const all = readMessages(boardPath(root), 0);
	const n = Math.min(50, Math.max(1, limit));
	return all.slice(-n);
}
/**
* Read the most recent messages of any mailbox (session inbox or the shared
* board) without consuming the read cursor. Pull-only: the caller decides
* when to look, so reading never wakes anyone and cannot create reply loops.
*/
function recentMessages(root, sessionId, limit = 20) {
	const all = readMessages(sessionId === "board" ? boardPath(root) : mailboxPath(root, sessionId), 0);
	const n = Math.min(50, Math.max(1, limit));
	return all.slice(-n);
}
/**
* Compose the user-visible text of a delivered mailbox message, as it appears
* in the target session's chat history (plugin-source user message).
*/
function deliveryText(msg) {
	return `${`[📬 跨会话消息 from ${msg.from}]`}${msg.subject ? `\n主题：${msg.subject}` : ""}\n${msg.body}`;
}
/**
* Set of seqs already delivered into a session's chat history. Poll skips
* these so a delivered message is never returned twice.
*/
function deliveredSeqs(root, sessionId) {
	const set = /* @__PURE__ */ new Set();
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
function markDelivered(root, sessionId, seq) {
	ensureDirs(root);
	const file = deliveredPath(root, sessionId);
	if (deliveredSeqs(root, sessionId).has(seq)) return;
	fs.appendFileSync(file, seq + "\n", "utf8");
}
//#endregion
export { BOARD, boardMessages, boardPath, cursorPath, deliveredPath, deliveredSeqs, deliveryText, mailboxPath, markDelivered, poll, readCursor, readMessages, recentMessages, rootDir, sanitizeId, send, unreadCount, writeCursor };
