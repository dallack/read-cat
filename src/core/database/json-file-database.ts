import fsp from 'fs/promises';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { cloneByJSON, newError } from '../utils';
import type { BookshelfStoreEntity, TextContentStoreEntity } from './database';

type StoredRecord = {
  id: string
  [key: string]: any
};

type StoreIndex = {
  file: string
  updatedAt: number
};

type GlobalBookIndexRecord = {
  pid: string
  detailUrl: string
  meta?: string
  index: string
  updatedAt: number
};

type TextContentIndexRecord = {
  id: string
  pid: string
  detailUrl: string
  chapterUrl: string
  chapterIndex?: number
  file: string
  updatedAt: number
};

type BookContentIndex = {
  version: number
  bookId: string
  pid: string
  detailUrl: string
  meta?: string
  chapters: string[]
  byId: Record<string, TextContentIndexRecord>
  byChapterUrl: Record<string, string>
  byChapterIndex: Record<string, string>
  updatedAt: number
};

type DatabaseIndex = {
  version: number
  stores: Record<string, StoreIndex>
  books: Record<string, GlobalBookIndexRecord>
  bookByPidDetailUrl: Record<string, string>
};

const INDEX_VERSION = 2;
const BOOK_INDEX_VERSION = 1;
const TEXT_CONTENT_QUEUE_KEY = '__text_content__';

const createDefaultIndex = (): DatabaseIndex => ({
  version: INDEX_VERSION,
  stores: {},
  books: {},
  bookByPidDetailUrl: {}
});

const createDefaultBookIndex = (bookId: string, pid: string, detailUrl: string): BookContentIndex => ({
  version: BOOK_INDEX_VERSION,
  bookId,
  pid,
  detailUrl,
  chapters: [],
  byId: {},
  byChapterUrl: {},
  byChapterIndex: {},
  updatedAt: Date.now()
});

export class JsonFileDatabase {
  private readonly storesPath: string;
  private readonly booksPath: string;
  private readonly indexPath: string;
  private readonly stores: Map<string, Map<string, StoredRecord>> = new Map();
  private readonly writeQueues: Map<string, Promise<void>> = new Map();
  private readonly bookIndexCache: Map<string, BookContentIndex> = new Map();
  private readonly textContentBookLookupCache: Map<string, string> = new Map();
  private index: DatabaseIndex = createDefaultIndex();

  constructor(
    public readonly rootPath: string,
    private readonly storeNames: string[],
    private readonly textContentStoreName: string
  ) {
    this.storesPath = path.join(rootPath, 'stores');
    this.booksPath = path.join(rootPath, 'books');
    this.indexPath = path.join(rootPath, 'index.json');
  }

  async open() {
    await fsp.mkdir(this.storesPath, { recursive: true });
    await fsp.mkdir(this.booksPath, { recursive: true });
    await this.cleanupTempFiles(this.rootPath);

    const rawIndex = await this.readJson<Partial<DatabaseIndex>>(this.indexPath, createDefaultIndex());
    this.index = this.normalizeDatabaseIndex(rawIndex);
    this.rebuildBookLookup();

    for (const storeName of this.storeNames) {
      if (storeName === this.textContentStoreName) {
        continue;
      }
      await this.loadStore(storeName);
    }
    await this.persistIndex();
  }

  async getById<T>(storeName: string, id: string): Promise<T | null> {
    if (storeName === this.textContentStoreName) {
      return await this.getTextContentById(id) as T | null;
    }
    const record = this.getStore(storeName).get(id);
    return record ? cloneByJSON(record) as T : null;
  }

  async getAll<T>(storeName: string): Promise<T[] | null> {
    if (storeName === this.textContentStoreName) {
      return await this.getAllTextContent() as T[];
    }
    return [...this.getStore(storeName).values()].map(v => cloneByJSON(v) as T);
  }

  async put<T>(storeName: string, val: T): Promise<void> {
    if (storeName === this.textContentStoreName) {
      await this.putTextContent(val as TextContentStoreEntity);
      return;
    }
    const record = cloneByJSON(val) as StoredRecord;
    this.assertRecord(record, storeName);
    this.getStore(storeName).set(record.id, record);
    await this.persistStore(storeName);
  }

