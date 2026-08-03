:root {
  --bg-1: #f6efe2;
  --bg-2: #dcecf3;
  --bg-3: #f9fafb;
  --ink: #1f2a32;
  --ink-muted: #556471;
  --line-soft: #d6dce2;
  --brand: #0f766e;
  --brand-strong: #115e59;
  --accent: #f59e0b;
  --danger: #dc2626;
  --surface: rgba(255, 255, 255, 0.8);
  --surface-strong: rgba(255, 255, 255, 0.96);
  --shadow: 0 18px 40px rgba(26, 41, 54, 0.18);
  --radius-xl: 20px;
  --radius-lg: 14px;
  --radius-md: 10px;
}

:root[data-theme="dark"] {
  --bg-1: #101a25;
  --bg-2: #152a37;
  --bg-3: #1b2733;
  --ink: #e6edf3;
  --ink-muted: #9ab0c1;
  --line-soft: #2f4453;
  --brand: #22c1b5;
  --brand-strong: #4cd4ca;
  --surface: rgba(12, 20, 27, 0.8);
  --surface-strong: rgba(12, 20, 27, 0.95);
  --shadow: 0 20px 44px rgba(0, 0, 0, 0.45);
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  height: 100%;
}

body {
  font-family: "Space Grotesk", "Trebuchet MS", sans-serif;
  color: var(--ink);
  background:
    radial-gradient(circle at 0% 0%, rgba(245, 158, 11, 0.2), transparent 36%),
    radial-gradient(circle at 100% 0%, rgba(15, 118, 110, 0.2), transparent 32%),
    linear-gradient(145deg, var(--bg-1), var(--bg-2) 60%, var(--bg-3));
  overflow: hidden;
}

.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 10px;
  gap: 10px;
}

.topbar {
  position: relative;
  z-index: 30;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: var(--radius-xl);
  background: var(--surface-strong);
  box-shadow: var(--shadow);
  border: 1px solid rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.brand-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.brand-wrap h1 {
  margin: 0;
  font-size: 1.08rem;
  letter-spacing: 0.03em;
}

.version-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: "IBM Plex Mono", monospace;
  font-size: 0.75rem;
  color: var(--brand-strong);
  background: rgba(15, 118, 110, 0.12);
  border: 1px solid rgba(15, 118, 110, 0.22);
  border-radius: 999px;
  padding: 3px 9px;
}

.tool-menu {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}

.tool-menu::-webkit-scrollbar {
  height: 6px;
}

.tool-menu::-webkit-scrollbar-thumb {
  background: rgba(15, 118, 110, 0.24);
  border-radius: 999px;
}

.tool-btn,
.icon-btn,
.settings-panel button,
.dialog-actions button,
.context-menu button {
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.9);
  color: var(--ink);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease;
}

.tool-btn {
  min-width: 58px;
  height: 54px;
  padding: 6px 8px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-color: rgba(15, 118, 110, 0.14);
}

.tool-btn .icon,
.icon-btn .icon {
  font-family: "IBM Plex Mono", monospace;
  font-size: 0.8rem;
  letter-spacing: 0.03em;
}

.tool-btn .label {
  font-size: 0.62rem;
  font-weight: 600;
  color: var(--ink-muted);
}

.tool-btn:hover,
.icon-btn:hover,
.settings-panel button:hover,
.dialog-actions button:hover,
.context-menu button:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 16px rgba(17, 94, 89, 0.14);
}

