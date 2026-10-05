# Reviewing Finance Without Intermediaries (partner task · Superteam Poland, 11,300 PLN)

## What the partner asked for
Remove the need for trust from one financial transaction on Solana (devnet fine). The trust-replacing logic must live on-chain — if a backend enforces it, "the intermediary has become you". Name the target user explicitly. At least one full flow from user input to a confirmed transaction, showing the moment the intermediary disappears. Deliverables: a description with design rationale, a PDF of at most 10 slides, a public video of at most 3 minutes and the code repository; demo links are optional, and the app is shown live at the presentation. Judges ask: where in the code does the intermediary disappear, what if a party vanishes mid-way, who holds which permissions, can the author change anything after deploy, and why blockchain rather than a database. Design and test coverage are explicitly NOT graded.

## How to read each criterion here
- **Relevance (30)**: genuinely trustless for the chosen flow — escrow, conditional payout, fair exchange. A custodial wallet with a nice frontend is off-task.
- **Completeness & functionality (25)**: the flow runs end to end on devnet to a confirmed transaction; the demo shows it.
- **Idea & problem (20)**: a named user and a real transaction worth making trustless; "why not a database" has an answer.
- **Implementation potential (15)**: program design is sound (accounts, errors, edge cases), deployable beyond demo.
- **Originality (10)**: beyond a tutorial escrow copy.

## Evidence checklist
- On-chain program in the repo (Anchor/Rust or program source), with a deployed program id and confirmed devnet transactions visible in the demo or README. Do not send transactions yourself.
- Permission map: who can move funds at each state; upgrade authority and admin keys checked. Who holds which keys is a question the judges ask (they do not run an audit).
- The vanishing-party case handled (timeout, refund path) in code.
- PDF deck, video of at most 3 minutes, and a README that explains the flow.

## Verification steps
1. Find the program source; read the instruction handlers — where does custody move on-chain?
2. Check for admin/upgrade authority patterns; note anything the author can change after deploy.
3. Trace the refund/timeout branch — what happens if the counterparty disappears?

## Weak-entry patterns
- Server holds funds or keys and signs "on behalf" of users — the intermediary reborn.
- Tutorial escrow with a renamed README.
- No deployed program, no transaction, only slides.
