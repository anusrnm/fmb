import assert from "node:assert/strict";
import test from "node:test";
import { queryUi } from "../../dom.js";

// Minimal stub document: records lookups and returns identifiable markers so the
// mapping can be verified without a real DOM or jsdom.
function stubDocument() {
  const byId = [];
  const bySelector = [];
  return {
    byId,
    bySelector,
    getElementById(id) {
      byId.push(id);
      return { id };
    },
    querySelectorAll(selector) {
      bySelector.push(selector);
      return [{ selector }, { selector }];
    },
  };
}

test("queryUi resolves elements by id and returns them", () => {
  const doc = stubDocument();
  const ui = queryUi(doc);
  assert.deepEqual(ui.graph, { id: "graph" });
  assert.deepEqual(ui.versionBadge, { id: "version-badge" });
  assert.deepEqual(ui.helpBtn, { id: "help-btn" });
  assert.deepEqual(ui.helpDialog, { id: "help-dialog" });
  assert.deepEqual(ui.fitDrawingBtn, { id: "fit-drawing-btn" });
  assert.deepEqual(ui.fitSelectionBtn, { id: "fit-selection-btn" });
  assert.deepEqual(ui.coordinateValidation, { id: "coordinate-validation" });
  assert.deepEqual(ui.coordinatePreview, { id: "coordinate-preview" });
  assert.deepEqual(ui.resetSettingsBtn, { id: "reset-settings-btn" });
  assert.deepEqual(ui.inlineTextEditor, { id: "inline-text-editor" });
  assert.ok(doc.byId.includes("export-json-btn"));
});

test("queryUi collects node lists into arrays", () => {
  const doc = stubDocument();
  const ui = queryUi(doc);
  assert.ok(Array.isArray(ui.modeButtons));
  assert.equal(ui.modeButtons.length, 2);
  assert.deepEqual(doc.bySelector, [
    ".tool-btn[data-mode]",
    ".tool-select",
    ".tool-select-wrap",
  ]);
});

test("queryUi does not read the ambient global document", () => {
  const doc = stubDocument();
  queryUi(doc);
  // Every lookup routed through the passed-in document.
  assert.ok(doc.byId.length > 0);
});
