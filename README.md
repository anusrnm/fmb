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
- Top menu bar now includes Angle mode for picking and pinning angle annotations.
- Polygon drafting closes by clicking the first vertex and shows transparent area shading while drafting.
- Select mode supports click selection, Ctrl/Cmd additive selection, drag to move, and Delete/Backspace removal.
- Graph takes the main workspace area with major and minor gridlines and smooth zoom/pan.
- Zoom controls include in/out and zoom reset.
- Undo/Redo with keyboard shortcuts.
- Right-click context menu includes View / Copy Coordinates.
- Right-click context menu includes Join Selected Points.
- Import/Export for JSON and SVG.
- Mobile toolbar toggle with centered tool icons.
- Theme toggle is persisted locally.
- Text mode uses an inline editor on the canvas and text can be edited by double-clicking.
- Midpoint mode previews midpoint on hover and inserts midpoint on click.
- Segment lengths are shown (toggleable in settings).
- Polygon details include area in multiple units and perimeter, auto-hidden on overcrowded shapes.
- Settings panel now has persistent show/hide controls for grid, values, points, labels, text, segments, shapes, and angle annotations.

## Shortcuts

- Ctrl/Cmd + Z: Undo
- Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z: Redo
- Ctrl/Cmd + A: Select all
- Delete / Backspace: Delete selection
- Esc: Switch to Select mode
- Arrow keys: Move selected objects in Select mode
- Shift + Arrow: Coarse movement
- Alt + Arrow: Fine movement (0.01)
- 1..9: Switch modes in toolbar order

## Verify

```bash
deno check app.js
deno test --allow-env distance.test.mjs main_test.ts
```