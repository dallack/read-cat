import { useBookshelfStore } from '../../../store/bookshelf';
import { isNull, isUndefined } from '../../is';
import { BookshelfStoreEntity } from '../database';
import { BaseStoreDatabase } from './base-store';
import { useMessage } from '../../../hooks/message';
import { BookParser } from '../../book/book-parser';
import { JsonFileDatabase } from '../json-file-database';

type BookshelfStoreSummary = Omit<BookshelfStoreEntity, 'intro' | 'chapterList'> & {
  readChapterTitle?: string
  chapterCount: number
  metaSignature: string
};

export type BookshelfReadProgress = {
  readIndex?: number
  readScrollTop?: number
  readChapterTitle?: string
  timestamp?: number
};

export class BookshelfStoreDatabase extends BaseStoreDatabase<BookshelfStoreEntity> {
  constructor(db: JsonFileDatabase, storeName: string) {
    super(db, storeName, 'BookshelfStoreDatabase');
  }
  public read() {
    const message = useMessage();
    const store = useBookshelfStore();
    this.getAllSummaries().then(res => {
      if (isNull(res) || res.length <= 0) {
        return;
      }
      res.forEach((entity) => {
        const {
          id,
          pid,
          detailPageUrl,
          bookname,
          author,
          coverImageUrl,
          latestChapterTitle,
          searchIndex,
          readIndex,
          readChapterTitle,
          disableRefresh,
          timestamp,
          pluginVersionCode,
          baseUrl
        } = entity;
        const props = GLOBAL_PLUGINS.getPluginPropsById(pid);
        store._books.set(id, {
          id,
          pid,
          detailPageUrl,
          bookname,
          author,
          coverImageUrl,
          latestChapterTitle,
          searchIndex,
          readIndex,
          readChapterTitle: readChapterTitle || '',
          disableRefresh: !!disableRefresh,
          timestamp,
          pluginVersionCode,
          isRunningRefresh: false,
          baseUrl,
          group: pid === BookParser.PID ? '鍐呯疆' : props?.GROUP || 'unknown',
          pluginName: pid === BookParser.PID ? '鏈湴涔︾睄' : props?.NAME || 'unknown'
        });
      });
    }).catch((e: any) => {
      GLOBAL_LOG.error(this.tag, 'read', e);
      message.error(`涔︽灦璇诲彇澶辫触, Error: ${e.message}`);
    });
  }
  async getById(id: string): Promise<BookshelfStoreEntity | null> {
    const summary = await super.getById(id) as BookshelfStoreSummary | null;
    return summary ? await this.hydrate(summary) : null;
  }
  async getAll(): Promise<BookshelfStoreEntity[] | null> {
    const summaries = await this.getAllSummaries();
    if (isNull(summaries)) {
      return null;
    }
    const entities = await Promise.all(summaries.map(summary => this.hydrate(summary)));
    return entities.filter((entity): entity is BookshelfStoreEntity => !isNull(entity));
  }
  getByPidAndDetailPageUrl(pid: string, detailPageUrl: string): Promise<BookshelfStoreEntity | null> {
    return this.getSummaryByPidAndDetailPageUrl(pid, detailPageUrl).then(summary => {
      return summary ? this.hydrate(summary) : null;
    }).catch(e => {
      GLOBAL_LOG.error(this.tag, `getByPidAndDetailPageUrl pid:${pid}, detailPageUrl:${detailPageUrl}`, e);
      return Promise.reject(e);
    });
  }
  async put(val: BookshelfStoreEntity): Promise<void> {
    const _val = super.revocationProxy(val);
    const raw = await this.getSummaryByPidAndDetailPageUrl(_val.pid, _val.detailPageUrl);
    const entity = {
      ..._val,
      chapterList: _val.chapterList.map((v, i) => {
        v.index = isUndefined(v.index) ? i : v.index;
        return v;
      }),
      id: isNull(raw) ? _val.id : raw.id
    };
    if (this.shouldWriteMeta(raw, entity)) {
      await this.db.putBookMeta(entity);
    }
    await super.put(this.toSummary(entity) as unknown as BookshelfStoreEntity);
  }
  async remove(id: string): Promise<void> {
    const entity = await this.getById(id);
    await super.remove(id);
    if (!isNull(entity)) {
      await this.db.removeBookMeta(entity.pid, entity.detailPageUrl);
    }
  }
  async removeByPidAndDetailPageUrl(pid: string, detailPageUrl: string): Promise<void> {
    try {
      await this.removeWhere(entity => entity.pid === pid && entity.detailPageUrl === detailPageUrl);
      await this.db.removeBookMeta(pid, detailPageUrl);
    } catch (e) {
      GLOBAL_LOG.error(this.tag, `removeByPidAndDetailPageUrl pid:${pid}, detailPageUrl:${detailPageUrl}`, e);
      return Promise.reject(e);
    }
  }
  async updateReadProgress(pid: string, detailPageUrl: string, progress: BookshelfReadProgress): Promise<boolean> {
    const summary = await this.getSummaryByPidAndDetailPageUrl(pid, detailPageUrl);
    if (isNull(summary)) {
      return false;
    }
    await super.put({
      ...summary,
      readIndex: isUndefined(progress.readIndex) ? summary.readIndex : progress.readIndex,
      readScrollTop: isUndefined(progress.readScrollTop) ? summary.readScrollTop : progress.readScrollTop,
      readChapterTitle: isUndefined(progress.readChapterTitle) ? summary.readChapterTitle : progress.readChapterTitle,
      timestamp: isUndefined(progress.timestamp) ? summary.timestamp : progress.timestamp
    } as unknown as BookshelfStoreEntity);
    return true;
  }
  async updateDisableRefresh(id: string, disableRefresh: boolean): Promise<boolean> {
    const summary = await super.getById(id) as BookshelfStoreSummary | null;
    if (isNull(summary)) {
      return false;
    }
    await super.put({
      ...summary,
      disableRefresh
    } as unknown as BookshelfStoreEntity);
    return true;
  }
  private getAllSummaries(): Promise<BookshelfStoreSummary[] | null> {
    return super.getAll() as Promise<BookshelfStoreSummary[] | null>;
  }
  private getSummaryByPidAndDetailPageUrl(pid: string, detailPageUrl: string): Promise<BookshelfStoreSummary | null> {
    return this.queryOne(entity => {
      return entity.pid === pid && entity.detailPageUrl === detailPageUrl;
    }) as Promise<BookshelfStoreSummary | null>;
  }
  private async hydrate(summary: BookshelfStoreSummary): Promise<BookshelfStoreEntity | null> {
    const meta = await this.db.getBookMeta(summary.pid, summary.detailPageUrl);
    if (isNull(meta)) {
      return null;
    }
    return {
      ...meta,
      ...summary,
      intro: meta.intro,
      chapterList: meta.chapterList,
      latestChapterTitle: summary.latestChapterTitle || meta.latestChapterTitle
    };
  }
  private toSummary(entity: BookshelfStoreEntity): BookshelfStoreSummary {
    return {
      id: entity.id,
      pid: entity.pid,
      detailPageUrl: entity.detailPageUrl,
      pluginVersionCode: entity.pluginVersionCode,
      baseUrl: entity.baseUrl,
      readIndex: entity.readIndex,
      readScrollTop: entity.readScrollTop,
      disableRefresh: !!entity.disableRefresh,
      searchIndex: entity.searchIndex,
      timestamp: entity.timestamp,
      bookname: entity.bookname,
      author: entity.author,
      coverImageUrl: entity.coverImageUrl,
      latestChapterTitle: entity.latestChapterTitle,
      readChapterTitle: entity.chapterList[entity.readIndex]?.title || '',
      chapterCount: entity.chapterList.length,
      metaSignature: this.metaSignature(entity)
    };
  }
  private shouldWriteMeta(raw: BookshelfStoreSummary | null, entity: BookshelfStoreEntity) {
    if (isNull(raw)) {
      return true;
    }
    return raw.metaSignature !== this.metaSignature(entity) ||
      raw.bookname !== entity.bookname ||
      raw.author !== entity.author ||
      raw.coverImageUrl !== entity.coverImageUrl ||
      raw.latestChapterTitle !== entity.latestChapterTitle ||
      raw.pluginVersionCode !== entity.pluginVersionCode ||
      raw.baseUrl !== entity.baseUrl ||
      raw.chapterCount !== entity.chapterList.length;
  }
  private metaSignature(entity: BookshelfStoreEntity): string {
    const content = JSON.stringify({
      intro: entity.intro,
      chapterList: entity.chapterList.map(chapter => ({
        index: chapter.index,
        title: chapter.title,
        url: chapter.url
      }))
    });
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = Math.imul(31, hash) + content.charCodeAt(i) | 0;
    }
    return `${entity.chapterList.length}:${hash >>> 0}`;
  }
}