  async remove(storeName: string, id: string): Promise<void> {
    if (storeName === this.textContentStoreName) {
      await this.removeTextContent(id);
      return;
    }
    this.getStore(storeName).delete(id);
    await this.persistStore(storeName);
  }

  async query<T>(storeName: string, predicate: (val: T) => boolean): Promise<T[]> {
    const all = await this.getAll<T>(storeName);
    return (all || []).filter(predicate);
  }

  async queryOne<T>(storeName: string, predicate: (val: T) => boolean): Promise<T | null> {
    if (storeName !== this.textContentStoreName) {
      for (const record of this.getStore(storeName).values()) {
        const value = cloneByJSON(record) as T;
        if (predicate(value)) {
          return value;
        }
      }
      return null;
    }
    const all = await this.query(storeName, predicate);
    return all[0] || null;
  }

  async removeWhere<T>(storeName: string, predicate: (val: T) => boolean): Promise<void> {
    if (storeName === this.textContentStoreName) {
      await this.enqueue(TEXT_CONTENT_QUEUE_KEY, async () => {
        const all = await this.getAllTextContent();
        const ids = all.filter(v => predicate(v as T)).map(v => v.id);
        await this.removeTextContentBatch(ids);
      });
      return;
    }
    const store = this.getStore(storeName);
    let changed = false;
    for (const record of [...store.values()]) {
      if (predicate(cloneByJSON(record) as T)) {
        store.delete(record.id);
        changed = true;
      }
    }
    if (changed) {
      await this.persistStore(storeName);
    }
  }

  async putBookMeta(val: BookshelfStoreEntity): Promise<void> {
    const bookId = this.createBookId(val.pid, val.detailPageUrl);
    const metaPath = path.join(this.getBookDir(bookId), 'meta.json');
    await this.writeJsonAtomic(metaPath, cloneByJSON(val));

    const bookIndex = await this.loadBookIndex(bookId, val.pid, val.detailPageUrl);
    if (bookIndex.meta !== 'meta.json') {
      bookIndex.meta = 'meta.json';
      await this.persistBookIndex(bookIndex);
    }

    await this.ensureGlobalBook(bookId, val.pid, val.detailPageUrl, this.toRelative(metaPath));
  }

  async getBookMeta(pid: string, detailUrl: string): Promise<BookshelfStoreEntity | null> {
    const bookId = this.getBookIdByPidAndDetailUrl(pid, detailUrl);
    const bookIndex = await this.loadBookIndex(bookId, pid, detailUrl);
    if (!bookIndex.meta) {
      return null;
    }
    const meta = await this.readJson<BookshelfStoreEntity | null>(this.toBookAbsolute(bookId, bookIndex.meta), null);
    return meta ? cloneByJSON(meta) : null;
  }

  async removeBookMeta(pid: string, detailUrl: string): Promise<void> {
    const bookId = this.getBookIdByPidAndDetailUrl(pid, detailUrl);
    const bookIndex = await this.loadBookIndex(bookId, pid, detailUrl);
    if (bookIndex.meta) {
      await fsp.rm(this.toBookAbsolute(bookId, bookIndex.meta), { force: true }).catch(() => void 0);
      delete bookIndex.meta;
      await this.finalizeBookIndex(bookIndex);
    }
    const globalBook = this.index.books[bookId];
    if (globalBook?.meta) {
      delete globalBook.meta;
      globalBook.updatedAt = Date.now();
      await this.persistIndex();
    }
  }

  async getTextContentByPidAndDetailUrl(pid: string, detailUrl: string): Promise<TextContentStoreEntity[] | null> {
    const bookId = this.getBookIdByPidAndDetailUrl(pid, detailUrl);
    const bookIndex = await this.loadBookIndex(bookId, pid, detailUrl);
    const records = bookIndex.chapters
      .map(id => bookIndex.byId[id])
      .filter((record): record is TextContentIndexRecord => !!record);
    const result = await Promise.all(records.map(record => this.readTextContentRecord(bookId, record)));
    return result
      .filter((v): v is TextContentStoreEntity => !!v)
      .sort((a, b) => (a.chapter.index ?? 0) - (b.chapter.index ?? 0));
  }

