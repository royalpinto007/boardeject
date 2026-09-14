# Contributing

BoardEject is an early open-source exporter seeking fidelity contributions.
Use Node 22.12+, `npm ci`, and the checks in README. Keep parser, intermediate
model, converter and UI separate. Prefer small Conventional Commits.

Every conversion change needs a fixture and a regression test. Synthetic model
fixtures prove converter behavior, not native parsing fidelity. State fixture
provenance and macOS/Freeform versions. Never commit someone else's private board.
Use original or explicitly licensed sample content. Report unsupported elements
rather than inventing geometry, text, or connector relationships.

Pull requests should explain the behavior, evidence, limitations and checks run.
Do not publish packages, tags or releases without owner approval.
