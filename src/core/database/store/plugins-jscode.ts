import { PluginsJSCodeEntity } from '../database';
import { JsonFileDatabase } from '../json-file-database';
import { BaseStoreDatabase } from './base-store';

export class PluginsJSCodeDatabase extends BaseStoreDatabase<PluginsJSCodeEntity> {

  constructor(db: JsonFileDatabase, storeName: string) {
    super(db, storeName, 'PluginsJSCodeDatabase');
  }
}
