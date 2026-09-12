# Dependency review

Reviewed 2026-09-12. `npm audit` reports zero vulnerabilities in the lockfile.
The GitHub alerts API reports that Dependabot security alerts are disabled;
this is not equivalent to a successful security-alert scan.

The five observed Dependabot items are version-update pull requests:

- actions/checkout and actions/setup-node major upgrades: CI passed, reviewable separately.
- React and React DOM major upgrades: must be tested together, not independently.
- @types/node 26: not appropriate for the project's Node 22 target without a deliberate runtime upgrade.

Do not dismiss security findings merely to reduce the count. Keep compatible
patches separate from major migrations. The React 18 runtime currently passes
the actual Excalidraw drag/edit checks; a major change needs the same checks.
