<template>
  <div :class="$style.controlBtn">
    <!-- <common-volume-bar /> -->
    <button :class="$style.titleBtn" :aria-label="$t('player__add_music_to')" @click="addMusicTo">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="90%" viewBox="0 0 512 512" space="preserve">
        <use xlink:href="#icon-add-2" />
      </svg>
    </button>
    <button :class="$style.titleBtn" :aria-label="toggleDesktopLyricBtnTitle" @click="toggleDesktopLyric" @contextmenu="toggleLockDesktopLyric">
      <svg v-show="appSetting['desktopLyric.enable']" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 512 512" space="preserve">
        <use xlink:href="#icon-desktop-lyric-on" />
      </svg>
      <svg v-show="!appSetting['desktopLyric.enable']" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 512 512" space="preserve">
        <use xlink:href="#icon-desktop-lyric-off" />
      </svg>
    </button>
    <common-volume-btn />
    <common-toggle-play-mode-btn />
    <!-- 当前播放歌曲的下载状态：已存在显示对钩（悬停看文件信息、右键下载），否则显示下载图标 -->
    <template v-if="playMusicInfo.musicInfo">
      <span
        v-if="downloaded"
        :class="$style.downloaded"
        :aria-label="$t('list__downloaded')"
        @mouseenter="handleDownloadedEnter"
        @mouseleave="handleDownloadedLeave"
        @contextmenu.prevent="handleDownloadedContextMenu"
      >
        <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="100%" viewBox="0 0 24 24" space="preserve">
          <use xlink:href="#icon-check" />
        </svg>
      </span>
      <button
        v-else
        type="button"
        :class="$style.statusBtn"
        :aria-label="$t('list__download')"
        @click="handleDownloadClick"
      >
        <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="100%" viewBox="0 0 475.078 475.077" space="preserve">
          <use xlink:href="#icon-download" />
        </svg>
      </button>
    </template>
    <common-list-add-modal v-model:show="isShowAddMusicTo" :music-info="playMusicInfo.musicInfo" />
    <common-download-modal v-model:show="isShowDownload" :music-info="playMusicInfo.musicInfo" :list-id="playMusicInfo.listId || ''" />
    <base-menu v-model="isShowDownloadMenu" :menus="downloadMenus" :xy="menuLocation" item-name="name" @menu-click="handleDownloadMenuClick" />
  </div>
  <teleport to="#root">
    <div v-if="tipVisible" :class="$style.tip" :style="tipStyle">
      <div :class="$style.tipNotice">{{ $t('list__downloaded_tip_notice') }}</div>
      <div v-if="tipLoading" :class="$style.tipLoading">{{ $t('list__downloaded_loading') }}</div>
      <template v-else-if="tipInfo">
        <div :class="$style.tipTitle">{{ tipInfo.fileName }}</div>
        <div :class="$style.tipRow">{{ $t('list__downloaded_file_size') }}：{{ tipInfo.sizeText }}</div>
        <div :class="$style.tipRow">{{ $t('list__downloaded_bitrate') }}：{{ tipInfo.bitrate }}</div>
        <div :class="$style.tipRow">{{ $t('list__downloaded_duration') }}：{{ tipInfo.durationText }}</div>
      </template>
    </div>
  </teleport>
</template>

<script>
import { ref, computed, watch, onMounted } from '@common/utils/vueTools'
import useToggleDesktopLyric from '@renderer/utils/compositions/useToggleDesktopLyric'
import { musicInfo, playMusicInfo } from '@renderer/store/player/state'
import { appSetting } from '@renderer/store/setting'
import { useI18n } from '@renderer/plugins/i18n'
import { isMusicDownloaded, getDownloadedFileInfo, refreshDownloadedIndexThrottle, indexVersion } from '@renderer/store/download/downloadedIndex'

