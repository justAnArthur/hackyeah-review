# Reviewing Goldman Sachs — AI Control Layer (partner task, 15,000 PLN, English only)

## What the partner asked for
A lightweight gateway, proxy, middleware or SDK wrapper governing agent-to-model, agent-to-MCP and app-to-agent traffic, driven by central policy: controls, block-vs-redact thresholds, allowed models, budgets. A hybrid of deterministic controls (PII/secret patterns, authn/authz) and semantic AI-based controls. Budget and resource governance for paid APIs and local models; historical-attack mitigation with externally fed signatures; real-time metrics and exportable audit logs; an automated test suite with positive and negative cases. Deliverables: the layer, an architecture diagram, a documented sample policy with strictness levels and budget rules, a simple dashboard, a runnable test suite. Judges run the tests, fire ad-hoc prompts, edit config live to see hot reload, ask for performance telemetry, and expect it to run on local models such as Ollama.

## How to read each criterion here
- **Robustness/guardrails (30)**: controls actually catch the bad cases — PII redaction that redacts, prompt-injection signatures that block, budgets that cut off. Depth of the deterministic+semantic hybrid is the heart of the task.
- **Architecture & performance (20)**: gateway is genuinely in the path (proxy or SDK wrapper), low overhead, hot reload of policy without restart, telemetry visible.
- **Security reporting (20)**: real-time metrics plus exportable audit logs — events with enough context to investigate an incident.
- **Test suite (15)**: automated, positive AND negative cases, runnable by judges. Count actual test functions.
- **Implementability & scalability (15)**: pluggable models (cloud + Ollama), sane config format, clear deployment story.

## Evidence checklist
- The gateway code path: requests genuinely pass through it (find the proxy/middleware in source).
- Semantic controls are real model calls, not keyword lists pretending.
- Policy file exists with strictness levels and budget rules; hot reload implemented (watcher or endpoint).
- Audit log write path in code; an export format.
- Test files with negative cases (attacks) not just "should return 200".
- Ollama or another local runner supported in config.

## Verification steps
1. Count test cases and read two: one must be a negative case.
2. Find the redaction/blocking function and check the patterns it handles.
3. Trace a request through the gateway in the source samples: where would policy apply?

## Weak-entry patterns
- A beautiful dashboard wired to nothing (mock data, no gateway).
- Keyword matcher labelled "semantic AI control".
- Tests that only assert the server starts.
