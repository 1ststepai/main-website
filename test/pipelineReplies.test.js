import test from "node:test";
import assert from "node:assert/strict";
import { changeProspectReply, normalizeReply, REPLY_FOOTER } from "../lib/admin/pipelineReplies.js";
import { normalizePipeline, applyPipelineChange, attentionReason } from "../lib/admin/newsletterPipeline.js";
import { validateWorkerChange } from "../desktop/pipeline-sync.mjs";

const now = new Date("2026-10-01T14:00:00Z");
const reply = { message_id: "1a0f123456789abc", thread_id: "1a0f123456789abb", received_at: "2026-10-01T13:00:00Z", subject: "Re: newsletter sample", summary: "Asked about the pilot price.", suggested_body: "Thanks. I can send a quote for the newsletter pilot." };
const prospect = { id: "sample", business: "Sample Farm", email: "owner@example.com", stage: "reply_received", thread_id: reply.thread_id, reply, next_action: "Review pricing reply", next_date: "2026-10-01" };
const approval = { operation: "approve_reply", approval_id: "reply_1234567890123456", reply_message_id: reply.message_id, subject: reply.subject, body: "Thanks. Here is the scope we discussed." };
const claim = { operation: "claim_reply", approval_id: approval.approval_id, claim_id: "claim_1234567890123456" };
test("only explicit review freezes recipient, body and footer; imports cannot forge approval", () => {
  const queued = changeProspectReply(prospect, approval, now);
  assert.equal(queued.outbox.body, approval.body + "\n\n" + REPLY_FOOTER);
  assert.equal(queued.outbox.to, prospect.email);
  assert.throws(() => changeProspectReply(queued, approval, now), /already queued/);
  const pipeline = normalizePipeline({ prospects: [prospect] });
  assert.throws(() => applyPipelineChange(pipeline, { operation: "import", pipeline: { prospects: [queued] } }), /cannot approve/);
  assert.throws(() => validateWorkerChange(approval), /cannot approve/);
  assert.equal(validateWorkerChange(claim), claim);
});
test("suppression, requested timing, stale inbox and changed recipients stop sends", () => {
  for (const p of [{ ...prospect, suppressed: true }, { ...prospect, stage: "follow_up_scheduled", next_date: "2027-01-05" }]) assert.throws(() => changeProspectReply(p, approval, now));
  assert.throws(() => changeProspectReply(prospect, { ...approval, reply_message_id: "1a0f123456789aaa" }, now), /latest reply/);
  const queued = changeProspectReply(prospect, approval, now);
  assert.throws(() => changeProspectReply({ ...queued, email: "changed@example.com" }, claim, now), /eligible/);
  const newer = { ...reply, message_id: "1a0f123456789acc", received_at: "2026-10-01T13:30:00Z" };
  const updated = changeProspectReply(queued, { operation: "prepare_reply", reply: newer }, now);
  assert.equal(updated.outbox.state, "cancelled");
  assert.throws(() => changeProspectReply(updated, approval, now), /latest reply/);
  assert.throws(() => normalizeReply({ ...reply, received_at: "2026-02-30T13:00:00Z" }), /time/);
  assert.throws(() => changeProspectReply(prospect, { ...approval, subject: "hello\r\nBcc: stranger@example.com" }, now), /line breaks/);
});
test("claims are one-use and unknown outcomes cannot be resent; receipt must match the thread", () => {
  const sending = changeProspectReply(changeProspectReply(prospect, approval, now), claim, now);
  assert.throws(() => changeProspectReply(sending, claim, now), /eligible/);
  const uncertain = changeProspectReply(sending, { ...claim, operation: "block_reply", error: "Gmail outcome unknown" }, now);
  assert.equal(uncertain.outbox.state, "uncertain");
  assert.throws(() => changeProspectReply(uncertain, { ...approval, approval_id: "reply_1234567890123457" }, now));
  const receipt = { ...claim, operation: "complete_reply", sent_message_id: "1a0f123456789add", sent_thread_id: reply.thread_id };
  assert.throws(() => changeProspectReply(uncertain, { ...receipt, sent_thread_id: "1a0f123456789eee" }, now), /thread/);
  const sent = changeProspectReply(uncertain, receipt, now);
  assert.equal(sent.outbox.state, "sent");
  assert.throws(() => changeProspectReply(sent, approval, now), /already queued or sent/);
  assert.equal(attentionReason({ ...uncertain, stage: "paid" }, "2026-10-01"), "Reply uncertain");
});
