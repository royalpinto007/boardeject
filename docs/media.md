# Product media

## Editable export

`demo.mp4`, `demo.gif` and `demo-poster.png` retain the existing browser recording:
a card moves, its connector follows, and text is edited. The example is synthetic
and remains labeled as such. It demonstrates editable output, not complete
Freeform clipboard compatibility.

## Local Freeform Backup / Archive

`archive-demo.mp4` (12 seconds), `archive-demo.gif` and `archive-poster.png`
show the product flow using result counts from [the Freeform 4.5 native run](https://github.com/royalpinto007/boardeject/actions/runs/34925749384).
The on-screen disclosure identifies the browser interaction as a replay. Creating
the archive still happens through the macOS helper and is not simulated as a
production browser capability.

The source catalog has two boards. The selected board is `Untitled 2`, with seven
objects and seven referenced assets. Creation and independent verification
checked ten files and seven assets with zero missing/corrupted entries.
The archive and a corrupted copy were independently rechecked on Ubuntu when
preparing the original release evidence. Raw databases, archives and run reports
are excluded from the public media set.

The public walkthrough replaces the old terminal-heavy recording. It exposes only
the board name, useful counts, progress, and verification result. UUIDs, hashes,
and manifests remain in technical documentation and the helper output.

## Social preview

`apps/web/public/social-preview.png` is a 1200 × 630 card covering editable export
and local archive, with the no-restore boundary. It replaces the outdated
development-preview screenshot. The same image is suitable for GitHub's social
preview setting, which requires uploading through GitHub's repository settings.