.tool-btn.active {
  background: linear-gradient(145deg, #0f766e, #12948b);
  border-color: transparent;
}

.tool-btn.active .icon,
.tool-btn.active .label {
  color: #f5fffe;
}

.topbar-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.icon-btn {
  min-width: 46px;
  height: 42px;
  padding: 6px 8px;
  border-color: rgba(85, 100, 113, 0.2);
}

.settings-btn {
  border-color: rgba(245, 158, 11, 0.4);
}

.workspace {
  flex: 1;
  min-height: 0;
}

.graph-panel {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: var(--shadow);
  border: 1px solid rgba(255, 255, 255, 0.75);
  animation: settle 500ms ease;
}

@keyframes settle {
  from {
    transform: translateY(8px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

svg {
  width: 100%;
  height: 100%;
  display: block;
  background:
    radial-gradient(circle at 20% 10%, rgba(255, 255, 255, 0.45), transparent 28%),
    linear-gradient(160deg, #f8fbfb, #e9f3f6 75%);
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}

svg.mode-select {
  cursor: default;
}

svg.mode-box-select {
  cursor: crosshair;
}

.status-pill {
  position: absolute;
  left: 14px;
  bottom: 14px;
  max-width: min(680px, calc(100% - 28px));
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(15, 118, 110, 0.2);
  background: rgba(255, 255, 255, 0.86);
  color: var(--ink-muted);
  font-size: 0.85rem;
  line-height: 1.25;
  backdrop-filter: blur(8px);
}

.inline-text-editor {
  position: absolute;
  z-index: 35;
  min-width: 120px;
  max-width: min(50vw, 380px);
  height: 34px;
  transform: translate(-50%, -75%);
  border: 1px solid rgba(15, 118, 110, 0.45);
  border-radius: 8px;
  padding: 6px 10px;
  background: var(--surface-strong);
  color: var(--ink);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.16);
  font-family: "Space Grotesk", "Trebuchet MS", sans-serif;
  font-size: 14px;
}

.inline-text-editor:focus {
  outline: 2px solid rgba(15, 118, 110, 0.45);
  outline-offset: 1px;
}

.settings-panel {
  position: fixed;
  right: 14px;
  top: 70px;
  width: min(320px, calc(100vw - 28px));
  border: 1px solid rgba(85, 100, 113, 0.2);
  border-radius: var(--radius-lg);
  background: var(--surface-strong);
  box-shadow: var(--shadow);
  padding: 14px;
  z-index: 50;
}

.settings-panel h2 {
  margin: 0 0 8px;
  font-size: 1rem;
}

.settings-panel p {
  margin: 0 0 12px;
  color: var(--ink-muted);
  font-size: 0.88rem;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 0.88rem;
}

.settings-panel button {
  height: 38px;
  width: 100%;
}

.context-menu {
  position: fixed;
  z-index: 60;
  border-radius: 10px;
  padding: 6px;
  background: var(--surface-strong);
  border: 1px solid rgba(85, 100, 113, 0.2);
  box-shadow: var(--shadow);
}

.context-menu button {
  min-width: 220px;
  text-align: left;
  padding: 8px 10px;
}

.points-dialog {
  width: min(640px, calc(100vw - 28px));
  border: 1px solid rgba(85, 100, 113, 0.2);
  border-radius: 14px;
  padding: 0;
  box-shadow: var(--shadow);
}

.points-dialog::backdrop {
  background: rgba(7, 16, 20, 0.35);
}

.points-dialog form {
  margin: 0;
  padding: 16px;
}

.points-dialog h3 {
  margin: 0 0 6px;
}

.points-dialog p {
  margin: 0 0 10px;
  color: var(--ink-muted);
  font-size: 0.88rem;
}

.points-dialog textarea {
  width: 100%;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  padding: 10px;
  font-family: "IBM Plex Mono", monospace;
  font-size: 0.84rem;
  resize: vertical;
}

.dialog-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dialog-actions button {
  height: 36px;
  min-width: 90px;
}

.mobile-only {
  display: none;
}

@media (max-width: 920px) {
  .app-shell {
    padding: 8px;
    gap: 8px;
  }

  .topbar {
    grid-template-columns: auto 1fr auto;
    padding: 8px 10px;
  }

  .mobile-only {
    display: inline-flex;
  }

  .tool-menu {
    position: absolute;
    left: 50%;
    transform: translateX(-50%) translateY(-8px);
    top: 60px;
    width: min(96vw, 760px);
    border-radius: var(--radius-lg);
    background: var(--surface-strong);
    border: 1px solid rgba(85, 100, 113, 0.2);
    box-shadow: var(--shadow);
    padding: 10px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 180ms ease, transform 180ms ease;
  }

  .tool-menu.open {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
    pointer-events: auto;
  }

  .brand-wrap h1 {
    font-size: 0.96rem;
  }

  .version-badge {
    font-size: 0.66rem;
    padding: 2px 7px;
  }

  .topbar-right {
    gap: 6px;
  }

  .icon-btn {
    min-width: 38px;
    height: 36px;
  }

  .icon-btn .icon {
    font-size: 0.58rem;
  }

  .graph-panel {
    border-radius: 16px;
  }
}
