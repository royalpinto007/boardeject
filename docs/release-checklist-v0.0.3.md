# v0.0.3 release checklist

The target release adds Local Freeform Backup / Archive for the exact verified
Freeform 4.5 schema. No tag, release or deployment should happen until every
release-critical gate passes.

- [ ] Re-run the genuine `scan → choose → create → verify` macOS workflow.
- [ ] Verify board titles and safe UUID fallback.
- [ ] Verify selected-board isolation and zero unrelated rows.
- [ ] Verify live DB/WAL/SHM hashes remain unchanged and copied SQLite rejects writes.
- [ ] Verify original image, PDF, video and generic file bytes and SHA-256 hashes.
- [ ] Verify duplicate and missing assets, deterministic archives, corruption,
      tampering, unknown schemas and unsafe paths.
- [ ] Run all tests, formatting, lint, TypeScript and production build.
- [ ] Run local and production browser checks, including genuine captures,
      `/test-capture`, responsive layouts, Privacy and Terms.
- [ ] Run macOS helper compilation, main CI, dependency audit and Gitleaks.
- [ ] Confirm a clean tree and synchronized local and remote `main`.
- [ ] Deploy the exact release commit and repeat production smoke checks.
- [ ] Publish v0.0.3 only after every gate above passes.

Release boundaries remain explicit: there is no restore, write-back or iCloud
manipulation. Unknown schemas fail closed. Database-native records are not
reconstructed into an unverified clipboard payload, and the current database
archive path therefore does not produce an Excalidraw export.
