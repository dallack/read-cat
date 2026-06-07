<script setup lang="ts">
import {
  ElButton,
  ElCheckbox,
  ElPagination,
  ElInput,
  ElIcon,
  ElCheckboxGroup,
  ElCard,
  ElSelect,
  ElOption,
  ElButtonGroup,
  ElEmpty
} from 'element-plus';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useScrollTopStore } from '../../store/scrolltop';
import { PagePath } from '../../core/window';
import { usePagination } from './hooks/pagination';
import { useRefresh } from './hooks/refresh';
import IconSearch from '../../assets/svg/icon-search.svg';
import IconUser from '../../assets/svg/icon-user.svg';
import IconDot from '../../assets/svg/icon-dot.svg';
import IconLoading from '../../assets/svg/icon-loading.svg';
import IconBack from '../../assets/svg/icon-goback-back.svg';
import IconPlugin from '../../assets/svg/icon-settings-plugins.svg';
import IconImport from '../../assets/svg/icon-import.svg';
import IconDelete from '../../assets/svg/icon-delete.svg';
import IconDownload from '../../assets/svg/icon-arrow-line-down.svg';
import { useSettingsStore } from '../../store/settings';
import CoverImage from '../../assets/cover.jpg';
import { Book, useBookshelfStore } from '../../store/bookshelf';
import { useRouter } from 'vue-router';
import { useWindowStore } from '../../store/window';
import { useBookshelfCheckbox } from './hooks/bookshelf-checkbox';
import { useImportBooks } from './hooks/import-books';
import { Window, FileDrag, CloseButton, Text } from '../../components';
import type { WindowEvent } from '../../components/window/index.vue';
import { useTxtParseRuleStore } from '../../store/txt-parse-rules';
import { TxtParserType } from '../../core/book/txt-parser';
import { useMessage } from '../../hooks/message';
import { useDefaultSearch } from '../../hooks/default-search';
import { storeToRefs } from 'pinia';


const router = useRouter();
const bookshelf = useBookshelfStore();
const settings = useSettingsStore();
const { options } = settings;
const { pageScrollTop } = useScrollTopStore();
onMounted(() => {
  pageScrollTop(PagePath.BOOKSHELF);
});

const { refresh, refreshValues } = useRefresh();
const { searchKey, searchResult } = useDefaultSearch(refreshValues);
const CATEGORY_ALL = '\u5168\u90e8';
const showCategoryNav = ref(false);
const selectedCategory = ref(CATEGORY_ALL);
const categoryManagerWindow = ref<WindowEvent>();
const newCategoryName = ref('');
const activeManageCategory = ref('');
const editingCategory = ref('');
const editingCategoryName = ref('');
const navItem = computed(() => {
  return [CATEGORY_ALL, ...settings.bookShelf.categories];
});
const categoryResult = computed(() => {
  if (selectedCategory.value === CATEGORY_ALL) {
    return searchResult.value;
  }
  return searchResult.value.filter(item => settings.bookShelf.bookCategories[item.id] === selectedCategory.value);
});
const { totalPage, currentPage, currentPageChange, showValue } = usePagination(categoryResult);
const manageBookList = computed(() => refreshValues.value);
const getCategoryBookCount = (category: string) => {
  return refreshValues.value.filter(item => settings.bookShelf.bookCategories[item.id] === category).length;
}

const toggleCategoryNav = () => {
  showCategoryNav.value = !showCategoryNav.value;
}

const navItemClick = (item: string) => {
  selectedCategory.value = item;
}

const openCategoryManager = () => {
  activeManageCategory.value = settings.bookShelf.categories[0] || '';
  editingCategory.value = '';
  editingCategoryName.value = '';
  categoryManagerWindow.value?.show();
}

const addCategory = () => {
  const name = newCategoryName.value.trim();
  if (!name || settings.bookShelf.categories.includes(name) || name === CATEGORY_ALL) {
    return;
  }
  settings.bookShelf.categories.push(name);
  activeManageCategory.value = name;
  newCategoryName.value = '';
}

const startEditCategory = (category: string) => {
  editingCategory.value = category;
  editingCategoryName.value = category;
}

