import { defineStore } from 'pinia';
import { BookshelfStoreEntity, TextContentStoreEntity } from '../core/database/database';
import { useMessage } from '../hooks/message';
import { chunkArray, errorHandler, newError, replaceInvisibleStr } from '../core/utils';
import { isNull, isUndefined } from '../core/is';
import { useSettingsStore } from './settings';
import { BookSource } from '../core/plugins/defined/booksource';
import { BookParser } from '../core/book/book-parser';
import { Chapter } from '../core/book/book';
import type { BookshelfReadProgress } from '../core/database/store/bookshelf-store';
import { Core } from '../core';
import fs from 'fs/promises';
import { join } from 'path';
import { nanoid } from 'nanoid';

export type Book = {
  id: string,
  pid: string,
  detailPageUrl: string,
  bookname: string,
  author: string,
  coverImageUrl: string,
  latestChapterTitle?: string,
  searchIndex: string,
  readIndex: number,
  readChapterTitle: string,
  timestamp: number,
  disableRefresh?: boolean,
  pluginVersionCode: number,
  baseUrl: string,
  group: string,
  pluginName: string
}
export type BookRefresh = {
  isRunningRefresh: boolean,
  isRunningExport?: boolean,
  exportProgress?: {
    current: number,
    total: number
  },
  error?: string,
} & Book;

type ExportChapterResult = {
  lines: string[]
};

const sanitizeFilename = (value: string) => {
  return value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'book';
}

