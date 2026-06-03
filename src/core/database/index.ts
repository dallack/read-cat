import { isNull } from '../is';
import path from 'path';
import { SearchKeyStoreDatabase } from './store/searchkey-store';
import { HistoryStoreDatabase } from './store/history-store';
import { PluginsStoreDatabase } from './store/plugin-store';
import { PluginsJSCodeDatabase } from './store/plugins-jscode';
import { BookshelfStoreDatabase } from './store/bookshelf-store';
import { TextContentStoreDatabase } from './store/text-content-store';
import { BookmarkStoreDatabase } from './store/bookmark-store';
import { SettingsStoreDatabase } from './store/settings-store';
import { newError } from '../utils';
import { ReadColorStoreDatabase } from './store/read-color-store';
import { TxtParseRuleStoreDatabase } from './store/txt-parse-rule-store';
import { PluginsRequireDatabase } from './store/plugin-require';
import { JsonFileDatabase } from './json-file-database';

export enum StoreName {
  PLUGINS = 'store_plugins_jscode',
  PLUGINS_STORE = 'store_plugins_store',
  HISTORY = 'store_history',
  SEARCH_KEY = 'store_searchkey',
  BOOKSHELF = 'store_bookshelf',
  TEXT_CONTENT = 'store_text_content',
  BOOKMARK = 'store_bookmark',
  SETTINGS = 'store_settings',
  READ_COLOR = 'store_read_color',
  TXT_PARSE_RULE = 'store_txt_parse_rule',
  PLUGIN_REQUIRE = 'store_plugin_require',
}

export class Database {
  public static readonly VERSION: number = 12;
  public static readonly NAME: string = 'ReadCatDatabase';

  private db: JsonFileDatabase | null = null;

  private _store: {
    pluginsJSCode: PluginsJSCodeDatabase,
    pluginsStore: PluginsStoreDatabase,
    historyStore: HistoryStoreDatabase,
    searchKeyStore: SearchKeyStoreDatabase,
    bookshelfStore: BookshelfStoreDatabase,
    textContentStore: TextContentStoreDatabase,
    bookmarkStore: BookmarkStoreDatabase,
    settingsStore: SettingsStoreDatabase,
    readColorStore: ReadColorStoreDatabase,
    txtParseRuleStore: TxtParseRuleStoreDatabase,
    pluginRequireStore: PluginsRequireDatabase,
  } | null = null;
  constructor() {

  }

  public get store() {
    if (isNull(this._store)) {
      throw newError('Database opening failure');
    }
    return this._store;
  }
  private initStore() {
    if (isNull(this.db)) {
      throw newError('Database opening failure');
    }
    if (isNull(this._store)) {
      this._store = {
        pluginsJSCode: new PluginsJSCodeDatabase(this.db, StoreName.PLUGINS),
        pluginsStore: new PluginsStoreDatabase(this.db, StoreName.PLUGINS_STORE),
        historyStore: new HistoryStoreDatabase(this.db, StoreName.HISTORY),
        searchKeyStore: new SearchKeyStoreDatabase(this.db, StoreName.SEARCH_KEY),
        bookshelfStore: new BookshelfStoreDatabase(this.db, StoreName.BOOKSHELF),
        textContentStore: new TextContentStoreDatabase(this.db, StoreName.TEXT_CONTENT),
        bookmarkStore: new BookmarkStoreDatabase(this.db, StoreName.BOOKMARK),
        settingsStore: new SettingsStoreDatabase(this.db, StoreName.SETTINGS),
        readColorStore: new ReadColorStoreDatabase(this.db, StoreName.READ_COLOR),
        txtParseRuleStore: new TxtParseRuleStoreDatabase(this.db, StoreName.TXT_PARSE_RULE),
        pluginRequireStore: new PluginsRequireDatabase(this.db, StoreName.PLUGIN_REQUIRE),
      };
    }

  }
  public async open(dataPath?: string) {
    try {
      const rootPath = path.join(dataPath || process.cwd(), 'db');
      this.db = new JsonFileDatabase(rootPath, Object.values(StoreName), StoreName.TEXT_CONTENT);
      await this.db.open();
      this.initStore();
    } catch (e) {
      GLOBAL_LOG.error('Database open', e);
      return Promise.reject(e);
    }
  }
  public close() {
    return;
  }
}
