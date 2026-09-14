# v0.0.2 release checklist

No tag, GitHub release, deployment or package publication happens automatically.
The manual release-readiness workflow runs checks only and has read-only access.

The owner approved an early release with the README's limited support matrix.
Incomplete fidelity stays explicit and tracked. Before publication:

- [x] Classify every open issue and confirm #20 is future iPad validation.
- [x] Verify README and website claims against genuine native fixtures.
- [x] Run all 125 tests, formatting, lint, type checks, and build.
- [x] Run local and production browser checks, including all genuine captures,
      `/test-capture`, Privacy, Terms, demo, and responsive layouts.
- [x] Compile and smoke-test the Swift helper on a clean macOS runner.
- [x] Run dependency, Gitleaks, secret/history, and clean-tree checks.
- [x] Confirm CI and the manual native validation workflow are green.
- [x] Deploy the exact merged commit and repeat production checks.
- [ ] Create and publish v0.0.2 only after every gate above passes.
