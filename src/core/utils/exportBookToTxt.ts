// src/core/utils/exportBookToTxt.ts
type AnyRec = Record<string, any>;

/** 尽量鲁棒地抽取章节标题 */
function pickTitle(rec: AnyRec): string {
  return (
    rec.chapter?.title ??
    rec.chapterTitle ??
    rec.title ??
    rec.name ??
    ''
  );
}

/** 尽量鲁棒地抽取正文内容 */
function pickContent(rec: AnyRec): string {
  // 先覆盖数组形式的正文（数据库 textContent: string[]）
  if (Array.isArray(rec.textContent)) {
    return rec.textContent.join('\n');
  }
  if (Array.isArray(rec.chapter?.textContent)) {
    return rec.chapter.textContent.join('\n');
  }

  // 再兜底其他常见字段
  return (
    rec.content ??
    rec.text ??
    rec.chapter?.content ??
    rec.contents ??
    ''
  );
}

/** 尽量鲁棒地获取排序序号 */
function pickOrder(rec: AnyRec, fallbackIndex: number): number {
  const fromFields =
    rec.chapter?.index ??
    rec.chapter?.order ??
    rec.order ??
    rec.index;

  if (typeof fromFields === 'number') return fromFields;

  // 从 URL 尾部提取一段数字作为序号兜底
  const url = rec.chapterUrl ?? rec.chapter?.url ?? rec.url ?? '';
  const m = String(url).match(/(\d{1,10})(?!.*\d)/);
  if (m) return Number(m[1]);

  return fallbackIndex;
}

/** 打开 IndexedDB（默认与应用一致的名称/版本） */
function openDB(dbName = 'ReadCatDatabase', version = 11): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 导出整本书为 txt（基于已缓存的正文数据）
 * @param params.pid        插件/站点 pid
 * @param params.detailUrl  书籍详情页 url（与正文存储的二级索引对应）
 * @param params.bookTitle  书名（用于文件名和文首）
 * @param params.storeName  正文章节 objectStore 名，默认 'store_text_content'
 * @param params.dbName     IndexedDB 名，默认 'ReadCatDatabase'
 * @param params.dbVersion  IndexedDB 版本，默认 11
 */
export async function exportBookToTxt(params: {
  pid: string;
  detailUrl: string;
  bookTitle: string;
  storeName?: string;
  dbName?: string;
  dbVersion?: number;
}) {
  const {
    pid,
    detailUrl,
    bookTitle,
    storeName = 'store_text_content',
    dbName = 'ReadCatDatabase',
    dbVersion = 11
  } = params;

  if (!pid || !detailUrl) {
    throw new Error('缺少 pid 或 detailUrl');
  }

  const db = await openDB(dbName, dbVersion);

  // 读取整本书的章节：依赖索引 index_pid_detailUrl
  const tx = db.transaction([storeName], 'readonly');
  const store = tx.objectStore(storeName);
  const index = store.index('index_pid_detailUrl');

  const range = IDBKeyRange.only([pid, detailUrl]);
  const req = index.openCursor(range);

  const rows: AnyRec[] = [];
  await new Promise<void>((reso, reje) => {
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        rows.push(cursor.value);
        cursor.continue();
      } else {
        reso();
      }
    };
    req.onerror = () => reje(req.error);
  });

  if (!rows.length) {
    throw new Error('没有找到已缓存的章节正文，请先缓存后再导出');
  }

  // 排序（优先 index/order，其次 URL 数字，最后插入顺序）
  const sorted = rows
    .map((r, i) => ({ r, ord: pickOrder(r, i) }))
    .sort((a, b) => a.ord - b.ord)
    .map(x => x.r);

  // 拼装 txt
  const parts: string[] = [];
  parts.push(`${bookTitle}\n\n`);
  for (const rec of sorted) {
    const title = pickTitle(rec);
    const content = pickContent(rec);

    if (title) parts.push(`${title}\n\n`);
    if (content) {
      const fixed = String(content)
        .replace(/\r\n/g, '\n')
        .replace(/\u00A0/g, ' ')
        .replace(/\n{3,}/g, '\n\n'); // 限制连续空行
      parts.push(fixed.trim() + '\n\n');
    }
  }

  const txt = parts.join('');
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });

  // 触发下载
  const a = document.createElement('a');
  const fileName = `${bookTitle.replace(/[\\/:*?"<>|]/g, '_')}.txt`;
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}
