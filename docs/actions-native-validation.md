# Apple framework validation from any computer

Run **Actions → Apple native validation → Run workflow**, or:

```sh
gh workflow run native-validation.yml --repo royalpinto007/boardeject
gh run list --workflow native-validation.yml --repo royalpinto007/boardeject
gh run download RUN_ID --repo royalpinto007/boardeject --dir /tmp/boardeject-native-results
```

One standard `macos-latest` runner prints macOS/Xcode versions and checks for
Freeform.app. A small Swift tool round-trips a unique AppKit pasteboard and,
when available, serializes a PencilKit stroke and exports Apple's interpolated
reference points. It never reads the general clipboard, launches Freeform,
signs into iCloud, installs applications, deploys or publishes a release.

The downloadable artifact contains `report.json`, environment and execution
logs, an AppKit envelope, and (when PencilKit succeeds) `native-pen.drawing`
and `pencilkit-reference.json`. Artifacts expire after 14 days and stay outside
the source checkout. Compilation/runtime failures fail the job; missing
PencilKit is explicitly reported, not labelled a passing PencilKit test.

These are Apple-generated test inputs, not real Freeform captures. They can
establish PencilKit interpolation behavior but do not validate Freeform's
private group schema or prove the Cmd+C import workflow.
