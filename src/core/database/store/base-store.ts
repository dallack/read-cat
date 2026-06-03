import { DatabaseStoreInterface } from '../database';
import { cloneByJSON } from '../../utils';
import { JsonFileDatabase } from '../json-file-database';

export class BaseStoreDatabase<T> implements DatabaseStoreInterface<T> {
  public db: JsonFileDatabase;
  storeName: string;
  tag: string;
  constructor(db: JsonFileDatabase, storeName: string, tag: string) {
    this.db = db;
    this.storeName = storeName;
    this.tag = tag;
  }
  revocationProxy<R = any>(obj: R): R {
    return cloneByJSON(obj);
  }
  getById(id: string): Promise<T | null> {
    return this.db.getById<T>(this.storeName, id).catch(e => {
      GLOBAL_LOG.error(this.tag, 'getById', id, e);
      return Promise.reject(e);
    });
  }
  getAll(): Promise<T[] | null> {
    return this.db.getAll<T>(this.storeName).catch(e => {
      GLOBAL_LOG.error(this.tag, 'getAll', e);
      return Promise.reject(e);
    });
  }
  /**
   * @param revocationProxy 使用cloneByJSON撤销Proxy
   * @default true
   */
  put(val: T, revocationProxy = true): Promise<void> {
    try {
      const _val = revocationProxy ? this.revocationProxy(val) : val;
      return this.db.put(this.storeName, _val).catch(e => {
        GLOBAL_LOG.error(this.tag, 'put', e);
        return Promise.reject(e);
      });
    } catch (e) {
      GLOBAL_LOG.error(this.tag, 'put', e);
      return Promise.reject(e);
    }
  }
  remove(id: string): Promise<void> {
    return this.db.remove(this.storeName, id).catch(e => {
      GLOBAL_LOG.error(this.tag, 'remove', id, e);
      return Promise.reject(e);
    });
  }
  protected query(predicate: (val: T) => boolean): Promise<T[]> {
    return this.db.query<T>(this.storeName, predicate).catch(e => {
      GLOBAL_LOG.error(this.tag, 'query', e);
      return Promise.reject(e);
    });
  }
  protected queryOne(predicate: (val: T) => boolean): Promise<T | null> {
    return this.db.queryOne<T>(this.storeName, predicate).catch(e => {
      GLOBAL_LOG.error(this.tag, 'queryOne', e);
      return Promise.reject(e);
    });
  }
  protected removeWhere(predicate: (val: T) => boolean): Promise<void> {
    return this.db.removeWhere<T>(this.storeName, predicate).catch(e => {
      GLOBAL_LOG.error(this.tag, 'removeWhere', e);
      return Promise.reject(e);
    });
  }

}
