// Pure session-index operations. A "session" is one named diagram; the index tracks
// which sessions exist and which one is active. Storage I/O lives in app.js.

const SESSION_KEY_PREFIX = "fmb-session-";
const MAX_NAME_LENGTH = 60;
const DEFAULT_SESSION_NAME = "Untitled diagram";
const DEFAULT_SLUG = "fmb-studio-diagram";
const MAX_SLUG_LENGTH = 64;

export function sessionStorageKey(id) {
  return `${SESSION_KEY_PREFIX}${id}`;
}

export function createSessionId(existingIds = []) {
  const taken = new Set(existingIds);
  let id = "";
  do {
    id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  } while (taken.has(id));
  return id;
}

export function sanitizeSessionName(name, fallback = DEFAULT_SESSION_NAME) {
  if (typeof name !== "string") {
    return fallback;
  }
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
  return trimmed || fallback;
}

// Appends " (2)", " (3)" … until the name is free.
export function makeUniqueName(name, existingNames = []) {
  const base = sanitizeSessionName(name);
  const taken = new Set(existingNames.map((entry) => String(entry).toLowerCase()));
  if (!taken.has(base.toLowerCase())) {
    return base;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} (${suffix})`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}

// Drops malformed entries and duplicate ids, then guarantees at least one session
// and an activeId that actually exists.
export function normalizeIndex(raw) {
  const source = raw && typeof raw === "object" && Array.isArray(raw.sessions) ? raw.sessions : [];
  const seenIds = new Set();
  const sessions = [];

  for (const entry of source) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    sessions.push({
      id,
      name: makeUniqueName(sanitizeSessionName(entry.name), sessions.map((item) => item.name)),
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
    });
  }

  if (sessions.length === 0) {
    sessions.push({ id: createSessionId(), name: DEFAULT_SESSION_NAME, updatedAt: "" });
  }

  const requestedActiveId = raw && typeof raw === "object" ? raw.activeId : null;
  const activeId = sessions.some((entry) => entry.id === requestedActiveId)
    ? requestedActiveId
    : sessions[0].id;

  return { activeId, sessions };
}

export function findSession(index, id) {
  return index.sessions.find((entry) => entry.id === id) || null;
}

export function addSession(index, name, id = createSessionId(index.sessions.map((entry) => entry.id))) {
  const session = {
    id,
    name: makeUniqueName(name, index.sessions.map((entry) => entry.name)),
    updatedAt: "",
  };
  return { index: { activeId: id, sessions: [...index.sessions, session] }, session };
}

export function renameSession(index, id, name) {
  const others = index.sessions.filter((entry) => entry.id !== id).map((entry) => entry.name);
  const nextName = makeUniqueName(name, others);
  return {
    index: {
      activeId: index.activeId,
      sessions: index.sessions.map((entry) => (entry.id === id ? { ...entry, name: nextName } : entry)),
    },
    name: nextName,
  };
}

export function touchSession(index, id, updatedAt) {
  return {
    activeId: index.activeId,
    sessions: index.sessions.map((entry) => (entry.id === id ? { ...entry, updatedAt } : entry)),
  };
}

export function setActiveSession(index, id) {
  return findSession(index, id) ? { activeId: id, sessions: index.sessions } : index;
}

// Refuses to remove the last remaining session; falls back to a neighbouring one.
export function removeSession(index, id) {
  const position = index.sessions.findIndex((entry) => entry.id === id);
  if (position === -1 || index.sessions.length <= 1) {
    return { index, removed: false, activeId: index.activeId };
  }

  const sessions = index.sessions.filter((entry) => entry.id !== id);
  const activeId =
    index.activeId === id ? sessions[Math.min(position, sessions.length - 1)].id : index.activeId;
  return { index: { activeId, sessions }, removed: true, activeId };
}

export function slugifySessionName(name, fallback = DEFAULT_SLUG) {
  const slug = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug || fallback;
}
