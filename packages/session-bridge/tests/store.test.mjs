import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { send, poll, boardMessages, unreadCount, readMessages, sanitizeId, deliveryText, markDelivered, recentMessages, encodeSessionDir, aggregateSessionStats, lastSessionTitle } from "../lib/store.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-"));
const root = path.join(tmp, "bridge");

test("sanitizeId keeps safe chars", () => {
  assert.equal(sanitizeId("ab_c-1.2"), "ab_c-1.2");
  assert.equal(sanitizeId("a/b c"), "a_b_c");
});

test("send + poll roundtrip, cursor advances once", () => {
  send(root, "dev", "approver", "AP-001", "please review");
  const p1 = poll(root, "approver");
  assert.equal(p1.direct.length, 1);
  assert.equal(p1.direct[0].subject, "AP-001");
  assert.equal(p1.direct[0].from, "dev");
  const p2 = poll(root, "approver");
  assert.equal(p2.direct.length, 0, "second poll must be empty");
});

test("board broadcast reaches poll board list", () => {
  send(root, "dev", "board", "hello all", "body");
  const p = poll(root, "anyone");
  assert.equal(p.board.length, 1);
  assert.equal(boardMessages(root, 10).length, 1);
});

test("unreadCount counts only undelivered", () => {
  send(root, "a", "b", "s1", "");
  send(root, "a", "b", "s2", "");
  assert.equal(unreadCount(root, "b"), 2);
  poll(root, "b");
  assert.equal(unreadCount(root, "b"), 0);
});

test("tolerates corrupt lines", () => {
  fs.mkdirSync(path.join(root, "mailbox"), { recursive: true });
  const f = path.join(root, "mailbox", "c.jsonl");
  fs.writeFileSync(f, "{bad json}\n" + JSON.stringify({ seq: 1, ts: 1, from: "a", to: "c", subject: "x", body: "y" }) + "\n", "utf8");
  assert.equal(readMessages(f, 0).length, 1);
});

test("deliveryText marks the cross-session source and keeps subject/body", () => {
  const msg = send(root, "dev-session", "approver", "AP-001 待审批", "请评审方案");
  const text = deliveryText(msg);
  assert.ok(text.startsWith("[📬 跨会话消息 from dev-session]"));
  assert.ok(text.includes("主题：AP-001 待审批"));
  assert.ok(text.includes("请评审方案"));
  const noSubject = { seq: 2, ts: 1, from: "a", to: "b", subject: "", body: "only body" };
  assert.equal(deliveryText(noSubject), "[📬 跨会话消息 from a]\nonly body");
});

test("markDelivered skips delivered seqs without touching the cursor", () => {
  send(root, "a", "d", "s1", "");
  send(root, "a", "d", "s2", "");
  assert.equal(unreadCount(root, "d"), 2);
  markDelivered(root, "d", 1);
  assert.equal(unreadCount(root, "d"), 1, "delivered seq 1 is skipped");
  const p = poll(root, "d");
  assert.equal(p.direct.length, 1, "only seq 2 remains for poll");
  assert.equal(p.direct[0].seq, 2);
  markDelivered(root, "d", 1);
  assert.equal(unreadCount(root, "d"), 0, "idempotent, cursor never moves back");
});

test("delivered skip does not hide earlier undelivered messages", () => {
  send(root, "a", "f", "u1", "");
  send(root, "a", "f", "u2", "");
  markDelivered(root, "f", 2);
  assert.equal(unreadCount(root, "f"), 1, "seq 1 remains unread after seq 2 was delivered");
  const p = poll(root, "f");
  assert.equal(p.direct.length, 1, "poll returns the earlier undelivered message");
  assert.equal(p.direct[0].seq, 1);
  assert.equal(unreadCount(root, "f"), 0);
  const p2 = poll(root, "f");
  assert.equal(p2.direct.length, 0, "consumed once only");
});

test("recentMessages pull-reads any mailbox without consuming the cursor", () => {
  send(root, "a", "e", "m1", "");
  send(root, "b", "e", "m2", "");
  send(root, "a", "e", "m3", "");
  const recent = recentMessages(root, "e", 2);
  assert.equal(recent.length, 2);
  assert.deepEqual(recent.map((m) => m.seq), [2, 3], "last N in log order");
  assert.equal(unreadCount(root, "e"), 3, "read does not consume the cursor");
  assert.equal(recentMessages(root, "e", 100).length, 3, "large limit returns all");
  assert.equal(recentMessages(root, "e", 0).length, 1, "limit clamps to 1");
  send(root, "a", "board", "bm", "");
  assert.equal(recentMessages(root, "board", 10).length, 2, "board readable via recentMessages");
  const p = poll(root, "e");
  assert.equal(p.direct.length, 3, "poll still consumes all after pull reads");
});
test("encodeSessionDir encodes cwd segments", () => {
  assert.equal(encodeSessionDir("C:\\Users\\Admin\\Desktop\\api中转站"), "--C-Users-Admin-Desktop-api~4E2D~8F6C~7AD9--");
  assert.equal(encodeSessionDir("C:\\Users"), "--C-Users--");
});

test("aggregateSessionStats counts messages and tokens", () => {
  const events = [
    { type: "user/message", data: {} },
    { type: "assistant/message", data: {} },
    { type: "tool/call", data: {} },
    { type: "assistant/chunk", data: { usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 10, reasoningTokens: 5 } } },
    { type: "assistant/chunk", data: { usage: { inputTokens: 30, outputTokens: 8 } } },
    { type: "turn/start", data: {} },
  ];
  const s = aggregateSessionStats(events);
  assert.deepEqual(s.messages, { total: 3, user: 1, agent: 1, tool: 1 });
  assert.equal(s.tokens.input, 130);
  assert.equal(s.tokens.output, 28);
  assert.equal(s.tokens.cacheRead, 50);
  assert.equal(s.tokens.total, 158);
  assert.equal(s.usageSteps, 2);
});

test("lastSessionTitle returns the newest title event", () => {
  const events = [
    { type: "session/title", data: { title: "first" } },
    { type: "user/message", data: {} },
    { type: "session/title", data: { title: "second" } },
  ];
  assert.equal(lastSessionTitle(events), "second");
  assert.equal(lastSessionTitle(null), null);
});
