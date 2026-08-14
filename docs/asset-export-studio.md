# Asset Export Studio

Generates real, downloadable dossiers, fichas, catálogos and QR-bearing
pieces from a developer property, using the tenant's Brand Kit
automatically. This document covers what exists today, how the pieces fit
together, and the known, honestly-documented limitations — it does not
describe planned or aspirational features.

## What it actually does today

- **PDF output** (real, via [`pdf-lib`](https://github.com/Hopding/pdf-lib)): A4 portrait/landscape, A5 portrait, multi-page dossiers, A3 print posters.
- **Templates**: reusable, versioned layouts (`asset_export_templates` + `_versions`). Editing a published template creates a new version and keeps the old one — nothing is silently overwritten.
- **Projects**: one instance of a template applied to one real asset (`asset_export_projects` + `_versions`). Freezes a `priceAtCreation` snapshot and flags when the live price has since changed.
- **Visual editor** (`components/admin/AssetExportCanvasEditor.vue`): drag/resize/lock elements, bind them to real data tokens, add/reorder/duplicate pages, undo/redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z). Reachable both from **Plantillas** (editing the template) and **Piezas generadas** (editing one project's own copy of the structure, independent of its template).
- **Brand Kit**: logo, colors, contact info, legal text — resolved per-organization and applied automatically to every render (`server/utils/assetExport/bindings.ts`).
- **Dynamic QR codes**: every render's QR encodes a stable `/q/{code}` short link (`server/utils/assetExport/qrLinks.ts`), never the destination directly, so the destination can change without reprinting anything. Scans are logged per-tenant.
- **Batches**: render N asset+template combinations in one go (`export_batches` / `export_batch_items`), with cancel/retry, and a single **"Descargar todo (ZIP)"** bundle of everything that succeeded.
- **Catalogs**: one combined, paginated PDF (cover + index + one section per asset) assembled from per-asset fragments (`asset_export_catalogs` / `_items`).
- **Post-render validation** (`server/utils/assetExport/renderValidation.ts` + `qrValidation.ts`): every render is checked before it's ever marked `completed` —
  - the PDF actually opens and has the exact page count the structure asked for;
  - any QR the template contains is decoded back (via a from-scratch matrix rasterizer + [`jsqr`](https://github.com/cozmo/jsQR), not a simulated check) and compared byte-for-byte against what was encoded;
  - a template that binds contact info the Brand Kit never filled in gets a warning, not a failure.
  A failed validation blocks the render (`422`, render row marked `failed`) instead of ever handing out a broken file. Results are stored as JSON on `validation_json` (on `asset_export_renders`, `asset_export_catalog_items`, and `asset_export_catalogs`).

## What it deliberately does not do (and why)

- **No PNG/JPG/social-image output.** Every PDF/print format renders today; the three social formats (`social_feed_square`, `social_feed_portrait`, `social_story`) are defined in the format registry with `renderReady: false` and are rejected with a clear 422 before any render is attempted — never a fabricated/placeholder image. The reason is architectural, not an oversight: this app draws every element with `pdf-lib`'s low-level vector API, and there is no HTML→raster or canvas pipeline in this codebase. `satori` + `resvg` (the natural WASM route for this) was evaluated and is currently blocked by a dynamic-codegen restriction under Cloudflare Workers. Unlocking this is a real, scoped follow-up project (a WASM rasterizer), not a one-line fix — see Roadmap below.
- **No carousels or multi-slide social sets** — this follows directly from the point above (no image renderer to build slides from).
- **No Cloudflare Queues / Durable Objects.** Batches and catalogs use a client-driven "process one pending item per request" loop (`.../process-next`) instead — this project's `wrangler.toml` has no Queues binding. Each call stays comfortably inside a Worker's CPU/wall-clock budget; the tradeoff is that overall progress depends on the browser tab staying open and polling (it auto-resumes on page load if the batch/catalog is still running).
- **Only `developer_property` assets.** There's a second listing table in this schema (`agent_properties`, "Property (secondary sale)") with an admin CRUD screen, but it has no public-facing page anywhere in the app. Wiring Asset Export to it would mean generating a QR/public URL that points nowhere real — extending this is blocked on building that public page first, not on Asset Export itself.
- **Role granularity.** Permissions are `requireAdmin` (any `admin`/`super_admin`) — there's no finer split between "can generate a dossier" and "can edit the Brand Kit / publish a template." The schema only has three roles total (`super_admin` | `admin` | `user`); adding a fourth is a cross-cutting auth change, not scoped to this module.

## Architecture

```
asset (developer_properties) ──┐
Brand Kit (brand_kits) ─────────┼──► resolveAssetBindings() ──► { values, images }
tenant (organizations) ─────────┘              │
                                                ▼
                       Template (structureJson) │
                                                ▼
                                          renderPdf()  ──► real PDF bytes
                                                ▼
                                   validateRenderedPdf() ──► ok? / errors / warnings
                                                ▼
                                        R2 (asset-export-renders/…)
                                                ▼
                                   asset_export_renders (D1 metadata)
```

Key modules (`server/utils/assetExport/`):

| File | Responsibility |
|---|---|
| `bindings.ts` | Resolves every `{{asset.*}}` / `{{tenant.*}}` token against real DB rows. Empty data → empty string, never invented placeholder text. |
| `formats.ts` | Single source of truth for every export format, including which ones are actually render-ready. |
| `types.ts` | The document schema (`TemplateStructure`/`TemplateElement`) + `validateStructure()`. |
| `pdfRenderer.ts` | Turns a `TemplateStructure` into real PDF bytes with `pdf-lib`. Exports `resolveBindingText`/`BINDING_RE`, reused by the validator. |
| `catalogRenderer.ts` | Assembles a cover + index + N fragments into one combined catalog PDF. |
| `qrLinks.ts` | Mints/reuses the per-asset `/q/{code}` short link. |
| `qrValidation.ts` | Rasterizes the exact matrix drawn into the PDF and decodes it back with `jsqr` — a real round-trip, not a simulated pass. |
| `renderValidation.ts` | Post-render QA: PDF sanity + QR round-trip + template-driven contact-field warnings. |
| `../zip.ts` | Dependency-free STORED-only ZIP writer (no compression library — Workers has no zlib, and the contents are already-compressed PDFs). |

## Adding a new template

1. `POST /api/admin/asset-export/templates` with a `structure: { pages: [...] }` (see `types.ts` for the element schema — `text`, `image`, `qr`, `shape`).
2. Edit visually from **Plantillas** (`/admin/asset-export/templates`) or via the raw-JSON toggle in the same modal.
3. Bind elements to real tokens only — see `bindings.ts` for the full list (`asset.title`, `asset.price`, `asset.masterPlanImage`, `tenant.phone`, …). A binding to a token the render doesn't have data for renders blank; it does not error.
4. `PUT .../publish` when ready. Publishing after the first publish creates a new version automatically — the previous one stays intact and restorable.

## Adding a new format

Add an entry to `FORMATS` in `formats.ts` with `renderReady: true` only once `pdfRenderer.ts` (or a future image renderer) can actually produce it. Setting `renderReady: false` is the honest way to let templates/UI reference a format that doesn't render yet — every render endpoint checks this flag and 422s before attempting anything.

## Roadmap (real gaps, not fabricated ones)

- A Workers-compatible raster pipeline (most likely `@resvg/resvg-wasm` fed by hand-built SVG, since `satori` is blocked) to unlock PNG/JPG output, carousels, and the three social formats.
- Extending asset support to `agent_property` once (and only once) it has a real public page to point a QR at.
- A finer-grained permission between "generate exports" and "edit Brand Kit / publish templates," if the product ever needs non-admin staff to use this module.
