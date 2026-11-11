# B-36 render farm

Parallel render for the Hangar Studio video **"Why Did the B-36 Need Ten Engines?"**.

The full video is 20,465 frames (1920x1080, 30 fps), cut into 69 ten-second
pieces. A local machine renders them one by one; this repo lets 12 GitHub
Actions runners render the remaining pieces in parallel instead.

## Layout

- `engine/` — the Hangar Studio Three.js renderer (`render.mjs`), patched with
  a `--parts` flag: `node render.mjs --project ../project --parts 38-40`
  renders only those pieces, at full quality, silent, into
  `project/build/parts_gh/` as `part_XXXX.mp4` with the global piece number.
- `project/` — the B-36 project: shot plan, procedural B-36/B-52 aircraft,
  brand logo, photos. No voiceover or film: the pieces are silent 3D renders;
  narration and archival film are added locally at the finish stage.

Binary files (fonts, logo, photos) are stored base64-encoded as `*.b64`
because the upload path only handles text; the workflows decode them back
before rendering.
- `.github/workflows/` — the render workflows.

## Workflows

- `render-smoke.yml` — renders a single piece (part 38) to prove the setup.
- `render-parts.yml` — 12 runners, pieces 39–68 (the rest of the video).

Each job pushes its finished pieces to a branch named `parts-<range>`
(e.g. `parts-39-41`) and also uploads them as a workflow artifact. The
finished pieces are pulled down locally and stitched into the full video
there — nothing else happens on GitHub.
