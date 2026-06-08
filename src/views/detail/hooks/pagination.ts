import { Ref, nextTick, ref, toRaw, watch } from 'vue';
import { Chapter } from '../../../core/book/book';
import { DetailPageResult, useDetailStore } from '../../../store/detail';
import { storeToRefs } from 'pinia';

export type ChapterDirectoryRow =
  | { type: 'volume', title: string, key: string }
  | { type: 'chapters', chapters: Chapter[], key: string };

export const useChapterPagination = (result: Ref<DetailPageResult | null>) => {
  const detailStore = storeToRefs(useDetailStore());
  const { currentReadIndex } = detailStore;
  const showValue = ref<ChapterDirectoryRow[]>([]);
  const createRows = (chapterList: Chapter[]) => {
    const rows: ChapterDirectoryRow[] = [];
    let currentVolume = '';
    let chapters: Chapter[] = [];
    const flushChapters = () => {
      if (chapters.length < 1) {
        return;
      }
      rows.push({
        type: 'chapters',
        chapters,
        key: `chapters-${chapters[0].index}`
      });
      chapters = [];
    };
    for (const chapter of chapterList) {
      if (chapter.volume && chapter.volume !== currentVolume) {
        flushChapters();
        currentVolume = chapter.volume;
        rows.push({
          type: 'volume',
          title: chapter.volume,
          key: `volume-${chapter.index}-${chapter.volume}`
        });
      }
      chapters.push(chapter);
      if (chapters.length >= 3) {
        flushChapters();
      }
    }
    flushChapters();
    return rows;
  }
  watch(() => result.value, (newVal, _) => {
    if (!newVal) {
      showValue.value = [];
      return;
    }
    const { chapterList } = toRaw(newVal);
    showValue.value = createRows(chapterList);
    if (currentReadIndex.value >= 0) {
      nextTick(() => {
        const list = document.querySelector<HTMLDivElement>('#detail-result-box .chapter .list');
        if (!list) {
          return;
        }
        const span = document.querySelector<HTMLSpanElement>(`#detail-result-box .chapter .list span[data-index='${currentReadIndex.value}']`);
        const row = span?.parentElement?.parentElement;
        if (!row) {
          return;
        }
        if (row.offsetTop > 0) {
          list.scrollTop = row.offsetTop - (list.clientHeight + row.clientHeight - list.clientHeight / 3);
        }
      });
    }
  }, {
    immediate: true,
    deep: true
  });
  return {
    showValue,
    currentReadIndex
  }
}