const saveEditCategory = () => {
  const oldName = editingCategory.value;
  const newName = editingCategoryName.value.trim();
  if (!oldName || !newName || (newName !== oldName && settings.bookShelf.categories.includes(newName)) || newName === CATEGORY_ALL) {
    return;
  }
  const index = settings.bookShelf.categories.indexOf(oldName);
  if (index < 0) {
    return;
  }
  settings.bookShelf.categories[index] = newName;
  Object.keys(settings.bookShelf.bookCategories).forEach(id => {
    if (settings.bookShelf.bookCategories[id] === oldName) {
      settings.bookShelf.bookCategories[id] = newName;
    }
  });
  if (selectedCategory.value === oldName) {
    selectedCategory.value = newName;
  }
  if (activeManageCategory.value === oldName) {
    activeManageCategory.value = newName;
  }
  editingCategory.value = '';
  editingCategoryName.value = '';
}

const removeCategory = (category: string) => {
  const index = settings.bookShelf.categories.indexOf(category);
  if (index < 0) {
    return;
  }
  settings.bookShelf.categories.splice(index, 1);
  Object.keys(settings.bookShelf.bookCategories).forEach(id => {
    if (settings.bookShelf.bookCategories[id] === category) {
      delete settings.bookShelf.bookCategories[id];
    }
  });
  if (selectedCategory.value === category) {
    selectedCategory.value = CATEGORY_ALL;
  }
  activeManageCategory.value = settings.bookShelf.categories[Math.min(index, settings.bookShelf.categories.length - 1)] || '';
}

const moveCategory = (category: string, step: -1 | 1) => {
  const index = settings.bookShelf.categories.indexOf(category);
  const target = index + step;
  if (index < 0 || target < 0 || target >= settings.bookShelf.categories.length) {
    return;
  }
  const list = settings.bookShelf.categories;
  [list[index], list[target]] = [list[target], list[index]];
}

const bookInActiveCategory = (bookId: string) => {
  return !!activeManageCategory.value && settings.bookShelf.bookCategories[bookId] === activeManageCategory.value;
}

const setBookCategory = (bookId: string, checked: boolean) => {
  if (!activeManageCategory.value) {
    return;
  }
  if (checked) {
    settings.bookShelf.bookCategories[bookId] = activeManageCategory.value;
    return;
  }
  if (settings.bookShelf.bookCategories[bookId] === activeManageCategory.value) {
    delete settings.bookShelf.bookCategories[bookId];
  }
}

watch(() => settings.bookShelf.categories, categories => {
  if (selectedCategory.value !== CATEGORY_ALL && !categories.includes(selectedCategory.value)) {
    selectedCategory.value = CATEGORY_ALL;
  }
  if (activeManageCategory.value && !categories.includes(activeManageCategory.value)) {
    activeManageCategory.value = categories[0] || '';
  }
}, { deep: true });

const { onRefresh } = useWindowStore();
onRefresh(PagePath.BOOKSHELF, refresh);

const removeRouterAfterEach = router.afterEach((to, from, fail) => {
  if (fail) return;
  /**
   * 解决在详情页点击已读章节标题跳转至已读章节阅读页后点击回退按钮无法正常回退的问题
   */
  if (to.path === PagePath.DETAIL && from.path === PagePath.READ) {
    to.query.to = 'normal';
  }
});
onUnmounted(removeRouterAfterEach);

/**
 * @param to
 * normal: 正常跳转
 * already: 跳转至上次已读章节页
 * latest: 跳转至最新章节页
 */
const goDetailPage = (item: Book, to: 'normal' | 'already' | 'latest' = 'normal') => {
  router.push({
    path: PagePath.DETAIL,
    query: {
      pid: item.pid,
      detailUrl: item.detailPageUrl,
      to
    }
  });
}

const {
  checkAll,
  isIndeterminate,
  checkedCities,
  handleCheckAllChange,
  handleCheckedCitiesChange,
  removeBookshelf,
} = useBookshelfCheckbox();