export default {
  setup() {
    const t = useI18n()
    const isShowAddMusicTo = ref(false)
    const isShowDownload = ref(false)
    const {
      toggleDesktopLyricBtnTitle,
      toggleDesktopLyric,
      toggleLockDesktopLyric,
    } = useToggleDesktopLyric()
    const addMusicTo = () => {
      if (!musicInfo.id) return
      isShowAddMusicTo.value = true
    }

    // 当前播放歌曲是否已下载（索引/版本变化后自动重算）
    const downloaded = computed(() => {
      const info = playMusicInfo.musicInfo
      if (!info) return false
      void indexVersion.value
      return isMusicDownloaded(info)
    })

    // 已下载对钩的悬停文件信息（与歌单对钩一致：teleport + 按位置定位 + 按版本缓存）
    const tipVisible = ref(false)
    const tipLoading = ref(false)
    const tipInfo = ref(null)
    const tipStyle = ref({})
    let tipMusicId = null
    let tipVersion = -1

    const handleDownloadedEnter = (event) => {
      const info = playMusicInfo.musicInfo
      if (!downloaded.value || !info) return
      const rect = event.currentTarget.getBoundingClientRect()
      const showBelow = rect.top < 100
      tipStyle.value = showBelow
        ? { left: `${rect.right}px`, top: `${rect.bottom + 8}px`, transform: 'translate(-100%, 0)' }
        : { left: `${rect.right}px`, top: `${rect.top - 8}px`, transform: 'translate(-100%, -100%)' }
      tipVisible.value = true

      const version = indexVersion.value
      if (tipMusicId === info.id && tipInfo.value && tipVersion === version) return
      tipMusicId = info.id
      tipVersion = version
      tipInfo.value = null
      void loadTipInfo(info)
    }
    const handleDownloadedLeave = () => {
      tipVisible.value = false
    }
    const loadTipInfo = async(info) => {
      tipLoading.value = true
      const result = await getDownloadedFileInfo(info)
      tipLoading.value = false
      if (!tipVisible.value) return
      tipInfo.value = result
    }

    // 切歌时隐藏提示，避免使用上一首的信息
    watch(() => playMusicInfo.musicInfo?.id, () => {
      tipVisible.value = false
      tipMusicId = null
      tipInfo.value = null
    })

    // 下载：未下载时左键点击直接弹音质选择；已下载时右键菜单里的“下载”弹同一音质选择
    const handleDownloadClick = () => {
      if (!playMusicInfo.musicInfo) return
      isShowDownload.value = true
    }
    const isShowDownloadMenu = ref(false)
    const menuLocation = ref({ x: 0, y: 0 })
    const downloadMenus = computed(() => [{ name: t('list__download'), action: 'download' }])
    const handleDownloadedContextMenu = (event) => {
      menuLocation.value = { x: event.clientX, y: event.clientY }
      isShowDownloadMenu.value = true
    }
    const handleDownloadMenuClick = (item) => {
      if (!item || item.action != 'download') return
      isShowDownloadMenu.value = false
      handleDownloadClick()
    }

    // 进入软件后可能未打开过歌单，索引尚未建立时先刷新一次（节流）
    onMounted(() => {
      refreshDownloadedIndexThrottle()
    })

    return {
      appSetting,
      isShowAddMusicTo,
      isShowDownload,
      toggleDesktopLyricBtnTitle,
      toggleDesktopLyric,
      toggleLockDesktopLyric,
      addMusicTo,
      playMusicInfo,
      downloaded,
      tipVisible,
      tipLoading,
      tipInfo,
      tipStyle,
      handleDownloadedEnter,
      handleDownloadedLeave,
      handleDownloadClick,
      isShowDownloadMenu,
      menuLocation,
      downloadMenus,
      handleDownloadedContextMenu,
      handleDownloadMenuClick,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.controlBtn {
  padding-left: 20px;
  padding-right: 10px;
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  gap: 10px;

  button {
    color: var(--color-button-font);
  }
}

.titleBtn {
  flex: none;
  height: 100%;
  width: 24px;
  transition: @transition-fast;
  transition-property: color, opacity;
  // color: var(--color-button-font);
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;
  background-color: transparent;
  border: none;
  width: 24px;
  padding: 0;

  opacity: .6;
  cursor: pointer;

  svg {
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.2));
  }
  &:hover {
    opacity: 1;
  }
  &:active {
    opacity: 1;
  }
}

// 与顺序播放按钮（common-toggle-play-mode-btn）属性一致：
// 容器 flex:none / height:100%，图标 opacity .6 → hover .9 → active 1
.downloaded,
.statusBtn {
  position: relative;
  flex: none;
  height: 100%;
  width: 24px;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;
  background-color: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: color @transition-normal;
  svg {
    width: 80%;
    opacity: .6;
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.2));
    transition: opacity @transition-fast;
  }
  &:hover svg {
    opacity: .9;
  }
  &:active svg {
    opacity: 1;
  }
}

.downloaded {
  color: #52c41a;
}

.tip {
  position: fixed;
  z-index: 90;
  min-width: 180px;
  max-width: 360px;
  padding: 8px 10px;
  border-radius: 4px;
  background-color: var(--color-content-background);
  box-shadow: 0 2px 10px rgba(0, 0, 0, .22);
  color: var(--color-font);
  font-size: 12px;
  line-height: 1.7;
  pointer-events: none;
  word-break: break-all;
}

.tipNotice {
  color: #e94b5f;
  font-size: 11px;
  line-height: 1.5;
  margin-bottom: 4px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--color-primary-light-100-alpha-100);
}

.tipTitle {
  font-weight: 600;
  margin-bottom: 2px;
}

.tipRow {
  color: var(--color-font-label);
}

.tipLoading {
  color: var(--color-font-label);
}


</style>