  async getTextContentByPidAndChapterUrl(pid: string, chapterUrl: string): Promise<TextContentStoreEntity | null> {
    const found = await this.findTextContentRecordByChapterUrl(pid, chapterUrl);
    return found ? await this.readTextContentRecord(found.bookId, found.record) : null;
  }

  async getTextContentByPidAndChapterIndex(pid: string, chapterIndex: number): Promise<TextContentStoreEntity | null> {
    const found = await this.findTextContentRecordByChapterIndex(pid, chapterIndex);
    return found ? await this.readTextContentRecord(found.bookId, found.record) : null;
  }

  async putTextContent(val: TextContentStoreEntity): Promise<void> {
    await this.putTextContents([val]);
  }

  async putTextContents(vals: TextContentStoreEntity[]): Promise<void> {
    if (vals.length < 1) {
      return;
    }
    await this.enqueue(TEXT_CONTENT_QUEUE_KEY, async () => {
      const groups = new Map<string, {
        pid: string
        detailUrl: string
        values: TextContentStoreEntity[]
      }>();

      for (const val of vals) {
        const value = cloneByJSON(val);
        this.assertRecord(value, this.textContentStoreName);
        const bookId = this.createBookId(value.pid, value.detailUrl);
        const group = groups.get(bookId) || {
          pid: value.pid,
          detailUrl: value.detailUrl,
          values: []
        };
        group.values.push(value);
        groups.set(bookId, group);
      }

      for (const [bookId, group] of groups) {
        await this.ensureGlobalBook(bookId, group.pid, group.detailUrl);
        const bookIndex = await this.loadBookIndex(bookId, group.pid, group.detailUrl);
        for (const value of group.values) {
          await this.writeTextContentRecord(bookIndex, value, false);
        }
        await this.persistBookIndex(bookIndex);
      }
    });
  }

  private async writeTextContentRecord(bookIndex: BookContentIndex, value: TextContentStoreEntity, sortIndex = true) {
    const raw = this.getBookTextContentRecordByChapterUrl(bookIndex, value.chapter.url);
    if (raw) {
      value.id = raw.id;
    }

    const oldRecord = bookIndex.byId[value.id];
    const oldFile = oldRecord?.file;
    if (oldRecord) {
      this.removeBookTextContentIndex(bookIndex, oldRecord, false);
    }

    const chapterHash = this.hash(`${value.pid}\n${value.chapter.url}`);
    const chapterIndex = typeof value.chapter.index === 'number' ? value.chapter.index : void 0;
    const chapterNumber = typeof chapterIndex === 'number' && chapterIndex >= 0 ?
      String(chapterIndex + 1).padStart(6, '0') :
      'chapter';
    const filePath = path.join(this.getBookDir(bookIndex.bookId), 'chapters', `${chapterNumber}-${chapterHash}.json`);
    const relativeFilePath = this.toBookRelative(bookIndex.bookId, filePath);
    await this.writeJsonAtomic(filePath, value);
    if (oldFile && oldFile !== relativeFilePath) {
      await fsp.rm(this.toBookAbsolute(bookIndex.bookId, oldFile), { force: true }).catch(() => void 0);
    }

    this.addBookTextContentIndex(bookIndex, {
      id: value.id,
      pid: value.pid,
      detailUrl: value.detailUrl,
      chapterUrl: value.chapter.url,
      chapterIndex,
      file: relativeFilePath,
      updatedAt: Date.now()
    }, sortIndex);
  }

  async removeTextContent(id: string): Promise<void> {
    await this.enqueue(TEXT_CONTENT_QUEUE_KEY, () => this.removeTextContentBatch([id]));
  }

  async removeTextContentByPidAndDetailUrl(pid: string, detailUrl: string): Promise<void> {
    await this.enqueue(TEXT_CONTENT_QUEUE_KEY, async () => {
      const bookId = this.getBookIdByPidAndDetailUrl(pid, detailUrl);
      const bookIndex = await this.loadBookIndex(bookId, pid, detailUrl);
      await this.removeTextContentFromBook(bookIndex, [...bookIndex.chapters]);
    });
  }