const {
  fileDragChange,
  importBooksWindow,
  isLoading,
  books,
  currentPage: importBookCurrentPage,
  currentChange: importBookCurrentChange,
  importBook,
  modelRule,
  ruleChange,
  closeImportBookWindow,
  removeImportBook,
  openBookFile,
  encodingChange,
} = useImportBooks();

const { rules: txtParseRules } = storeToRefs(useTxtParseRuleStore());

/** 导航至上次阅读章节或最新章节页*/
const goReadPage = (e: MouseEvent, to: 'already' | 'latest', book: Book) => {
  e.stopPropagation();
  goDetailPage(book, to);
}

const exportTxt = (e: MouseEvent, book: Book) => {
  e.stopPropagation();
  bookshelf.exportTxt(book.id);
}
</script>

<template>
  <FileDrag class="container" tip="导入书籍" @change="fileDragChange" :disable="importBooksWindow?.isShow()">
    <div class="bookshelf-container">
      <div class="no-result" v-if="refreshValues.length < 1">
        <ElEmpty description="暂无书本">
          <ElButton type="primary" size="small" :icon="IconBack" @click="router.back()">返回</ElButton>
          <ElButton type="warning" size="small" :icon="IconImport" @click="openBookFile">导入</ElButton>
        </ElEmpty>
      </div>
      <div :class="['result', showCategoryNav ? 'category-nav-visible' : '']" v-else>
        <nav id="bookstore-nav" v-show="showCategoryNav">
          <main class="rc-scrollbar">
            <ul>
              <li class="rc-button nav-manage" @click="openCategoryManager">
                <Text ellipsis title="分类管理">分类管理</Text>
              </li>
              <li :class="[
                'rc-button',
                item === selectedCategory ? 'nav-item-selected' : ''
              ]" v-for="item of navItem" :key="item" @click="navItemClick(item)">
                <Text ellipsis :title="item">{{ item }}</Text>
              </li>
            </ul>
          </main>
        </nav>
        <div :class="['toolbar', options.enableBlur ? 'app-blur' : '']">
          <div class="left">
            <ElCheckbox v-memo="[checkAll, isIndeterminate]" v-model="checkAll" label="全选"
              :indeterminate="isIndeterminate" @change="handleCheckAllChange" />
            <ElPagination v-memo="[totalPage, currentPage]" layout="prev, pager, next" size="small" hide-on-single-page
              :page-count="totalPage" :current-page="currentPage" @current-change="currentPageChange" />
          </div>
          <div class="right">
            <ElButton type="primary" size="small" @click="toggleCategoryNav">分类</ElButton>
            <ElButton type="warning" size="small" :icon="IconImport" @click="openBookFile">导入</ElButton>
            <ElButton type="danger" size="small" :icon="IconDelete" @click="removeBookshelf">移出</ElButton>
            <ElInput v-memo="[searchKey]" v-model="searchKey"  placeholder="请输入书名、作者"
              clearable>
              <template #prefix>
                <ElIcon>
                  <IconSearch />
                </ElIcon>
              </template>
            </ElInput>
          </div>
        </div>
        <ElCheckboxGroup class="list" v-model="checkedCities" @change="handleCheckedCitiesChange">
          <ElCard shadow="hover" v-for="item in showValue" :key="item.id" @click="goDetailPage(item)">
            <div class="cover" v-memo="[item.coverImageUrl]">
              <img :src="item.coverImageUrl" @error="e => (<HTMLImageElement>e.target).src = CoverImage" />
            </div>
            <div class="info">
              <div>
                <p class="bookname" v-if="item.bookname">
                  <Text v-memo="[item.bookname]" :title="item.bookname" ellipsis max-width="160">{{ item.bookname }}</Text>
                  <ElIcon class="is-loading"  v-if="item.isRunningRefresh">
                    <IconLoading style="width: 12px;height: 12px;" />
                  </ElIcon>
                  <ElIcon v-else-if="item.error" :title="`错误 ${item.error}`">
                    <IconDot class="rc-error-color" style="width: 14px;height: 14px;" />
                  </ElIcon>
                </p>
                <p v-if="item.author">
                  <ElIcon v-once title="作者" size="12" style="margin-right: 4px;">
                    <IconUser />
                  </ElIcon>
                  <Text v-memo="[item.author]" :title="`作者 ${item.author}`" ellipsis max-width="160">{{ item.author }}</Text>
                </p>
                <p>
                  <ElIcon v-once title="来源" size="12" style="margin-right: 4px;">
                    <IconPlugin />
                  </ElIcon>
                  <Text v-memo="[item.group, item.pluginName]" :title="`来源 ${item.group}-${item.pluginName}`" ellipsis max-width="160">{{ `${item.group}-${item.pluginName}` }}</Text>
                </p>
              </div>
              <div>
                <div class="chapter-title already" v-if="item.readChapterTitle" @click="e => goReadPage(e, 'already', item)">
                  <ElIcon v-once title="已读" style="color: var(--rc-theme-color);">
                    <IconDot />
                  </ElIcon>
                  <Text v-memo="[item.readChapterTitle]" :title="`已读 ${item.readChapterTitle}`" ellipsis max-width="160">{{ item.readChapterTitle }}</Text>
                </div>
                <div class="chapter-title latest" @click="e => goReadPage(e, 'latest', item)">
                  <div>
                    <template v-if="item.latestChapterTitle">
                      <ElIcon v-once title="最新章节" size="12" style="color: var(--rc-latest-chapter-color);">
                        <IconDot />
                      </ElIcon>
                      <Text v-memo="[item.latestChapterTitle]" :title="`最新章节 ${item.latestChapterTitle}`" ellipsis max-width="145">{{ item.latestChapterTitle }}</Text>
                    </template>
                  </div>
                  <!-- 导出当前书籍为 TXT，文件保存到数据目录的 download 文件夹 -->
                  <ElButton class="export-txt" size="small" circle :icon="IconDownload"
                    :loading="item.isRunningExport"
                    :title="item.exportProgress ? `下载 ${item.exportProgress.current}/${item.exportProgress.total}` : '下载'"
                    @click="e => exportTxt(e, item)" /> 
                  <ElCheckbox v-memo="[item.id]" :key="`checkbox-${item.id}`" :value="item.id"
                    @click="(e: MouseEvent) => e.stopPropagation()" />
                </div>
              </div>
            </div>
          </ElCard>
          <i v-once class="hide" />
          <i v-once class="hide" />
          <i v-once class="hide" />
          <i v-once class="hide" />
          <i v-once class="hide" />
          <i v-once class="hide" />
        </ElCheckboxGroup>
      </div>
    </div>
    <Window center-x center-y width="400" height="500" destroy-on-close :is-loading="isLoading" :click-hide="false"
      @event="e => importBooksWindow = e" class-name="import-books-window">
      <section v-if="books.length > 0">
        <header>
          <div class="title">
            <Text ellipsis max-width="300" :title="books[importBookCurrentPage - 1].filename">{{ books[importBookCurrentPage - 1].filename }}</Text>
            <CloseButton @click="closeImportBookWindow" />
          </div>
          <div class="encoding">
            <ElInput v-if="books[importBookCurrentPage - 1].type === 'txt'" :disabled="books[importBookCurrentPage - 1].importing" v-model="books[importBookCurrentPage - 1].encoding" placeholder="编码" size="small">
              <template #append>
                <ElButton :disabled="books[importBookCurrentPage - 1].importing" size="small" @click="encodingChange">应用</ElButton>
              </template>
            </ElInput>
          </div>
        </header>
        <main>
          <div class="detail">
            <img :src="CoverImage" alt="cover">
            <ul>
              <li class="bookname">
                <ElInput v-model="books[importBookCurrentPage - 1].bookname" placeholder="请输入书名"
                  :disabled="books[importBookCurrentPage - 1].importing" />
                <ElSelect v-if="books[importBookCurrentPage - 1].type === 'txt'" v-model="modelRule.bookname"
                  size="small" popper-class="txt-parser-rules" no-data-text="无匹配规则" @change="ruleChange('bookname')"
                  :disabled="books[importBookCurrentPage - 1].importing">
                  <ElOption v-for="rule of txtParseRules.filter(r => r.type === TxtParserType.BOOK_NAME)" :key="rule.id" :value="rule.id"
                    :label="rule.example" />
                </ElSelect>
              </li>
              <li class="author">
                <div>
                  <ElIcon size="18">
                    <IconUser />
                  </ElIcon>
                  <ElInput v-model="books[importBookCurrentPage - 1].author" placeholder="请输入作者"
                    :disabled="books[importBookCurrentPage - 1].importing" />
                </div>
                <ElSelect v-if="books[importBookCurrentPage - 1].type === 'txt'" v-model="modelRule.author" size="small"
                  popper-class="txt-parser-rules" no-data-text="无匹配规则" @change="ruleChange('author')"
                  :disabled="books[importBookCurrentPage - 1].importing">
                  <ElOption v-for="rule of txtParseRules.filter(r => r.type === TxtParserType.AUTHOR)" :key="rule.id" :value="rule.id"
                    :label="rule.example" />
                </ElSelect>
              </li>
              <li class="intro">
                <div>
                  <span>简介：</span>
                  <ElSelect v-if="books[importBookCurrentPage - 1].type === 'txt'" v-model="modelRule.intro"
                    size="small" popper-class="txt-parser-rules" no-data-text="无匹配规则" @change="ruleChange('intro')"
                    :disabled="books[importBookCurrentPage - 1].importing">
                    <ElOption v-for="rule of txtParseRules.filter(r => r.type === TxtParserType.INTRO)" :key="rule.id" :value="rule.id"
                      :label="rule.example" />
                  </ElSelect>
                </div>
                <ElInput v-model="books[importBookCurrentPage - 1].intro" type="textarea" resize="none"
                  :disabled="books[importBookCurrentPage - 1].importing" />
              </li>
            </ul>
          </div>
          <div class="chapter-list-title">
            <span>章节(共{{ books[importBookCurrentPage - 1].chapterLength }}章)</span>
            <ElSelect v-if="books[importBookCurrentPage - 1].type === 'txt'" v-model="modelRule.chapterList"
              size="small" popper-class="txt-parser-rules" no-data-text="无匹配规则" @change="ruleChange('chapterList')"
              :disabled="books[importBookCurrentPage - 1].importing">
              <ElOption v-for="rule of txtParseRules.filter(r => r.type === TxtParserType.CHAPTER_LIST)" :key="rule.id" :value="rule.id"
                :label="rule.example" />
            </ElSelect>
          </div>
          <ul class="chapter-list rc-scrollbar">
            <li class="rc-button" v-for="item of books[importBookCurrentPage - 1].chapterTitleList" :title="item">
              <Text ellipsis>{{ item }}</Text>
            </li>
          </ul>
        </main>
        <footer>
          <ElButtonGroup>
            <ElButton v-if="books[importBookCurrentPage - 1].status.type === 'pending'"
              :disabled="books[importBookCurrentPage - 1].importing" @click="removeImportBook">删除</ElButton>
            <ElButton v-if="books[importBookCurrentPage - 1].status.type === 'pending'" type="primary"
              :loading="books[importBookCurrentPage - 1].importing" @click="importBook">导入</ElButton>
            <ElButton v-else-if="books[importBookCurrentPage - 1].status.type === 'fulfilled'" type="success" @click="closeImportBookWindow()">导入成功</ElButton>
            <ElButton v-else-if="books[importBookCurrentPage - 1].status.type === 'rejected'" type="danger"
              @click="useMessage().error(books[importBookCurrentPage - 1].status.msg || '导入失败')">{{
                books[importBookCurrentPage - 1].status.msg }}</ElButton>
          </ElButtonGroup>
          <ElPagination layout="prev, pager, next" :current-page="importBookCurrentPage" :page-count="books.length"
            @current-change="importBookCurrentChange" hide-on-single-page />
        </footer>
      </section>
    </Window>
    <Window center-x center-y width="720" height="520" :click-hide="false" @event="e => categoryManagerWindow = e"
      class-name="category-manager-window">
      <section class="category-manager">
        <header>
          <strong>分类管理</strong>
          <CloseButton @click="categoryManagerWindow?.hide()" />
        </header>
        <main>
          <aside>
            <div class="category-add">
              <ElInput v-model="newCategoryName" size="small" placeholder="新增分类" @keyup.enter="addCategory" />
              <ElButton type="primary" size="small" @click="addCategory">新增</ElButton>
            </div>
            <ul class="category-list rc-scrollbar">
              <li v-for="(category, index) of settings.bookShelf.categories" :key="category"
                :class="[category === activeManageCategory ? 'active' : '']" @click="activeManageCategory = category">
                <template v-if="editingCategory === category">
                  <ElInput v-model="editingCategoryName" size="small" @keyup.enter="saveEditCategory" />
                  <ElButton size="small" type="primary" @click="saveEditCategory">保存</ElButton>
                </template>
                <template v-else>
                  <Text ellipsis :title="category">{{ category }}（{{ getCategoryBookCount(category) }}）</Text>
                  <div class="category-actions">
                    <ElButton size="small" :disabled="index === 0" @click.stop="moveCategory(category, -1)">上移</ElButton>
                    <ElButton size="small" :disabled="index === settings.bookShelf.categories.length - 1"
                      @click.stop="moveCategory(category, 1)">下移</ElButton>
                    <ElButton size="small" @click.stop="startEditCategory(category)">修改</ElButton>
                    <ElButton size="small" type="danger" @click.stop="removeCategory(category)">删除</ElButton>
                  </div>
                </template>
              </li>
            </ul>
          </aside>
          <section>
            <div class="book-assign-title">
              <Text ellipsis :title="activeManageCategory">{{ activeManageCategory || '请选择分类' }}</Text>
            </div>
            <ul class="book-assign-list rc-scrollbar">
              <li v-for="item of manageBookList" :key="item.id">
                <ElCheckbox :disabled="!activeManageCategory" :model-value="bookInActiveCategory(item.id)"
                  @change="checked => setBookCategory(item.id, Boolean(checked))" />
                <img :src="item.coverImageUrl" @error="e => (<HTMLImageElement>e.target).src = CoverImage" />
                <div>
                  <Text ellipsis :title="item.bookname">{{ item.bookname }}</Text>
                  <Text ellipsis :title="item.author">{{ item.author }}</Text>
                </div>
              </li>
            </ul>
          </section>
        </main>
      </section>
    </Window>
  </FileDrag>
