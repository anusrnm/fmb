# FMB Studio

A graph-first, single-page field geometry editor with drawing tools, selection workflows, polygon metrics, zoom/pan, and import/export.

## Run

No app server is required. Open [index.html](index.html) directly in a browser.

Optional local server (if your browser blocks file imports from local files):

```bash
python -m http.server 8000
```
or
```bash
deno run --allow-env --allow-net --allow-read main.ts
```

## Main features

- Drawing modes: Select, Box Select, Point, Mid Point, Segment, Parallel, Perpendicular, Polygon, Angle, and Text.
- Polygon drafting closes by clicking the first vertex and shows draft shading while building.
- Double-click on any segment or polygon edge inserts a new point on that edge.
- Select mode supports click selection, Ctrl/Cmd additive selection, drag to move, and Delete/Backspace removal.
- Graph workspace includes major/minor grid lines and smooth zoom/pan.
- Zoom controls include in/out, support views up to roughly 100 km wide on a 1000 px canvas, and the reset button always shows the current zoom percentage. Zoom remains bounded to preserve browser rendering precision.
- Undo/Redo with keyboard shortcuts.
- Right-click context menu includes Coordinates and Join Selected Points.
- Coordinates dialog is editable:
	- On shapes/objects: opens current coordinates for review/edit/copy.
	- On empty graph area: opens coordinate entry template for drawing.
	- Draw Shape creates a new polygon if no polygon is selected.
	- Draw Shape updates the currently selected polygon if exactly one polygon is selected.
	- If first and last coordinates are identical, the duplicate last point is ignored automatically.
- Text mode uses an inline editor on the canvas; double-click text to edit.
- Midpoint mode previews midpoint on hover and inserts midpoint on click.
- Segment lengths are shown (toggleable in settings).
- Polygon details include area in multiple units and perimeter, with density-aware label display.
- Settings panel includes persistent show/hide controls for grid, values, points, labels, text, segments, shapes, and angle annotations.
- Background image overlay: load a raster image (PNG/JPEG/GIF/WEBP/BMP), adjust opacity, fit it to the current view, or align it with X/Y/Width fields. The image is saved with the diagram (JSON, SVG, autosave) and participates in undo/redo.
- Import/Export supports JSON and SVG (with embedded geometry metadata for SVG round-trip).
- Mobile toolbar toggle with centered tool controls.
- Theme toggle is persisted locally.

## Shortcuts

- Ctrl/Cmd + Z: Undo
- Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z: Redo
- Ctrl/Cmd + A: Select all
- Delete / Backspace: Delete selection
- Esc: Switch to Select mode
- Arrow keys: Move selected objects in Select mode
- Shift + Arrow: Coarse movement
- Alt + Arrow: Fine movement (0.01)
- + / -: Zoom in / out
- Shift + + / -: Coarse zoom (1.5x)
- Alt + + / -: Fine zoom (1.05x)
- 1..9, 0: Switch modes in toolbar order

## Test

Install the test dependencies once:

```bash
npm install
```

Run the complete suite:

```bash
npm test
```

This runs:

- `npm run test:unit`: Node unit tests for the geometry helpers in `distance.js`. Coverage is enforced at 90% for lines, statements, functions, and branches.
- `npm run test:e2e`: Playwright tests in Chromium. The test server starts automatically and covers editor interactions including drawing, selection, construction tools, angle annotations, themes, import/export, and zoom.

Run either suite independently when working on a focused change:

```bash
npm run test:unit
npm run test:e2e
```