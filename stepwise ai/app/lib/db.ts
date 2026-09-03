// ============================================================================
// Database layer — embedded JSON store (zero native dependencies).
//
// All persistence goes through this module's small relational-style API.
// No SQL strings ever leave this file, so injection is structurally
// impossible and AI output can never execute data commands (spec part 30).
// The production target is PostgreSQL; swapping means reimplementing only
// this module's interface.
//
// Storage file: ./data/stepwise.json (atomic write via temp file + rename).
// Every operation reads fresh from disk and writes synchronously so that
// multiple module instances (Next.js dev hot-reload) always agree.
// ============================================================================
import fs from "fs";
import path from "path";

export type Row = Record<string, any>;

interface TableMeta {
  autoIncrement: boolean;
}

const TABLES: Record<string, TableMeta> = {
  users: { autoIncrement: true },
  profiles: { autoIncrement: false },
  auth_sessions: { autoIncrement: false },
  questions: { autoIncrement: true },
  sessions: { autoIncrement: true },
  boards: { autoIncrement: true },
  board_objects: { autoIncrement: false },
  board_events: { autoIncrement: true },
  ai_messages: { autoIncrement: true },
  concepts: { autoIncrement: true },
  concept_prereqs: { autoIncrement: false },
  student_concepts: { autoIncrement: false },
  errors: { autoIncrement: true },
  hints: { autoIncrement: true },
  mastery_evidence: { autoIncrement: true },
  misconceptions: { autoIncrement: true },
  reports: { autoIncrement: true },
  review_items: { autoIncrement: true },
  recommendations: { autoIncrement: true },
  learning_events: { autoIncrement: true },
  attachments: { autoIncrement: true }
};

interface StoreShape {
  tables: Record<string, Row[]>;
  seq: Record<string, number>;
}

function defaults(): StoreShape {
  const tables: Record<string, Row[]> = {};
  const seq: Record<string, number> = {};
  for (const name of Object.keys(TABLES)) {
    tables[name] = [];
    seq[name] = 0;
  }
  return { tables, seq };
}

let filePath = "";
// Non-null only while a transaction is running (single-threaded Node, so a
// plain variable is safe): mutations collect here and commit at the end.
let activeStore: StoreShape | null = null;

function resolvePath(): string {
  const file = process.env.DATABASE_FILE || "./data/stepwise.db";
  const resolved = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  // Reuse the configured location but as a JSON store.
  return resolved.replace(/\.db$/i, "") + ".json";
}

function readDisk(): StoreShape {
  if (!filePath) filePath = resolvePath();
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    const defs = defaults();
    return {
      tables: { ...defs.tables, ...(parsed.tables ?? {}) },
      seq: { ...defs.seq, ...(parsed.seq ?? {}) }
    };
  } catch {
    return defaults();
  }
}

function writeDisk(s: StoreShape): void {
  if (!filePath) filePath = resolvePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s), "utf8");
  fs.renameSync(tmp, filePath);
}

/** Store for the current operation: the transaction buffer or fresh disk. */
function current(): StoreShape {
  return activeStore ?? readDisk();
}

/** Persist unless inside a transaction (committed once at the end). */
function commit(s: StoreShape): void {
  if (!activeStore) writeDisk(s);
}

export function nowIso(): string {
  return new Date().toISOString();
}

// --- Query interface ---------------------------------------------------------
export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

function matches(row: Row, where: Row): boolean {
  for (const key of Object.keys(where)) {
    if (row[key] !== where[key]) return false;
  }
  return true;
}

export const db = {
  all(table: string, where: Row = {}, orderBy?: { key: string; dir?: "asc" | "desc" }): Row[] {
    const s = current();
    let rows = (s.tables[table] ?? []).filter((r) => matches(r, where));
    if (orderBy) {
      const dir = orderBy.dir === "desc" ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        const av = a[orderBy.key];
        const bv = b[orderBy.key];
        if (av === bv) return 0;
        if (av === undefined || av === null) return 1;
        if (bv === undefined || bv === null) return -1;
        return av > bv ? dir : -dir;
      });
    }
    return rows.map((r) => ({ ...r }));
  },

  get(table: string, where: Row): Row | null {
    const s = current();
    const row = (s.tables[table] ?? []).find((r) => matches(r, where));
    return row ? { ...row } : null;
  },

  insert(table: string, values: Row): RunResult {
    const s = current();
    const meta = TABLES[table];
    const row: Row = { ...values };
    if (meta?.autoIncrement) {
      s.seq[table] = (s.seq[table] ?? 0) + 1;
      row.id = s.seq[table];
    }
    s.tables[table] = s.tables[table] ?? [];
    s.tables[table].push(row);
    commit(s);
    return { changes: 1, lastInsertRowid: Number(row.id ?? 0) };
  },

  update(table: string, where: Row, patch: Row): RunResult {
    const s = current();
    let changes = 0;
    for (const row of s.tables[table] ?? []) {
      if (matches(row, where)) {
        Object.assign(row, patch);
        changes++;
      }
    }
    if (changes > 0) commit(s);
    return { changes, lastInsertRowid: 0 };
  },

  remove(table: string, where: Row): RunResult {
    const s = current();
    const before = (s.tables[table] ?? []).length;
    s.tables[table] = (s.tables[table] ?? []).filter((r) => !matches(r, where));
    const changes = before - s.tables[table].length;
    if (changes > 0) commit(s);
    return { changes, lastInsertRowid: 0 };
  },

  /** Atomic multi-step operation: commits once at the end, discards on error. */
  transaction<T>(fn: () => T): T {
    const buffer = readDisk();
    activeStore = buffer;
    try {
      const result = fn();
      writeDisk(buffer);
      return result;
    } finally {
      activeStore = null;
    }
  },

  flush(): void {
    // Writes are synchronous; kept for interface compatibility.
  }
};

/** Cascade deletions mirroring foreign keys ON DELETE CASCADE. */
export function deleteUserCascade(userId: number): void {
  db.transaction(() => {
    for (const table of [
      "profiles",
      "auth_sessions",
      "questions",
      "sessions",
      "boards",
      "student_concepts",
      "errors",
      "mastery_evidence",
      "misconceptions",
      "reports",
      "review_items",
      "recommendations",
      "learning_events"
    ]) {
      db.remove(table, { user_id: userId });
    }
    db.remove("users", { id: userId });
  });
}