</template>
<style lang="scss">
.import-books-window {
  section {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 10px;
    height: calc(100% - 20px);

    header {
      div.title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        span {
          font-size: 14px;
        }
      }
      div.encoding {
        display: flex;
        align-items: center;
        

        .el-input {
          width: 120px;

          .el-input__wrapper {
            padding: 0 5px;
            .el-input__inner {
              height: 15px;
            }
          }
          
        }
      }
      
    }

    main {
      height: 350px;
      .detail {
        display: flex;
        flex-direction: row;

        img {
          margin-right: 10px;
          width: 120px;
          border-radius: 10px;
        }

        ul {
          width: 100%;

          li {
            display: flex;
            align-items: center;
            justify-content: space-between;

            &+li {
              margin-top: 5px;
            }

            span {
              display: inline-block;
              width: 40px;
              font-size: 13px;
            }

            .el-input {
              width: 49%;
              border-bottom: 1px solid var(--rc-text-color-dark);
              &:nth-child(2) {
                margin-left: 5px;
              }

              .el-input__wrapper {
                padding: 0;
                background-color: transparent;
                box-shadow: none;

                .el-input__inner {
                  height: 25px;
                  line-height: 25px;
                  font-size: 15px;
                }
              }
            }

            .el-textarea {

              .el-textarea__inner {
                padding: 5px 0;
                box-shadow: none;
                background-color: transparent;
                max-height: 75px;
                height: 75px;
                font-size: 14px;
              }
            }

            .el-select {
              width: 49%;

              .el-select__wrapper {
                width: 100%;
                background-color: transparent;
              }
            }
          }

          .bookname {
            input {
              font-weight: bold;
            }
          }

          .author {
            &>div {
              display: flex;
              align-items: center;
              width: 49%;
            }

            .el-input {
              width: 100%;
            }
          }

          .intro {
            align-items: flex-start;
            flex-direction: column;

            &>div {
              display: flex;
              flex-direction: row;
              align-items: center;
              width: 100%;

              .el-select {
                width: calc(100% - 40px);
              }
            }
          }
        }
      }

      .chapter-list-title {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 15px;
        margin-bottom: 5px;

        span {
          display: inline-block;
          width: 120px;
          font-size: 14px;
        }

        .el-select {
          width: calc(100% - 160px);

          .el-select__wrapper {
            background-color: transparent;
          }
        }
      }

      .chapter-list {
        height: 120px;

        .rc-button {
          justify-content: flex-start;
          padding-left: 5px;
          height: 30px;
          font-size: 13px;
          border-radius: 8px;

          &+.rc-button {
            margin-top: 2px;
          }

          &:active {
            transform: scale(0.98);
          }
        }
      }

    }

    footer {
      display: flex;
      flex-direction: column;
      align-items: center;

      .el-button-group {
        width: 100%;

        .el-button {
          width: 50%;
        }

        .el-button--success,
        .el-button--danger {
          width: 100%;
        }
      }

      .el-pagination {
        margin-top: 5px;

        button,
        li {
          background-color: transparent;
        }
      }
    }
  }
}

