import { Chapter } from '../../book/book';
import { isNull } from '../../is';
import { TextContentStoreEntity } from '../database';
import { JsonFileDatabase } from '../json-file-database';
import { BaseStoreDatabase } from './base-store';

export class TextContentStoreDatabase extends BaseStoreDatabase<TextContentStoreEntity> {

  constructor(db: JsonFileDatabase, storeName: string) {
    super(db, storeName, 'TextContentStoreDatabase');
  }
  getByPidAndDetailUrl(pid: string, detailUrl: string): Promise<TextContentStoreEntity[] | null> {
    return this.db.getTextContentByPidAndDetailUrl(pid, detailUrl).catch(e => {
      GLOBAL_LOG.error(this.tag, `getByPidAndDetailUrl pid:${pid}, detailUrl:${detailUrl}`, e);
      return Promise.reject(e);
    });
  }
  getByPidAndChapterUrl(pid: string, chapterUrl: string): Promise<TextContentStoreEntity | null> {
    return this.db.getTextContentByPidAndChapterUrl(pid, chapterUrl).catch(e => {
      GLOBAL_LOG.error(this.tag, `getByPidAndChapterUrl pid:${pid}, chapterUrl:${chapterUrl}`, e);
      return Promise.reject(e);
    });
  }
  getByPidAndChapterIndex(pid: string, chapterIndex: number): Promise<TextContentStoreEntity | null> {
    return this.db.getTextContentByPidAndChapterIndex(pid, chapterIndex).catch(e => {
      GLOBAL_LOG.error(this.tag, `getByPidAndChapterIndex pid:${pid}, chapterIndex:${chapterIndex}`, e);
      return Promise.reject(e);
    });
  }
  async put(val: TextContentStoreEntity): Promise<void> {
    const _val = super.revocationProxy(val);
    await super.put(_val);
  }
  async putMany(vals: TextContentStoreEntity[]): Promise<void> {
    const values = vals.map(val => super.revocationProxy(val));
    await this.db.putTextContents(values).catch(e => {
      GLOBAL_LOG.error(this.tag, 'putMany', e);
      return Promise.reject(e);
    });
  }
  async removeByPidAndChapter(pid: string, chapter: Chapter): Promise<void> {
    const val = await this.getByPidAndChapterUrl(pid, chapter.url);
    if (isNull(val)) {
      return;
    }
    await this.remove(val.id);
  }
  removeByPidAndDetailUrl(pid: string, detailUrl: string): Promise<void> {
    return this.db.removeTextContentByPidAndDetailUrl(pid, detailUrl).catch(e => {
      GLOBAL_LOG.error(this.tag, `removeByPidAndDetailUrl pid:${pid}, detailUrl:${detailUrl}`, e);
      return Promise.reject(e);
    });
  }
}
