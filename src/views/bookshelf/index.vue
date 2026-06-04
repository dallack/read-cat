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
  ElEmpty,
  ElMessageBox
} from 'element-plus';
import { computed, onMounted, ref, watch } from 'vue';
import { useScrollTopStore } from '../../store/scrolltop';
import { PagePath } from '../../core/window';
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
import { useTxtParseRuleStore } from '../../store/txt-parse-rules';
import { TxtParserType } from '../../core/book/txt-parser';
import { useMessage } from '../../hooks/message';
import { storeToRefs } from 'pinia';


const router = useRouter();
const bookshelf = useBookshelfStore();
const { books: showValue, total, currentPage, bookgroups } = storeToRefs(bookshelf);
const settings = useSettingsStore();
const { options } = settings;
const { pageScrollTop } = useScrollTopStore();
onMounted(() => {
  pageScrollTop(PagePath.BOOKSHELF);
});

const BOOKGROUP_ALL = '全部';
const BOOKGROUP_DEFAULT = '未分类';
const DEFAULT_BOOKGROUPS = ['玄幻', '武侠'];
const selected = ref(BOOKGROUP_ALL);
const targetBookgroup = ref(DEFAULT_BOOKGROUPS[0]);
const searchKey = ref('');
const isAllBookgroup = (value: string) => value === BOOKGROUP_ALL;
const isDefaultBookgroup = (value: string) => value === BOOKGROUP_DEFAULT;
const isSystemBookgroup = (value: string) => isAllBookgroup(value) || isDefaultBookgroup(value);
const navItem = computed(() => {
  const groups = new Set<string>([
    ...DEFAULT_BOOKGROUPS,
    ...settings.bookShelf.customBookgroups,
    ...bookgroups.value
  ]);
  settings.bookShelf.deletedBookgroups.forEach(item => groups.delete(item));
  groups.delete(BOOKGROUP_DEFAULT);
  return [BOOKGROUP_ALL, BOOKGROUP_DEFAULT, ...Array.from(groups)];
});
const moveBookgroups = computed(() => navItem.value.filter(item => !isAllBookgroup(item)));
const totalPage = computed(() => Math.ceil(total.value / bookshelf.pageSize));
const currentBookgroupQuery = computed(() => isAllBookgroup(selected.value) ? '' : selected.value);
const loadBookshelfPage = (page = currentPage.value) => {
  return bookshelf.loadPage(currentBookgroupQuery.value, searchKey.value, page);
}
const currentPageChange = (page: number) => {
  loadBookshelfPage(page);
}
const refresh = () => {
  loadBookshelfPage(currentPage.value);
}

const { onRefresh } = useWindowStore();
onRefresh(PagePath.BOOKSHELF, refresh);

onMounted(() => {
  bookshelf.loadBookgroups(DEFAULT_BOOKGROUPS);
  loadBookshelfPage(1);
});

watch([selected, searchKey], () => {
  loadBookshelfPage(1);
});

router.afterEach((to, from, fail) => {
  if (fail) return;
  /**
   * 解决在详情页点击已读章节标题跳转至已读章节阅读页后点击回退按钮无法正常回退的问题
   */
  if (to.path === PagePath.DETAIL && from.path === PagePath.READ) {
    to.query.to = 'normal';
  }
});

/**
 * @param to
 * normal: 正常跳转
 * already: 跳转至上次已读章节页
 * latest: 跳转至最新章节页
 */