  private async getAllTextContent(): Promise<TextContentStoreEntity[]> {
    const result: TextContentStoreEntity[] = [];
    for (const [bookId, book] of Object.entries(this.index.books)) {
      const bookIndex = await this.loadBookIndex(bookId, book.pid, book.detailUrl);
      const records = bookIndex.chapters
        .map(id => bookIndex.byId[id])
        .filter((record): record is TextContentIndexRecord => !!record);
      const values = await Promise.all(records.map(record => this.readTextContentRecord(bookId, record)));
      result.push(...values.filter((v): v is TextContentStoreEntity => !!v));
    }
    return result;
  }

  private async getTextContentById(id: string): Promise<TextContentStoreEntity | null> {
    const found = await this.findTextContentRecordById(id);
    return found ? await this.readTextContentRecord(found.bookId, found.record) : null;
  }

  private async removeTextContentBatch(ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    if (idSet.size < 1) {
      return;
    }
    for (const [bookId, book] of Object.entries(this.index.books)) {
      const bookIndex = await this.loadBookIndex(bookId, book.pid, book.detailUrl);
      const removableIds = [...idSet].filter(id => !!bookIndex.byId[id]);
      if (removableIds.length > 0) {
        await this.removeTextContentFromBook(bookIndex, removableIds);
      }
    }
  }

  private async removeTextContentFromBook(bookIndex: BookContentIndex, ids: string[]) {
    let changed = false;
    for (const id of [...new Set(ids)]) {
      const record = bookIndex.byId[id];
      if (!record) {
        continue;
      }
      await fsp.rm(this.toBookAbsolute(bookIndex.bookId, record.file), { force: true }).catch(() => void 0);
      this.removeBookTextContentIndex(bookIndex, record, false);
      changed = true;
    }
    if (changed) {
      await this.finalizeBookIndex(bookIndex);
    }
  }

  private addBookTextContentIndex(bookIndex: BookContentIndex, record: TextContentIndexRecord, sortIndex = true) {
    const oldRecord = bookIndex.byId[record.id];
    if (oldRecord) {
      this.removeBookTextContentIndex(bookIndex, oldRecord, false);
    }
    bookIndex.byId[record.id] = record;
    bookIndex.byChapterUrl[record.chapterUrl] = record.id;
    this.textContentBookLookupCache.set(this.createCompositeKey(record.pid, record.chapterUrl), bookIndex.bookId);
    if (typeof record.chapterIndex === 'number') {
      bookIndex.byChapterIndex[String(record.chapterIndex)] = record.id;
    }
    if (!bookIndex.chapters.includes(record.id)) {
      bookIndex.chapters.push(record.id);
    }
    if (sortIndex) {
      this.sortBookChapters(bookIndex);
    }
  }

  private removeBookTextContentIndex(bookIndex: BookContentIndex, record: TextContentIndexRecord, removeFile: boolean) {
    if (removeFile) {
      fsp.rm(this.toBookAbsolute(bookIndex.bookId, record.file), { force: true }).catch(() => void 0);
    }
    delete bookIndex.byId[record.id];
    delete bookIndex.byChapterUrl[record.chapterUrl];
    this.textContentBookLookupCache.delete(this.createCompositeKey(record.pid, record.chapterUrl));
    if (typeof record.chapterIndex === 'number') {
      delete bookIndex.byChapterIndex[String(record.chapterIndex)];
    }
    bookIndex.chapters = bookIndex.chapters.filter(id => id !== record.id);
  }

  private getBookTextContentRecordByChapterUrl(bookIndex: BookContentIndex, chapterUrl: string): TextContentIndexRecord | null {
    const id = bookIndex.byChapterUrl[chapterUrl];
    return id ? bookIndex.byId[id] || null : null;
  }

  private async findTextContentRecordById(id: string): Promise<{ bookId: string, record: TextContentIndexRecord } | null> {
    for (const [bookId, book] of Object.entries(this.index.books)) {
      const bookIndex = await this.loadBookIndex(bookId, book.pid, book.detailUrl);
      const record = bookIndex.byId[id];
      if (record) {
        return { bookId, record };
      }
    }
    return null;
  }

