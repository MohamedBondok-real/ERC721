import { COLLECTION_NAMES, type Collection, type CollectionName, type Entity, type FindOptions, type Predicate, type Store } from "./types";

/* ------------------------------------------------------------------ */
/* In-memory store                                                     */
/*                                                                     */
/* Used for local development, tests and the labelled demo mode. Data  */
/* lives for the lifetime of the process and is seeded with FICTIONAL  */
/* patient data. It implements exactly the same interface as the       */
/* PostgreSQL driver, so no module can tell the difference.            */
/* ------------------------------------------------------------------ */

function matches<T>(item: T, where?: Partial<Record<keyof T, unknown>> | Predicate<T>): boolean {
  if (!where) return true;
  if (typeof where === "function") return (where as Predicate<T>)(item);
  return Object.entries(where).every(([key, value]) => {
    const actual = (item as Record<string, unknown>)[key];
    if (value === undefined) return true;
    if (value === null) return actual === null || actual === undefined;
    return actual === value;
  });
}

function clone<T>(value: T): T {
  // structuredClone stops callers mutating stored state by reference.
  return typeof structuredClone === "function" ? structuredClone(value) : (JSON.parse(JSON.stringify(value)) as T);
}

class MemoryCollection<T extends Entity> implements Collection<T> {
  private readonly rows = new Map<string, T>();

  async list(options: FindOptions<T> = {}): Promise<T[]> {
    let rows = [...this.rows.values()].filter((row) => matches(row, options.where));

    if (options.orderBy) {
      const orderBy = options.orderBy;
      const direction = options.order === "desc" ? -1 : 1;
      rows.sort((a, b) => {
        if (typeof orderBy === "function") return orderBy(a, b) * direction;
        const left = a[orderBy];
        const right = b[orderBy];
        if (left === right) return 0;
        if (left === undefined || left === null) return 1;
        if (right === undefined || right === null) return -1;
        return (left < right ? -1 : 1) * direction;
      });
    }

    if (options.offset) rows = rows.slice(options.offset);
    if (options.limit !== undefined) rows = rows.slice(0, options.limit);
    return rows.map(clone);
  }

  async get(id: string): Promise<T | undefined> {
    const row = this.rows.get(id);
    return row ? clone(row) : undefined;
  }

  async findFirst(where: Partial<Record<keyof T, unknown>> | Predicate<T>): Promise<T | undefined> {
    const row = [...this.rows.values()].find((item) => matches(item, where));
    return row ? clone(row) : undefined;
  }

  async insert(item: T): Promise<T> {
    if (this.rows.has(item.id)) throw new Error(`Duplicate id ${item.id}`);
    this.rows.set(item.id, clone(item));
    return clone(item);
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const existing = this.rows.get(id);
    if (!existing) throw new Error(`Cannot update missing record ${id}`);
    const next = { ...existing, ...patch, id, updatedAt: new Date().toISOString() } as unknown as T;
    this.rows.set(id, clone(next));
    return clone(next);
  }

  async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }

  async count(options: FindOptions<T> = {}): Promise<number> {
    return [...this.rows.values()].filter((row) => matches(row, options.where)).length;
  }
}

export function createMemoryStore(): Store {
  const collections = {} as Record<CollectionName, Collection<Entity>>;
  for (const name of COLLECTION_NAMES) {
    collections[name] = new MemoryCollection<Entity>();
  }
  return {
    ...collections,
    close: async () => undefined,
  } as unknown as Store;
}
