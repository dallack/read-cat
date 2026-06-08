<script setup lang="ts">
import {
  ElContainer,
  ElHeader,
  ElText,
  ElRadioGroup,
  ElRadioButton,
  ElMain,
  ElIcon
} from 'element-plus';
import { computed, ref } from 'vue';
import { usePagination } from './hooks/pagination';
import { Chapter } from '../../../../core/book/book';
import { useTextContentStore } from '../../../../store/text-content';
import { useMessage } from '../../../../hooks/message';
import { isNull, isUndefined } from '../../../../core/is';
import { useDetailStore } from '../../../../store/detail';
import { storeToRefs } from 'pinia';
import { WindowEvent } from '../../../window/index.vue';
import { useBookshelfStore } from '../../../../store/bookshelf';
import { useCacheChapter } from './hooks/cache-chapter';
import IconCache from '../../../../assets/svg/icon-cache.svg';
import Bookmark from '../../../bookmark/index.vue';
import { useSettingsStore } from '../../../../store/settings';
import { useWindowStore } from '../../../../store/window';
import { useScrollTopStore } from '../../../../store/scrolltop';
import { Text } from '../../..';
import { useReadAloudStore } from '../../../../store/read-aloud';

const props = defineProps<{
  windowEvent?: WindowEvent
}>();


const { isDark } = storeToRefs(useWindowStore());
const { textColor, backgroundImage } = storeToRefs(useSettingsStore());
const radioValue = ref('directory');
const { options } = useSettingsStore();
const message = useMessage();
const { setCurrentReadIndex } = useDetailStore();
const { currentDetailUrl, cacheIndexs } = storeToRefs(useDetailStore());
const { getTextContent } = useTextContentStore();
const { exist, getBookshelfEntity, put } = useBookshelfStore();
const { cache } = useCacheChapter();
const {
  pid,
  showValue,
  currentChapterTitle,
  currentChapterPage
} = usePagination();
const { scrollToTextContent } = useScrollTopStore();
const directoryValue = computed(() => {
  const result: (
    { type: 'volume', title: string, index: number, key: string } |
    { type: 'chapter', title: string, index: number, chapter: Chapter, key: string }
  )[] = [];
  for (let i = 0; i < showValue.value.length; i++) {
    const item = showValue.value[i];
    const prevVolume = i > 0 ? showValue.value[i - 1]?.volume || '' : '';
    if (item.volume && (i === 0 || item.volume !== prevVolume)) {
      result.push({
        type: 'volume',
        title: item.volume,
        index: -1,
        key: `volume-${item.index}-${item.volume}`
      });
    }
    result.push({
      type: 'chapter',
      title: item.title,
      index: item.index,
      chapter: item,
      key: item.url
    });
  }
  return result;
});
const directoryItemClick = (chapter: Chapter) => {
  if (currentChapterTitle.value === chapter.title) {
    return;
  }
  props.windowEvent?.hide();
  const { playerStatus, play, stop } = useReadAloudStore();
  getTextContent(pid.value, chapter).then(() => {
    scrollToTextContent(void 0, 'instant');
    if (isUndefined(chapter.index)) {
      setCurrentReadIndex(-1);
      GLOBAL_LOG.warn(`chapter index is undefined, pid:${pid}`, chapter);
      message.warning('无法获取章节索引');
    } else {
      setCurrentReadIndex(chapter.index);
      if (isNull(currentDetailUrl.value) || !exist(pid.value, currentDetailUrl.value)) {
        return;
      }
      cache(chapter.index);
      getBookshelfEntity(pid.value, currentDetailUrl.value).then(entity => {
        if (!entity) {
          return;
        }
        put({
          ...entity,
          readIndex: chapter.index
        });
      });
    }
    stop();
    if (playerStatus !== 'pause') {
      play(0);
    }
  }).catch(e => {
    message.error(e.message);
  });
}
</script>
<script lang="ts">
export default {
  name: 'ChapterBox'
}
</script>

<template>
  <ElContainer class="chapter-box-container" :style="{
    '--text-color': isDark ? '' : backgroundImage ? '' : textColor,
  }">
    <ElHeader class="chapter-box-header">
      <ElText size="small" truncated v-memo="[currentChapterPage, currentChapterTitle]">当前章节(第{{ currentChapterPage }}页)
        {{ currentChapterTitle }}</ElText>
      <ElRadioGroup v-memo="[radioValue]" v-model="radioValue" size="small" text-color="var(--rc-text-color)">
        <ElRadioButton label="目录" value="directory" />
        <ElRadioButton label="书签" value="bookmark" />
      </ElRadioGroup>
    </ElHeader>
    <ElMain class="chapter-box-main">
      <div v-show="radioValue === 'directory'" class="directory">
        <template v-if="currentDetailUrl">
          <ul :class="['rc-scrollbar', options.enableTransition ? 'rc-scrollbar-behavior' : '']">
            <li v-for="item in directoryValue" :key="item.key" :class="item.type === 'volume' ? 'volume-title' : 'rc-button'"
              @click="item.type === 'chapter' && directoryItemClick(item.chapter)">
              <ElIcon v-if="cacheIndexs[currentDetailUrl].includes(item.index)" title="已缓存">
                <IconCache />
              </ElIcon>
              <Text ellipsis max-width="350" :title="item.title" :style="{
                color: `${item.title === currentChapterTitle ? 'var(--rc-theme-color)' : ''}`,
                fontWeight: `${item.title === currentChapterTitle ? 'bold' : ''}`
              }">{{ item.title }}</Text>
            </li>
          </ul>
        </template>
      </div>
      <div v-show="radioValue === 'bookmark'"
        :class="['bookmark', 'rc-scrollbar', options.enableTransition ? 'rc-scrollbar-behavior' : '']">
        <Bookmark :window-event="windowEvent" />
      </div>
    </ElMain>
  </ElContainer>
</template>

<style scoped lang="scss">
.chapter-box-container {
  * {
    color: var(--text-color);
  }

  .chapter-box-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: .5rem;
    height: 6rem;

    :deep(.el-radio-group) {
      margin-top: 1rem;

      .el-radio-button__inner {
        padding: .7rem 5rem;
        background-color: rgba(127, 127, 127, 0.1);
        border: none;
        box-shadow: none;

        &:hover {
          color: var(--rc-theme-color);
        }
      }

      .el-radio-button__original-radio:checked+.el-radio-button__inner {
        background-color: var(--rc-search-border-color);
      }
    }
  }

  .chapter-box-main {
    padding: .5rem 0;

    .directory {
      position: relative;

      ul {
        height: 42.5rem;
        overflow-y: auto;

        li {
          margin: 0 2rem .5rem;
          padding: 0 1rem;
          line-height: 2.5rem;
          height: 2.5rem;
          font-size: 1.4rem;
          justify-content: flex-start;
          color: currentColor;
          border-radius: .5rem;
          contain: layout;

          &:active {
            transform: scale(0.95);
          }

          &:last-child {
            margin-bottom: 0;
          }

          :deep(.el-icon) {
            margin-right: .5rem;
          }

          &.volume-title {
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: default;
            opacity: 0.75;
            font-weight: bold;
            background-color: rgba(127, 127, 127, 0.08);

            &:active {
              transform: none;
            }
          }
        }
      }

    }

    .bookmark {
      padding: 0 2rem;
      height: 42.5rem;
    }
  }
}
</style>
