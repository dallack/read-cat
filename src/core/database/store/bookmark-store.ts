import { useMessage } from '../../../hooks/message';
import { useBookmarkStore } from '../../../store/bookmark';
import { isNull } from '../../is';
import { BookmarkStoreEntity } from '../database';
import { JsonFileDatabase } from '../json-file-database';
import { BaseStoreDatabase } from './base-store';

export class BookmarkStoreDatabase extends BaseStoreDatabase<BookmarkStoreEntity> {
  constructor(db: JsonFileDatabase, storeName: string) {
    super(db, storeName, 'BookmarkStoreDatabase');
    this.read();
  }
  private read() {
    const message = useMessage();
    const store = useBookmarkStore();
    super.getAll().then(res => {
      if (isNull(res) || res.length <= 0) {
        return;
      }
      res.forEach(r => store._bookmarks.set(r.id, r));
    }).catch((e: any) => {
      GLOBAL_LOG.error(this.tag, 'read', e);
      message.error(`书签读取失败, Error: ${e.message}`);
    });
  }
  getByChapterUrl(chapterUrl: string) {
    return this.query(entity => entity.chapterUrl === chapterUrl).catch(e => {
      GLOBAL_LOG.error(this.tag, `getByChapterUrl chapterUrl:${chapterUrl}`, e);
      return Promise.reject(e);
    });
  }
  getByDetailUrl(detailUrl: string) {
    return this.query(entity => entity.detailUrl === detailUrl).catch(e => {
      GLOBAL_LOG.error(this.tag, `getByDetailUrl detailUrl:${detailUrl}`, e);
      return Promise.reject(e);
    });
  }
  removeByDetailUrl(detailUrl: string): Promise<void> {
    return this.removeWhere(entity => entity.detailUrl === detailUrl);
  }
}
