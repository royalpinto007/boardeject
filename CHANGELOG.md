# Changelog

## Unreleased

## 0.0.5 - 2026-09-25

- Added Archive Explorer at `/open`: independently verify an existing `.boardejectarchive`, browse original assets, preview supported media, and download individual files or a ZIP of originals.
- Added local browser processing without a Mac/helper, offline inspection after the page loads, missing-file warnings, and optional included preview/export downloads.
- Added bounded worker-based verification and extraction, safe download names, strict required-record checks, and adversarial ZIP/metadata regression tests.
- Kept archive format version 1, existing helper compatibility, no restore/write-back, and no unverified database-to-Excalidraw conversion.

- Fixed archive verification crashing on manifests with malformed file or asset records; they now fail closed with reported errors.
- Added deterministic adversarial coverage over clipboard capture and archive verification boundaries.
- Added export and backup guide pages with search metadata, and registered them in the sitemap.
- Added automatic site deployment to Cloudflare Pages on push to main.
- Shortened the README, added search keywords, and fixed the social preview version label.
- Raised site text contrast to WCAG AA, allowed the analytics beacon in the CSP, and reduced poster image weight.
- Kept restore, write-back, iCloud manipulation, and unverified ink and version support explicitly out of scope.

## 0.0.4 - 2026-09-17

- Added direct Freeform clipboard import through the authenticated localhost Mac helper, with no manual capture file in the normal export flow.
- Added the website-driven archive flow for scanning real boards, creating and downloading a selected-board archive, and verifying it locally.
- Added DMG onboarding with automatic website opening, Local Network Access guidance, helper reconnect states, and optional Launch at Login.
- Added Universal, Apple silicon, and Intel helper packages while retaining the command-line fallback for developers.
- Kept clipboard conversion, database access, archive creation, and verification local to the user's Mac with no board uploads or cloud processing.

## 0.0.3 - 2026-09-15

- Added local Freeform 4.5 board discovery and strict verified title decoding with a safe UUID fallback.
- Added selected-board-only native extraction without modifying the live Freeform database, WAL or SHM files.
- Preserved original image, PDF, video and generic file bytes with SHA-256 manifests and safe deduplication.
- Added deterministic `.boardejectarchive` creation and independent integrity verification, including corruption, tampering and unsafe-path detection.
- Added strict schema fingerprint gating and fail-closed handling for unknown Freeform database versions.
- Kept restore, write-back, iCloud manipulation and unverified database-native Excalidraw reconstruction explicitly unsupported.

## 0.0.2 - 2026-09-14

- Added verified native table conversion for unequal dimensions, structural edits, ordering, multiple tables, colors, borders, and attached text.
- Preserved verified image masks and shadow parameters, with documented blur approximation, plus improved editable mixed and multiline text handling.
- Fixed ink mask safety and added Apple-generated width/force decoder coverage.
- Documented genuine macOS Freeform 4.5 Pen behavior and moved Apple Pencil pressure/eraser validation to future iPad work in issue #20.
- Expanded browser checks to exercise all 68 genuine Freeform captures and the legal, responsive, local-first website flow.

## 0.0.1 - 2026-09-13

- Versioned clipboard envelope and libfreeform WASM decoding.
- Conservative native adapter with explicit fidelity diagnostics.
- Editable Excalidraw export and official editor integration.
- Synthetic example, regression tests and recorded editing proof.
- One-shot Swift capture helper and macOS compilation CI.

- Real macOS native captures and table differentials with 50 regression tests.
- Privacy/terms pages and explicit support matrix.

Early limited-scope release. Version-7 native boards remain rejected; native tables, nonidentity group transforms, native assets/rich text and erased or pressure-sensitive ink are not claimed complete. See the README support matrix.
