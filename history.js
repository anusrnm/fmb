// Pure undo/redo stack operations. Each function takes the current history array
// and index and returns the next {history, historyIndex} without any DOM or app state.

const DEFAULT_LIMIT = 120;

// Push a snapshot, discarding any redo tail. Returns changed:false when the
// snapshot is identical to the current entry (a no-op the caller can skip).
export function pushSnapshot(history, historyIndex, snapshot, limit = DEFAULT_LIMIT) {
  if (snapshot === history[historyIndex]) {
    return { history, historyIndex, changed: false };
  }

  const next = history.slice(0, historyIndex + 1);
  next.push(snapshot);
  if (next.length > limit) {
    next.shift();
  }

  return { history: next, historyIndex: next.length - 1, changed: true };
}

export function canUndo(historyIndex) {
  return historyIndex > 0;
}

export function canRedo(history, historyIndex) {
  return historyIndex < history.length - 1;
}

// Move the index back one step when possible; returns the same index otherwise.
export function undoIndex(historyIndex) {
  return canUndo(historyIndex) ? historyIndex - 1 : historyIndex;
}

export function redoIndex(history, historyIndex) {
  return canRedo(history, historyIndex) ? historyIndex + 1 : historyIndex;
}
