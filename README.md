# FMB Generator

Browser-based field measurement book plot generator. Enter boundary coordinates, inspect the calculated plot, and export or import an SVG that preserves its source data and display settings.

## Run locally

```bash
deno run --allow-env --allow-net --allow-read main.ts
```

Open the local address shown by Deno, usually `http://localhost:8000`.

## Use

- Enter one point per line as `Name, x, y`, `Name: x, y`, or `x, y`.
- Draw and edit directly on the plot: click empty space to add a point, drag a point to move it, click an edge to insert a point, and press Delete or Backspace to remove the selected point. Arrow keys nudge it; hold Shift for larger and Alt for finer movement.
- Choose **Move graph** and drag the plot to pan the entire graph without changing its coordinates. Middle-mouse dragging also pans.
- Hold Ctrl (or Cmd) while clicking points to select multiple points. Select three points to create an angle arc; click an arc and press Delete or Backspace to remove it.
- Select exactly two points with Ctrl (or Cmd), then choose **Create segment** to draw a segment between them. You can also enter two or more segment points in the **Segments** field.
- Segment lengths are shown when **Labels** is enabled. Choose **Add text** to create text directly on the plot. Double-click it to edit, drag it to reposition it, use arrow keys to nudge selected text, and adjust **Selected text size** to change its size.
- Toggle points, gridlines, all labels, angle arcs, and segments independently.
- Choose plot colors with the color inputs. **Reset colors** restores the active light or dark theme palette.
- Export and import SVG files to retain coordinates, display choices, and custom colors.

## Verify

```bash
deno check app.js
deno test --allow-env distance.test.mjs main_test.ts
```