  private async findTextContentRecordByChapterUrl(pid: string, chapterUrl: string): Promise<{ bookId: string, record: TextContentIndexRecord } | null> {
    const lookupKey = this.createCompositeKey(pid, chapterUrl);
    const cachedBookId = this.textContentBookLookupCache.get(lookupKey);
    if (cachedBookId) {
      const cachedBook = this.index.books[cachedBookId];
      if (cachedBook) {
        const bookIndex = await this.loadBookIndex(cachedBookId, cachedBook.pid, cachedBook.detailUrl);
        const record = this.getBookTextContentRecordByChapterUrl(bookIndex, chapterUrl);
        if (record) {
          return { bookId: cachedBookId, record };
        }
      }
      this.textContentBookLookupCache.delete(lookupKey);
    }

    for (const [bookId, book] of Object.entries(this.index.books)) {
      if (book.pid !== pid) {
        continue;
      }
      const bookIndex = await this.loadBookIndex(bookId, book.pid, book.detailUrl);
      const record = this.getBookTextContentRecordByChapterUrl(bookIndex, chapterUrl);
      if (record) {
        this.textContentBookLookupCache.set(lookupKey, bookId);
        return { bookId, record };
      }
    }
    return null;
  }

  private async findTextContentRecordByChapterIndex(pid: string, chapterIndex: number): Promise<{ bookId: string, record: TextContentIndexRecord } | null> {
    for (const [bookId, book] of Object.entries(this.index.books)) {
      if (book.pid !== pid) {
        continue;
      }
      const bookIndex = await this.loadBookIndex(bookId, book.pid, book.detailUrl);
      const id = bookIndex.byChapterIndex[String(chapterIndex)];
      const record = id ? bookIndex.byId[id] : null;
      if (record) {
        return { bookId, record };
      }
    }
    return null;
  }

  private async readTextContentRecord(bookId: string, record: TextContentIndexRecord): Promise<TextContentStoreEntity | null> {
    const data = await this.readJson<TextContentStoreEntity | null>(this.toBookAbsolute(bookId, record.file), null);
    return data ? cloneByJSON(data) : null;
  }

  private async loadStore(storeName: string) {
    const filePath = this.getStorePath(storeName);
    this.index.stores[storeName] = this.index.stores[storeName] || {
      file: this.toRelative(filePath),
      updatedAt: Date.now()
    };
    const data = await this.readJson<Record<string, StoredRecord>>(filePath, {});
    this.stores.set(storeName, new Map(Object.entries(data || {})));
  }

  private getStore(storeName: string) {
    const store = this.stores.get(storeName);
    if (!store) {
      throw newError(`Json store "${storeName}" is not opened`);
    }
    return store;
  }

  private async persistStore(storeName: string) {
    const filePath = this.getStorePath(storeName);
    const store = this.getStore(storeName);
    this.index.stores[storeName] = {
      file: this.toRelative(filePath),
      updatedAt: Date.now()
    };
    const data = Object.fromEntries([...store.entries()].map(([id, val]) => [id, cloneByJSON(val)]));
    await this.enqueue(filePath, () => this.writeJsonAtomic(filePath, data));
    await this.persistIndex();
  }

  private async loadBookIndex(bookId: string, pid?: string, detailUrl?: string): Promise<BookContentIndex> {
    const cached = this.bookIndexCache.get(bookId);
    if (cached) {
      return cached;
    }
    const globalBook = this.index.books[bookId];
    const filePath = this.getBookIndexPath(bookId);
    const fallback = createDefaultBookIndex(
      bookId,
      pid || globalBook?.pid || '',
      detailUrl || globalBook?.detailUrl || ''
    );
    const raw = await this.readJson<Partial<BookContentIndex>>(filePath, fallback);
    const normalized = this.normalizeBookIndex(raw, bookId, pid || globalBook?.pid || '', detailUrl || globalBook?.detailUrl || '');
    this.bookIndexCache.set(bookId, normalized);
    return normalized;
  }