const stripHTML = (value: string) => {
  return value
    .replace(/<br\s*\/?>/ig, '\n')
    .replace(/<\/p>/ig, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

const getWritableTxtFileHandle = async (dir: string, filename: string) => {
  let filepath = join(dir, `${filename}.txt`);
  let index = 1;
  while (true) {
    try {
      return {
        filepath,
        handle: await fs.open(filepath, 'wx')
      };
    } catch (e: any) {
      if (e?.code !== 'EEXIST') {
        throw e;
      }
      filepath = join(dir, `${filename}-(${index++}).txt`);
    }
  }
}

const buildChapterExport = async (
  book: BookshelfStoreEntity,
  chapter: Chapter,
  booksource: BookSource | null
): Promise<ExportChapterResult> => {
  let content = await GLOBAL_DB.store.textContentStore.getByPidAndChapterUrl(book.pid, chapter.url);
  if (isNull(content) && booksource) {
    const textContent = await booksource.getTextContent(chapter);
    content = {
      id: nanoid(),
      pid: book.pid,
      detailUrl: book.detailPageUrl,
      chapter,
      textContent
    } as TextContentStoreEntity;
    await GLOBAL_DB.store.textContentStore.put(content);
  }
  if (isNull(content)) {
    throw newError(`章节内容为空: ${chapter.title}`);
  }
  return {
    lines: [
      chapter.title,
      ...content.textContent.map(stripHTML).filter(v => v),
      ''
    ]
  };
}

export const useBookshelfStore = defineStore('Bookshelf', {
  state: () => {
    return {
      _books: new Map<string, BookRefresh>(),
      currentPage: 1,
      refreshed: false
    }
  },
  getters: {
    books(): BookRefresh[] {
      this._books.size <= 0 && (this.currentPage = 1);
      return Array.from(this._books.values()).sort((a, b) => b.timestamp - a.timestamp);
    },
  },
  actions: {
    async getBookshelfEntity(pid: string, detailPageUrl: string) {
      try {
        return await GLOBAL_DB.store.bookshelfStore.getByPidAndDetailPageUrl(pid, detailPageUrl);
      } catch (e: any) {
        useMessage().error(e.message);
        return errorHandler(e);
      }
    },
    exist(pid: string, detailPageUrl: string) {
      return Array.from(this._books.values())
        .findIndex(v => v.pid === pid && v.detailPageUrl === detailPageUrl)
        >= 0;
    },
    async updateReadProgress(pid: string, detailPageUrl: string, progress: BookshelfReadProgress): Promise<void> {
      try {
        const updated = await GLOBAL_DB.store.bookshelfStore.updateReadProgress(pid, detailPageUrl, progress);
        if (!updated) {
          return;
        }
        const entity = Array.from(this._books.values())
          .find(v => v.pid === pid && v.detailPageUrl === detailPageUrl);
        if (!entity) {
          return;
        }
        this._books.set(entity.id, {
          ...entity,
          readIndex: isUndefined(progress.readIndex) ? entity.readIndex : progress.readIndex,
          readChapterTitle: isUndefined(progress.readChapterTitle) ? entity.readChapterTitle : progress.readChapterTitle,
          timestamp: isUndefined(progress.timestamp) ? entity.timestamp : progress.timestamp
        });
      } catch (e: any) {
        useMessage().error(e.message);
        return errorHandler(e);
      }
    },
    async put(entity: BookshelfStoreEntity): Promise<void> {
      try {
        const _entity = replaceInvisibleStr(entity);
        if (!entity.id.trim()) {
          throw newError('ID为空');
        }
        if (!entity.pid.trim() || !entity.detailPageUrl.trim()) {
          throw newError('PID或DetailUrl为空');
        }
        const {
          id,
          pid,
          detailPageUrl,
          bookname,
          author,
          coverImageUrl,
          chapterList,
          latestChapterTitle,
          searchIndex,
          readIndex,
          disableRefresh,
          timestamp,
          pluginVersionCode,
          baseUrl
        } = _entity;
        const props = GLOBAL_PLUGINS.getPluginPropsById(pid);
        let GROUP, NAME;
        if (pid !== BookParser.PID) {
          if (isUndefined(props)) throw newError('插件属性获取失败');
          GROUP = props.GROUP;
          NAME = props.NAME;
        } else {
          GROUP = '内置';
          NAME = '本地书籍';
        }
        const obj: Book = {
          id,
          pid,
          detailPageUrl,
          bookname,
          author,
          coverImageUrl,
          latestChapterTitle,
          searchIndex,
          readIndex,
          readChapterTitle: chapterList[readIndex]?.title,
          disableRefresh: !!disableRefresh,
          timestamp,
          pluginVersionCode,
          baseUrl,
          group: GROUP,
          pluginName: NAME
        };
        await GLOBAL_DB.store.bookshelfStore.put(_entity);
        this._books.set(id, {
          isRunningRefresh: false,
          isRunningExport: false,
          error: void 0,
          ...obj
        });
      } catch (e: any) {
        useMessage().error(e.message);
        return errorHandler(e);
      }
    },
    async setDisableRefresh(id: string, disableRefresh: boolean): Promise<void> {
      try {
        const entity = this._books.get(id);
        if (!entity) {
          return;
        }
        const updated = await GLOBAL_DB.store.bookshelfStore.updateDisableRefresh(id, disableRefresh);
        if (!updated) {
          return;
        }
        this._books.set(id, {
          ...entity,
          disableRefresh
        });
      } catch (e: any) {
        useMessage().error(e.message);
        return errorHandler(e);
      }
    },
    async exportTxt(id: string): Promise<string | undefined> {
      const message = useMessage();
      const entity = this._books.get(id);
      if (!entity || entity.isRunningExport) {
        return;
      }
      const loading = message.loading(`正在导出《${entity.bookname}》`);
      entity.isRunningExport = true;
      entity.exportProgress = void 0;
      let file: Awaited<ReturnType<typeof getWritableTxtFileHandle>> | undefined;
      try {
        if (!Core.dataPath) {
          throw newError('dataPath is undefined');
        }
        const book = await GLOBAL_DB.store.bookshelfStore.getById(id);
        if (isNull(book)) {
          throw newError('无法获取书籍信息');
        }
        let booksource: BookSource | null = null;
        if (book.pid !== BookParser.PID) {
          const plugin = GLOBAL_PLUGINS.getPluginById<BookSource>(book.pid);
          if (isUndefined(plugin)) {
            throw newError(`无法获取插件, 插件ID:${book.pid}`);
          }
          if (isNull(plugin.instance)) {
            throw newError(`插件未启用, 插件ID:${book.pid}`);
          }
          if (isUndefined(plugin.props.BASE_URL) || plugin.props.BASE_URL.trim() !== book.baseUrl.trim()) {
            throw newError('插件请求目标链接[BASE_URL]不匹配');
          }
          booksource = plugin.instance;
        }

        const downloadDir = join(Core.dataPath, 'download');
        await fs.mkdir(downloadDir, { recursive: true });
        file = await getWritableTxtFileHandle(downloadDir, sanitizeFilename(book.bookname));
        await file.handle.writeFile(`${[
          book.bookname,
          book.author ? `作者：${book.author}` : '',
          ''
        ].join('\n')}\n`, { encoding: 'utf-8' });

        const threadsNumber = Math.max(1, useSettingsStore().threadsNumber || 1);
        const chapterGroups = chunkArray(book.chapterList, threadsNumber);
        let errorCount = 0;
        let exportedCount = 0;
        entity.exportProgress = {
          current: 0,
          total: book.chapterList.length
        };

        for (const chapterGroup of chapterGroups) {
          const results = await Promise.allSettled(
            chapterGroup.map(chapter => buildChapterExport(book, chapter, booksource))
          );
          for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const chapter = chapterGroup[i];
            if (result.status === 'rejected') {
              errorCount++;
              GLOBAL_LOG.error('Bookshelf exportTxt chapter', `bookId:${id}`, chapter, result.reason);
            } else {
              await file.handle.writeFile(`${result.value.lines.join('\n')}\n`, { encoding: 'utf-8' });
            }
            exportedCount++;
            entity.exportProgress = {
              current: exportedCount,
              total: book.chapterList.length
            };
          }
        }
        if (errorCount > 0) {
          message.warning(`导出完成，${errorCount} 个章节导出失败：${file.filepath}`);
        } else {
          message.success(`导出完成：${file.filepath}`);
        }
        return file.filepath;
      } catch (e: any) {
        message.error(e.message);
        GLOBAL_LOG.error(`Bookshelf exportTxt bookId:${id}`, e);
        return errorHandler(e);
      } finally {
        await file?.handle.close().catch(() => void 0);
        entity.isRunningExport = false;
        entity.exportProgress = void 0;
        loading.close();
      }
    },
    async remove(id: string): Promise<void> {
      try {
        if (this._books.has(id)) {
          await GLOBAL_DB.store.bookshelfStore.remove(id);
          this._books.delete(id);
        }
      } catch (e: any) {
        useMessage().error(e.message);
        return errorHandler(e);
      }
    },
    async removeByPidAndDetailUrl(pid: string, detailUrl: string): Promise<void> {
      try {
        const entity = Array.from(this._books.values()).find(v => v.pid === pid && v.detailPageUrl === detailUrl);
        if (entity) {
          await GLOBAL_DB.store.bookshelfStore.remove(entity.id);
          this._books.delete(entity.id);
        }
      } catch (e: any) {
        useMessage().error(e.message);
        return errorHandler(e);
      }
    },
    async refresh(id: string): Promise<void> {
      const entity = this._books.get(id);
      if (!entity || entity.isRunningRefresh) {
        return;
      }
      const db = await GLOBAL_DB.store.bookshelfStore.getById(id);
      if (isNull(db)) {
        return;
      }
      try {
        const { pid, detailPageUrl, baseUrl } = entity;
        if (pid === BookParser.PID) {
          return;
        }
        const plugin = GLOBAL_PLUGINS.getPluginById<BookSource>(pid);
        if (isUndefined(plugin)) {
          throw newError(`无法获取插件, 插件ID:${pid}`);
        }
        const { props, instance } = plugin;
        if (isNull(instance)) {
          throw newError(`插件未启用, 插件ID:${pid}`);
        }
        if (isUndefined(props.BASE_URL) || props.BASE_URL.trim() !== baseUrl.trim()) {
          throw newError('插件请求目标链接[BASE_URL]不匹配');
        }
        entity.isRunningRefresh = true;
        const {
          bookname,
          author,
          intro,
          coverImageUrl,
          chapterList,
          latestChapterTitle
        } = await instance.getDetail(detailPageUrl);
        await this.put({
          id: db.id,
          pid: db.pid,
          detailPageUrl: db.detailPageUrl,
          pluginVersionCode: db.pluginVersionCode,
          readIndex: db.readIndex,
          readScrollTop: db.readScrollTop,
          disableRefresh: db.disableRefresh,
          searchIndex: db.searchIndex,
          timestamp: db.timestamp,
          baseUrl: db.baseUrl,
          bookname: bookname.trim() || db.bookname,
          author: author.trim() || db.author,
          intro: intro?.trim() || db.intro,
          coverImageUrl: coverImageUrl.trim() || db.coverImageUrl,
          chapterList: chapterList || db.chapterList,
          latestChapterTitle: latestChapterTitle?.trim() || db.latestChapterTitle
        });
      } catch (e: any) {
        entity.error = errorHandler(e, true);
        GLOBAL_LOG.error(`Bookshelf refresh bookId:${id}`, e);
        return errorHandler(e);
      } finally {
        entity.isRunningRefresh = false;
      }

    },
    async refreshAll() {
      const { threadsNumber } = useSettingsStore();
      const threads = chunkArray(Array.from(this._books.values()).filter(book => !book.disableRefresh), threadsNumber);
      for (const thread of threads) {
        const ps: Promise<void>[] = [];
        for (const book of thread) {
          if (book.isRunningRefresh) {
            continue;
          }
          ps.push(this.refresh(book.id));
        }
        await Promise.allSettled(ps);
      }
    },
  }
});
