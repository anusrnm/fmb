# FMB Studio

A graph-first, single-page field geometry editor with drawing tools, selection workflows, polygon area preview, zoom, and import/export.

## Run

No app server is required. Open [index.html](index.html) directly in a browser.

Optional local server (if your browser blocks file imports from local files):

```bash
deno run --allow-env --allow-net --allow-read main.ts
```

## Main features

- Top menu bar with drawing modes: Select, Box Select, Point, Mid Point, Segment, Parallel, Perpendicular, Polygon, Text.
- Polygon drafting closes by clicking the first vertex and shows transparent area shading while drafting.
- Select mode supports click selection, Ctrl/Cmd additive selection, drag to move, and Delete/Backspace removal.
- Graph takes the main workspace area with major and minor gridlines and smooth zoom/pan.
- Zoom controls include in/out and zoom reset.
- Undo/Redo with keyboard shortcuts.
- Right-click context menu includes View / Copy Coordinates.
- Import/Export for JSON and SVG.
- Mobile toolbar toggle with centered tool icons.

## Shortcuts

- Ctrl/Cmd + Z: Undo
- Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z: Redo
- Delete / Backspace: Delete selection
- 1..9: Switch modes in toolbar order

## Verify

```bash
deno check app.js
deno test --allow-env distance.test.mjs main_test.ts
```