  private normalizeBookIndex(raw: Partial<BookContentIndex>, bookId: string, pid: string, detailUrl: string): BookContentIndex {
    const normalized = createDefaultBookIndex(bookId, raw.pid || pid, raw.detailUrl || detailUrl);
    normalized.version = BOOK_INDEX_VERSION;
    normalized.meta = raw.meta;
    normalized.updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now();

    const rawRecords = Object.values(raw.byId || {});
    for (const rawRecord of rawRecords) {
      if (!rawRecord?.id || !rawRecord.chapterUrl || !rawRecord.file) {
        continue;
      }
      this.addBookTextContentIndex(normalized, {
        id: rawRecord.id,
        pid: rawRecord.pid || normalized.pid,
        detailUrl: rawRecord.detailUrl || normalized.detailUrl,
        chapterUrl: rawRecord.chapterUrl,
        chapterIndex: typeof rawRecord.chapterIndex === 'number' ? rawRecord.chapterIndex : void 0,
        file: rawRecord.file.split('\\').join('/'),
        updatedAt: typeof rawRecord.updatedAt === 'number' ? rawRecord.updatedAt : Date.now()
      });
    }

    const orderedIds = [
      ...(raw.chapters || []),
      ...normalized.chapters
    ];
    normalized.chapters = [...new Set(orderedIds)].filter(id => !!normalized.byId[id]);
    this.sortBookChapters(normalized);
    return normalized;
  }

  private async persistBookIndex(bookIndex: BookContentIndex) {
    bookIndex.version = BOOK_INDEX_VERSION;
    bookIndex.updatedAt = Date.now();
    this.sortBookChapters(bookIndex);
    const filePath = this.getBookIndexPath(bookIndex.bookId);
    await this.enqueue(filePath, () => this.writeJsonAtomic(filePath, bookIndex));
  }

  private async finalizeBookIndex(bookIndex: BookContentIndex) {
    if (bookIndex.chapters.length > 0 || bookIndex.meta) {
      await this.persistBookIndex(bookIndex);
      return;
    }
    this.bookIndexCache.delete(bookIndex.bookId);
    await fsp.rm(this.getBookDir(bookIndex.bookId), { recursive: true, force: true }).catch(() => void 0);
    await this.removeGlobalBook(bookIndex.bookId);
  }

