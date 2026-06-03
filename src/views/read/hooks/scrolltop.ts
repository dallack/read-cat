import { storeToRefs } from 'pinia';
import { useScrollTopStore } from '../../../store/scrolltop';
import { useDetailStore } from '../../../store/detail';
import { onMounted, onUnmounted } from 'vue';
import { useBookshelfStore } from '../../../store/bookshelf';
import { useTextContentStore } from '../../../store/text-content';

export const useScrollTop = (pid: string, detailUrl: string) => {
  const scrollTopStore = useScrollTopStore();
  const { mainElement } = storeToRefs(scrollTopStore);
  const { currentReadScrollTop } = useDetailStore();
  const { currentChapter } = storeToRefs(useTextContentStore());
  const bookshelf = useBookshelfStore();
  let scrollTop = 0;
  const listener = (e: Event) => {
    scrollTop = (<HTMLElement>e.target).scrollTop;
    const index = currentChapter.value?.index ?? currentReadScrollTop.chapterIndex;
    bookshelf.updateReadProgress(pid, detailUrl, {
      readIndex: index,
      readScrollTop: scrollTop,
      readChapterTitle: currentChapter.value?.title
    }).then(() => {
      currentReadScrollTop.chapterIndex = index;
      currentReadScrollTop.scrollTop = scrollTop;
    });
  }

  onMounted(() => {
    scrollTopStore.scrollToTextContent(void 0, 'instant');
    mainElement.value.addEventListener('scrollend', listener);
  });
  onUnmounted(() => {
    mainElement.value.removeEventListener('scrollend', listener);
    bookshelf.updateReadProgress(pid, detailUrl, {
      readIndex: currentChapter.value?.index ?? currentReadScrollTop.chapterIndex,
      readScrollTop: scrollTop,
      readChapterTitle: currentChapter.value?.title
    });
  });
}
