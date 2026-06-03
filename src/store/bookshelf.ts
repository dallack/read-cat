import { defineStore } from 'pinia';
import { BookshelfStoreEntity, TextContentStoreEntity } from '../core/database/database';
import { useMessage } from '../hooks/message';
import { chunkArray, errorHandler, newError, replaceInvisibleStr } from '../core/utils';
import { isNull, isUndefined } from '../core/is';
import { useSettingsStore } from './settings';
import { BookSource } from '../core/plugins/defined/booksource';
import { BookParser } from '../core/book/book-parser';
import type { BookshelfReadProgress } from '../core/database/store/bookshelf-store';
import { Core } from '../core';
import fs from 'fs/promises';
import { existsSync } from 'fs';
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
  pluginVersionCode: number,
  baseUrl: string,
  group: string,
  pluginName: string
}
export type BookRefresh = {
  isRunningRefresh: boolean,
  isRunningExport?: boolean,
  error?: string,
} & Book;

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

const getWritableTxtPath = (dir: string, filename: string) => {
  let filepath = join(dir, `${filename}.txt`);
  let index = 1;
  while (existsSync(filepath)) {
    filepath = join(dir, `${filename}-(${index++}).txt`);
  }
  return filepath;
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
    async exportTxt(id: string): Promise<string | undefined> {
      const message = useMessage();
      const entity = this._books.get(id);
      if (!entity || entity.isRunningExport) {
        return;
      }
      const loading = message.loading(`正在导出《${entity.bookname}》`);
      entity.isRunningExport = true;
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

        const lines: string[] = [
          book.bookname,
          book.author ? `作者：${book.author}` : '',
          ''
        ];
        let errorCount = 0;
        for (const chapter of book.chapterList) {
          try {
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
              errorCount++;
              continue;
            }
            lines.push(chapter.title);
            lines.push(...content.textContent.map(stripHTML).filter(v => v));
            lines.push('');
          } catch (e) {
            errorCount++;
            GLOBAL_LOG.error('Bookshelf exportTxt chapter', `bookId:${id}`, chapter, e);
          }
        }

        const downloadDir = join(Core.dataPath, 'download');
        await fs.mkdir(downloadDir, { recursive: true });
        const filepath = getWritableTxtPath(downloadDir, sanitizeFilename(book.bookname));
        await fs.writeFile(filepath, `${lines.join('\n')}\n`, { encoding: 'utf-8' });
        if (errorCount > 0) {
          message.warning(`导出完成，${errorCount} 个章节导出失败：${filepath}`);
        } else {
          message.success(`导出完成：${filepath}`);
        }
        return filepath;
      } catch (e: any) {
        message.error(e.message);
        GLOBAL_LOG.error(`Bookshelf exportTxt bookId:${id}`, e);
        return errorHandler(e);
      } finally {
        entity.isRunningExport = false;
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
      const threads = chunkArray(Array.from(this._books.values()), threadsNumber);
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
