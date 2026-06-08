const CN_NUMBER_TEXT = '\\d\\u96f6\\u3007\\u4e00\\u4e8c\\u4e24\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341\\u767e\\u5343\\u4e07\\u58f9\\u8d30\\u53c1\\u8086\\u4f0d\\u9646\\u67d2\\u634c\\u7396\\u62fe\\u4f70\\u4edf';
const NUMBER_TEXT = `[${CN_NUMBER_TEXT}]+`;
const VOLUME_TITLE_REGEXP_LIST = [
  new RegExp(`^\\u7b2c\\s*${NUMBER_TEXT}\\s*\\u5377\\s*(.*)$`, 'i'),
  new RegExp(`^\\u5377\\s*${NUMBER_TEXT}\\s*(.*)$`, 'i')
];
const CHAPTER_TAIL_REGEXP = new RegExp(`^(?:\\u7b2c\\s*)?${NUMBER_TEXT}\\s*(\\u7ae0|\\u8282|\\u56de|\\u7bc7)`, 'i');

export const isVolumeTitle = (title: string): boolean => {
  const value = title.trim();
  if (!value) {
    return false;
  }
  for (const regexp of VOLUME_TITLE_REGEXP_LIST) {
    const match = regexp.exec(value);
    if (!match) {
      continue;
    }
    const tail = (match[1] || '').trim();
    if (!tail) {
      return true;
    }
    return !CHAPTER_TAIL_REGEXP.test(tail) && tail.length <= 30;
  }
  return false;
}

export const filterVolumeTitles = <T extends { title: string }>(list: T[]): T[] => {
  return list.filter(item => !isVolumeTitle(item.title));
}

export const attachVolumeTitles = <T extends { title: string }>(list: T[]): (T & { volume?: string })[] => {
  let volume = '';
  const result: (T & { volume?: string })[] = [];
  for (const item of list) {
    const title = item.title.trim();
    if (isVolumeTitle(title)) {
      volume = title;
      continue;
    }
    result.push({
      ...item,
      ...(volume ? { volume } : {})
    });
  }
  return result;
}

export const attachVolumeTitlesByTitleList = <T extends { title: string }>(chapters: T[], titleList: string[]): (T & { volume?: string })[] => {
  let volume = '';
  let index = 0;
  const result: (T & { volume?: string })[] = [];
  for (const title of titleList) {
    const value = title.trim();
    if (isVolumeTitle(value)) {
      volume = value;
      continue;
    }
    const chapter = chapters[index++];
    if (!chapter) {
      continue;
    }
    result.push({
      ...chapter,
      ...(volume ? { volume } : {})
    });
  }
  return result;
}