.txt-parser-rules {
  .el-select-dropdown__item {
    height: 25px;
    line-height: 25px;
    font-size: 13px;
  }
}

.category-manager-window {
  .category-manager {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--rc-text-color);

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      height: 24px;
      border-bottom: 1px solid rgba(127, 127, 127, 0.16);

      strong {
        font-size: 15px;
      }
    }

    main {
      display: flex;
      height: calc(100% - 49px);
      min-height: 0;

      aside {
        display: flex;
        flex-direction: column;
        width: 320px;
        border-right: 1px solid rgba(127, 127, 127, 0.16);
      }

      section {
        display: flex;
        flex: 1;
        min-width: 0;
        flex-direction: column;
      }
    }

    .category-add {
      display: flex;
      gap: 8px;
      padding: 10px;

      .el-input {
        flex: 1;
      }
    }

    .category-list {
      flex: 1;
      min-height: 0;
      padding: 0 10px 10px;

      li {
        padding: 8px;
        border-radius: 8px;
        background-color: var(--rc-list-item-bgcolor);
        cursor: pointer;

        &+li {
          margin-top: 8px;
        }

        &.active {
          background-color: var(--rc-button-hover-bgcolor);
        }

        .el-input {
          margin-bottom: 6px;
        }
      }
    }

    .category-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;

      .el-button {
        margin-left: 0;
      }
    }

    .book-assign-title {
      display: flex;
      align-items: center;
      padding: 10px;
      height: 24px;
      font-size: 14px;
      font-weight: bold;
      border-bottom: 1px solid rgba(127, 127, 127, 0.16);
    }

    .book-assign-list {
      flex: 1;
      min-height: 0;
      padding: 10px;

      li {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px;
        border-radius: 8px;

        &:hover {
          background-color: var(--rc-button-hover-bgcolor);
        }

        img {
          flex: 0 0 34px;
          width: 34px;
          height: 44px;
          object-fit: cover;
          border-radius: 4px;
        }

        div {
          display: flex;
          min-width: 0;
          flex-direction: column;
          font-size: 13px;

          span:last-child {
            margin-top: 3px;
            opacity: 0.75;
            font-size: 12px;
          }
        }
      }
    }
  }
}
</style>
<style scoped lang="scss">
.bookshelf-container {
  .app-blur {
    background-color: var(--rc-window-box-blur-bgcolor) !important;
  }

  .result {
    position: relative;

    nav {
      display: flex;
      flex-direction: column;
      position: absolute;
      left: 10px;
      top: 50px;
      padding: 10px 0 10px 10px;
      width: 19rem;
      height: calc(100vh - 115px);
      background-color: var(--rc-window-box-bgcolor);
      border-radius: 10px;
      box-shadow: var(--rc-shadow-light);
      overflow: hidden;
      z-index: 2;

      main {
        padding-right: 10px;
        width: calc(100% - 10px);
        height: 100%;

        ul li {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: flex-start;
          margin-bottom: 5px;
          padding: 7px 10px;
          border-radius: 8px;
          font-size: 13px;

          &:active {
            transform: scale(0.98);
          }

          &:last-child {
            margin-bottom: 0;
          }

          &:is(.nav-item-selected) {
            background-color: var(--rc-button-hover-bgcolor);
          }

          &:is(.nav-manage) {
            margin-bottom: 8px;
            border-bottom: 1px solid rgba(127, 127, 127, 0.16);
            border-radius: 8px 8px 0 0;
            color: var(--rc-theme-color);
          }
        }
      }
    }

    :deep(.el-checkbox) {
      .el-checkbox__inner {
        --el-checkbox-checked-bg-color: var(--rc-theme-color);
        --el-checkbox-checked-input-border-color: var(--rc-theme-color);
      }

      .el-checkbox__input.is-checked+.el-checkbox__label {
        --el-checkbox-checked-text-color: var(--rc-theme-color);
      }
    }
  }

  .toolbar {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 10px;
    margin: 0 15px 0 10px;
    padding: 0 10px;
    height: 40px;
    background-color: var(--rc-header-color);
    border-radius: 10px;
    z-index: 1;

    .left {
      display: flex;
      flex-direction: row;

      :deep(.el-pagination) {
        --el-pagination-hover-color: var(--rc-theme-color);
        --el-pagination-button-disabled-bg-color: none;
        --el-pagination-bg-color: none;
        --el-pagination-button-disabled-color: var(--rc-text-color);
      }

      :deep(.el-checkbox) {
        margin-right: 20px;
      }
    }

    .right {
      display: flex;
      align-items: center;

      :deep(.el-input) {
        margin-left: 15px;
        background-color: rgba(127, 127, 127, 0.1);
        border-radius: 10px;

        .el-input__wrapper {
          --el-input-bg-color: none;
          padding: 3px 10px;
          box-shadow: none;

          .el-input__inner {
            font-size: 12px;
            height: 20px;
          }
        }
      }
    }

  }

  .list {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 15px;
    font-size: 14px;

    :deep(.el-card) {
      margin: 0 10px 10px 0;
      border-radius: 10px;
      cursor: pointer;

      .el-card__body {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        padding: 0;

        width: 300px;
      }

      &:hover .cover img {
        transform: scale(1.2);
      }

      .el-checkbox {
        width: 20px;

        .el-checkbox__label {
          display: none;
        }
      }
    }


    .cover {
      margin-right: 5px;
      width: 110px;
      height: 140px;
      overflow: hidden;
      border-radius: 10px;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: all 0.2s ease 0s;
      }
    }


    i.hide {
      margin: 0 10px 10px 0;
      width: 300px;
      height: 0;
    }

    .info {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      width: 180px;
      color: var(--rc-text-color);

      p,
      .chapter-title {
        display: flex;
        flex-direction: row;
        align-items: center;
        margin-bottom: 2px;
        font-size: 12px;
        height: 20px;
        &:last-child {
          margin-bottom: 0;
        }
        
      }

      .chapter-title {
        transition: color .2s ease;
        &.already:hover {
          color: var(--rc-theme-color);
        }
        &.latest:hover {
          color: var(--rc-latest-chapter-color);
        }
      }

      .bookname {
        margin-right: 3px;
        font-size: 16px;
        font-weight: bold;
        justify-content: space-between;
      }

      &>div:first-child {
        margin-top: 5px;
      }

      &>div:last-child {
        margin-bottom: 5px;

        .chapter-title {
          height: 15px;

          &:last-child {
            display: flex;
            justify-content: space-between;
            align-items: center;

            div {
              display: flex;
              align-items: center;
              flex: 1;
              min-width: 0;
              max-width: calc(100% - 52px);
            }

            .export-txt {
              flex: 0 0 20px;
              margin-left: 6px;
              margin-right: 6px;
              width: 20px;
              height: 20px;
              min-height: 20px;
            }
          }
        }
      }
    }


  }
}
</style>