  private sortBookChapters(bookIndex: BookContentIndex) {
    bookIndex.chapters.sort((a, b) => {
      const ai = bookIndex.byId[a]?.chapterIndex ?? Number.MAX_SAFE_INTEGER;
      const bi = bookIndex.byId[b]?.chapterIndex ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }

  private async ensureGlobalBook(bookId: string, pid: string, detailUrl: string, meta?: string, persist = true) {
    const old = this.index.books[bookId];
    const indexFile = this.toRelative(this.getBookIndexPath(bookId));
    let changed = false;
    if (old && (old.pid !== pid || old.detailUrl !== detailUrl)) {
      delete this.index.bookByPidDetailUrl[this.createCompositeKey(old.pid, old.detailUrl)];
      changed = true;
    }
    const nextMeta = meta || old?.meta;
    if (
      !old ||
      old.pid !== pid ||
      old.detailUrl !== detailUrl ||
      old.index !== indexFile ||
      old.meta !== nextMeta
    ) {
      this.index.books[bookId] = {
        pid,
        detailUrl,
        index: indexFile,
        ...(nextMeta ? { meta: nextMeta } : {}),
        updatedAt: Date.now()
      };
      changed = true;
    }
    const key = this.createCompositeKey(pid, detailUrl);
    if (this.index.bookByPidDetailUrl[key] !== bookId) {
      this.index.bookByPidDetailUrl[key] = bookId;
      changed = true;
    }
    if (changed && persist) {
      await this.persistIndex();
    }
    return changed;
  }

  private async removeGlobalBook(bookId: string) {
    const old = this.index.books[bookId];
    if (!old) {
      return;
    }
    delete this.index.books[bookId];
    delete this.index.bookByPidDetailUrl[this.createCompositeKey(old.pid, old.detailUrl)];
    await this.persistIndex();
  }

  private getBookIdByPidAndDetailUrl(pid: string, detailUrl: string) {
    return this.index.bookByPidDetailUrl[this.createCompositeKey(pid, detailUrl)] || this.createBookId(pid, detailUrl);
  }

  private normalizeDatabaseIndex(rawIndex: Partial<DatabaseIndex>): DatabaseIndex {
    const normalized = createDefaultIndex();
    normalized.stores = rawIndex.stores || {};

    for (const [bookId, book] of Object.entries(rawIndex.books || {})) {
      if (!book?.pid || !book.detailUrl) {
        continue;
      }
      normalized.books[bookId] = {
        pid: book.pid,
        detailUrl: book.detailUrl,
        index: book.index || this.toRelative(this.getBookIndexPath(bookId)),
        ...(book.meta ? { meta: book.meta } : {}),
        updatedAt: typeof book.updatedAt === 'number' ? book.updatedAt : Date.now()
      };
    }

    normalized.bookByPidDetailUrl = rawIndex.bookByPidDetailUrl || {};
    for (const [bookId, book] of Object.entries(normalized.books)) {
      normalized.bookByPidDetailUrl[this.createCompositeKey(book.pid, book.detailUrl)] = bookId;
    }
    return normalized;
  }

  private rebuildBookLookup() {
    this.index.bookByPidDetailUrl = {};
    for (const [bookId, book] of Object.entries(this.index.books)) {
      this.index.bookByPidDetailUrl[this.createCompositeKey(book.pid, book.detailUrl)] = bookId;
    }
  }

  private async persistIndex() {
    const data: DatabaseIndex = {
      version: INDEX_VERSION,
      stores: this.index.stores,
      books: this.index.books,
      bookByPidDetailUrl: this.index.bookByPidDetailUrl
    };
    this.index = data;
    await this.enqueue(this.indexPath, () => this.writeJsonAtomic(this.indexPath, data));
  }

  private enqueue<T>(filePath: string, task: () => Promise<T>) {
    const prev = this.writeQueues.get(filePath) || Promise.resolve();
    const next = prev.catch(() => void 0).then(task);
    const marker = next.then(() => void 0, () => void 0);
    this.writeQueues.set(filePath, marker);
    marker.finally(() => {
      if (this.writeQueues.get(filePath) === marker) {
        this.writeQueues.delete(filePath);
      }
    });
    return next;
  }

  private getStorePath(storeName: string) {
    return path.join(this.storesPath, `${storeName}.json`);
  }

  private getBookDir(bookId: string) {
    return path.join(this.booksPath, bookId);
  }

  private getBookIndexPath(bookId: string) {
    return path.join(this.getBookDir(bookId), 'index.json');
  }

  private assertRecord(record: StoredRecord, storeName: string) {
    if (!record || typeof record.id !== 'string' || !record.id) {
      throw newError(`Json store "${storeName}" requires a string id`);
    }
  }

  private async readJson<T>(filePath: string, fallback: T): Promise<T> {
    try {
      const raw = await fsp.readFile(filePath, { encoding: 'utf-8' });
      if (!raw.trim()) {
        return fallback;
      }
      return JSON.parse(raw) as T;
    } catch (e: any) {
      if (e?.code === 'ENOENT') {
        return fallback;
      }
      throw e;
    }
  }

  private async writeJsonAtomic(filePath: string, data: unknown) {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${Date.now()}.${randomUUID()}.tmp`;
    try {
      await this.writeJson(tempPath, data);
      await fsp.rename(tempPath, filePath);
    } catch (e) {
      await fsp.rm(tempPath, { force: true }).catch(() => void 0);
      throw e;
    }
  }

  private async writeJson(filePath: string, data: unknown) {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf-8' });
  }

  private async cleanupTempFiles(dir: string) {
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.cleanupTempFiles(filePath);
      } else if (entry.name.endsWith('.tmp')) {
        await fsp.rm(filePath, { force: true }).catch(() => void 0);
      }
    }
  }

  private toBookRelative(bookId: string, filePath: string) {
    return path.relative(this.getBookDir(bookId), filePath).split(path.sep).join('/');
  }

  private toBookAbsolute(bookId: string, relativePath: string) {
    return path.join(this.getBookDir(bookId), ...relativePath.split('/'));
  }

  private toRelative(filePath: string) {
    return path.relative(this.rootPath, filePath).split(path.sep).join('/');
  }

  private createCompositeKey(...values: unknown[]) {
    return JSON.stringify(values);
  }

  private createBookId(pid: string, detailUrl: string) {
    return this.hash(`${pid}\n${detailUrl}`);
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex').slice(0, 16);
  }
}
