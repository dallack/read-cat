import { HistoryStoreEntity } from '../database';
import { JsonFileDatabase } from '../json-file-database';
import { BaseStoreDatabase } from './base-store';

export class HistoryStoreDatabase extends BaseStoreDatabase<HistoryStoreEntity> {

  constructor(db: JsonFileDatabase, storeName: string) {
    super(db, storeName, 'HistoryStoreDatabase');
    
  }
}
