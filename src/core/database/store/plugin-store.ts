import { toRaw } from 'vue';
import { isNull } from '../../is';
import { PluginsStoreEntity } from '../database';
import { JsonFileDatabase } from '../json-file-database';
import { BaseStoreDatabase } from './base-store';
import { errorHandler } from '../../utils';

export class PluginsStoreDatabase extends BaseStoreDatabase<PluginsStoreEntity> {

  constructor(db: JsonFileDatabase, storeName: string) {
    super(db, storeName, 'PluginsStoreDatabase');
  }

  getAllByPid(pid: string): Promise<PluginsStoreEntity[] | null> {
    return this.query(entity => entity.pid === pid).catch(e => {
      GLOBAL_LOG.error(this.tag, `getByPid pid:${pid}`, e);
      return Promise.reject(e);
    });
  }
  getByPidAndKey(pid: string, key: string): Promise<PluginsStoreEntity | null> {
    return this.queryOne(entity => {
      return entity.pid === pid && entity.key === key;
    }).catch(e => {
      GLOBAL_LOG.error(this.tag, `getByIdAndKey pid:${pid}, key:${key}`, e);
      return Promise.reject(e);
    });
  }
  async put(val: PluginsStoreEntity): Promise<void> {
    try {
      const _val = toRaw(val);
      const raw = await this.getByPidAndKey(_val.pid, _val.key);
      await super.put({
        ..._val,
        id: isNull(raw) ? _val.id : raw.id
      });
    } catch (e) {
      return errorHandler(e);
    }
  }
  async removeByPidAndKey(pid: string, key: string): Promise<void> {
    try {
      const val = await this.getByPidAndKey(pid, key);
      if (isNull(val)) {
        return;
      }
      await this.remove(val.id);
    } catch (e) {
      GLOBAL_LOG.error(this.tag, `removeByIdAndKey pid:${pid}, key:${key}`, e);
      return errorHandler(e);
    }
  }
  removeByPid(pid: string): Promise<void> {
    return this.removeWhere(entity => entity.pid === pid);
  }
}