const goDetailPage = (item: Book, to?: 'normal' | 'already' | 'latest') => {
  const hasReadProgress = item.readIndex >= 0 && !!item.readChapterTitle;
  const target = to || (hasReadProgress ? 'already' : 'normal');
  router.push({
    path: PagePath.DETAIL,
    query: {
      pid: item.pid,
      detailUrl: item.detailPageUrl,
      to: target,
      readIndex: target === 'already' && hasReadProgress ? item.readIndex : void 0
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
const navItemClick = (key: string) => {
  selected.value = key;
}

const normalizeBookgroup = (value: string) => value.trim() || BOOKGROUP_DEFAULT;
const validateBookgroup = (value: string) => {
  const bookgroup = normalizeBookgroup(value);
  if (isAllBookgroup(bookgroup)) {
    useMessage().warning('全部是总览分类，不能作为书籍分类');
    return '';
  }
  return bookgroup;
}

const addBookgroup = () => {
  ElMessageBox.prompt('请输入分类名称', '新增分类', {
    inputValue: '',
    inputPlaceholder: '例如：都市',
    confirmButtonText: '确定',
    cancelButtonText: '取消'
  }).then(({ value }) => {
    const bookgroup = validateBookgroup(value);
    if (!bookgroup) {
      return;
    }
    settings.bookShelf.deletedBookgroups = settings.bookShelf.deletedBookgroups.filter(item => item !== bookgroup);
    if (!settings.bookShelf.customBookgroups.includes(bookgroup) && !navItem.value.includes(bookgroup)) {
      settings.bookShelf.customBookgroups.push(bookgroup);
    }
    selected.value = bookgroup;
    targetBookgroup.value = bookgroup;
  }).catch(() => void 0);
}

const renameBookgroup = () => {
  if (isSystemBookgroup(selected.value)) {
    useMessage().warning('系统分类不能修改');
    return;
  }
  ElMessageBox.prompt('请输入新的分类名称', '修改分类', {
    inputValue: selected.value,
    inputPlaceholder: '例如：仙侠',
    confirmButtonText: '确定',
    cancelButtonText: '取消'
  }).then(async ({ value }) => {
    const oldName = selected.value;
    const bookgroup = validateBookgroup(value);
    if (!bookgroup) {
      return;
    }
    if (oldName === bookgroup) {
      return;
    }
    await bookshelf.renameBookgroup(oldName, bookgroup);
    await bookshelf.loadBookgroups(DEFAULT_BOOKGROUPS);
    settings.bookShelf.customBookgroups = settings.bookShelf.customBookgroups.filter(item => item !== oldName);
    settings.bookShelf.deletedBookgroups = settings.bookShelf.deletedBookgroups.filter(item => item !== bookgroup);
    if (!settings.bookShelf.customBookgroups.includes(bookgroup) && !navItem.value.includes(bookgroup)) {
      settings.bookShelf.customBookgroups.push(bookgroup);
    }
    selected.value = bookgroup;
    targetBookgroup.value = bookgroup;
  }).catch(() => void 0);
}

const deleteBookgroup = () => {
  if (isSystemBookgroup(selected.value)) {
    useMessage().warning('系统分类不能删除');
    return;
  }
  const bookgroup = selected.value;
  ElMessageBox.confirm(`是否删除分类「${bookgroup}」？该分类下的书籍会移动到「${BOOKGROUP_DEFAULT}」。`, '删除分类', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    await bookshelf.deleteBookgroup(bookgroup, BOOKGROUP_DEFAULT);
    settings.bookShelf.customBookgroups = settings.bookShelf.customBookgroups.filter(item => item !== bookgroup);
    if (!settings.bookShelf.deletedBookgroups.includes(bookgroup)) {
      settings.bookShelf.deletedBookgroups.push(bookgroup);
    }
    selected.value = BOOKGROUP_DEFAULT;
    targetBookgroup.value = BOOKGROUP_DEFAULT;
    await bookshelf.loadBookgroups(DEFAULT_BOOKGROUPS);
    await loadBookshelfPage(1);
    useMessage().success(`已删除分类 ${bookgroup}`);
  }).catch(() => void 0);
}

const moveCheckedToBookgroup = async () => {
  if (!targetBookgroup.value) {
    useMessage().warning('请选择目标分类');
    return;
  }
  if (checkedCities.value.length < 1) {
    useMessage().warning('请先选择书籍');
    return;
  }
  await Promise.all(checkedCities.value.map(id => bookshelf.updateBookgroup(String(id), targetBookgroup.value)));
  await bookshelf.loadBookgroups(DEFAULT_BOOKGROUPS);
  await loadBookshelfPage(currentPage.value);
  checkedCities.value = [];
  useMessage().success(`已移动到 ${targetBookgroup.value}`);
}

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
  <div class="container">
    <nav id="bookstore-nav">
      <main class="rc-scrollbar">
        <ul>
          <li :class="[
            'rc-button',
            item === selected ? 'nav-item-selected' : ''
          ]" v-for="item of navItem" :key="item" @click="navItemClick(item)">
            <Text ellipsis :title="item">{{ item }}</Text>
          </li>
        </ul>
      </main>
      <footer>
        <ElButton size="small" @click="addBookgroup">新增</ElButton>
        <ElButton size="small" :disabled="isSystemBookgroup(selected)" @click="renameBookgroup">修改</ElButton>
        <ElButton size="small" type="danger" :disabled="isSystemBookgroup(selected)" @click="deleteBookgroup">删除</ElButton>
      </footer>
    </nav>
    <FileDrag class="bookshelf-content" tip="导入书籍" @change="fileDragChange" :disable="importBooksWindow?.isShow()">
    <div class="bookshelf-container">
      <div class="no-result" v-if="total < 1">
        <ElEmpty description="暂无书本">
          <ElButton type="primary" size="small" :icon="IconBack" @click="router.back()">返回</ElButton>
          <ElButton type="warning" size="small" :icon="IconImport" @click="openBookFile">导入</ElButton>
        </ElEmpty>
      </div>
      <div class="result" v-else>
        <div :class="['toolbar', options.enableBlur ? 'app-blur' : '']">
          <div class="left">
            <ElCheckbox v-memo="[checkAll, isIndeterminate]" v-model="checkAll" label="全选"
              :indeterminate="isIndeterminate" @change="handleCheckAllChange" />
            <ElPagination v-memo="[totalPage, currentPage]" layout="prev, pager, next" size="small" hide-on-single-page
              :page-count="totalPage" :current-page="currentPage" @current-change="currentPageChange" />
          </div>
          <div class="right">
            <ElButton type="warning" size="small" :icon="IconImport" @click="openBookFile">导入</ElButton>
            <ElSelect class="bookgroup-select" v-model="targetBookgroup" size="small" placeholder="目标分类">
              <ElOption v-for="item of moveBookgroups" :key="item" :label="item" :value="item" />
            </ElSelect>
            <ElButton size="small" @click="moveCheckedToBookgroup">移到分类</ElButton>
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
                    :loading="item.isRunningExport" title="下载" @click="e => exportTxt(e, item)" /> 
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
    </FileDrag>
  </div>
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
</style>
<style scoped lang="scss">
.container {
  display: flex;
  flex-direction: row;
  height: calc(100% - 1rem);

  #bookstore-nav {
    display: flex;
    flex-direction: column;
    margin: 1rem;
    padding: 1rem 0 1rem 1rem;
    width: 19rem;
    background-color: var(--rc-window-box-bgcolor);
    border-radius: 10px;
    box-shadow: var(--rc-shadow-light);
    overflow: hidden;

    main {
      padding-right: 1rem;
      width: calc(100% - 1rem);
      height: calc(100% - 3.5rem);

      ul li {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: start;
        margin-bottom: .5rem;
        padding: .5rem 1rem;
        border-radius: .7rem;
        font-size: 1.4rem;

        &:active {
          transform: scale(0.98);
        }

        &:last-child {
          margin-bottom: 0;
        }

        &:is(.nav-item-selected) {
          background-color: var(--rc-button-hover-bgcolor);
        }
      }
    }

    footer {
      display: flex;
      gap: .5rem;
      padding-right: 1rem;
      height: 3rem;

      .el-button {
        flex: 1;
      }
    }
  }

  .bookshelf-content {
    flex: 1;
    min-width: 0;
  }
}

.bookshelf-container {
  .app-blur {
    background-color: var(--rc-window-box-blur-bgcolor) !important;
  }

  .result {
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

      .bookgroup-select {
        margin-left: 10px;
        width: 110px;
      }

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
    // justify-content: center;
    margin-left: 15px;
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

        width: 270px;
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
