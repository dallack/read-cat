import { storeToRefs } from 'pinia';
import { useDetailStore } from '../../../../../store/detail';
import { ref, toRaw, watch } from 'vue';
import { Chapter } from '../../../../../core/book/book';
import { isNull } from '../../../../../core/is';

export const usePagination = () => {
  const { detailResult, currentReadIndex } = storeToRefs(useDetailStore());
  const currentChapterTitle = ref('');
  const currentChapterPage = ref(0);
  const pid = ref('');
  const showValue = ref<Chapter[]>([]);
  watch(() => detailResult.value, (newVal, _) => {
    if (isNull(newVal)) {
      return;
    }
    pid.value = newVal.pid;
    currentChapterTitle.value = newVal.chapterList[currentReadIndex.value]?.title || '';
    currentChapterPage.value = currentReadIndex.value + 1;
    showValue.value = toRaw(newVal.chapterList);
  }, {
    immediate: true,
    deep: true
  });
  watch(() => currentReadIndex.value, (newVal) => {
    currentChapterPage.value = newVal + 1;
    if (isNull(detailResult.value)) {
      return;
    }
    currentChapterTitle.value = detailResult.value.chapterList[newVal]?.title || '';
  }, {
    immediate: true
  });

  return {
    pid,
    showValue,
    currentChapterTitle,
    currentChapterPage
  }
}
