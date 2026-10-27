# Agent handoff

## When to use

Use this when work must continue without the previous chat, when a project needs a handoff or proof of done, or when a task is missing a tool or connection.

Studio at `/admin/` is the private record. The Agent Handoff Bridge remains the shared MCP queue for Codex, Dot, and the Grok roles. Do not invent a second queue.

## Project boundary

Read and update one project at a time. Keep that project's goal, brand, tools, decisions, budget, and proof separate from every other project. Do not copy another project's notes in to fill a gap.

## Missing-tool loop

1. Notice the capability the current task needs.
2. Read the tools already stored on that project. Then check current docs for a tool the project already runs, including the bridge.
3. Compare reuse, an existing tool, and a small custom tool. Include setup, fees, usage, maintenance, security, and reliability. Prefer the simplest fit. Do not build a replacement only to avoid a subscription.
4. If the price is unknown, label it unknown and do not estimate savings. If the choice adds a charge or exceeds the project's budget, stop for approval. Make a no-cost choice inside the budget without asking.
5. Configure and test only through a supported method. If no suitable tool exists, build the smallest one, test it, and record how to run and maintain it.
6. Return to the original task and verify that result. Save the decision, evidence, blockers, and one next action in the project handoff.

## Connections

Say what is blocked. Cursor has no bridge actor in agent-handoff-bridge 0.5.0, and another actor's token must not be reused. OpenAI Dot is created in ChatGPT settings. Codex and Grok can be checked from the bridge host with:

```bash
node scripts/connect-handoff-agent.mjs codex
```

Replace `codex` with `studio-read` or a `grok-*` id. The command must not print a token. A saved variable is not a verified connection.

## Proof

Record claimed, tested, deployed, and production-verified only as recorded status. Do not say tests passed or a deployment is live unless that check was actually run and the evidence is attached. A bridge task marked completed is an owner-approved report, not a production check.

Do not put secrets, tokens, or private keys in a handoff, a checkpoint, or a chat.
