<template>
  <div :class="$style.btns">
    <span
      v-if="showDownloaded"
      :class="[$style.downloaded, { [$style.downloadedHidden]: !downloaded }]"
      :aria-hidden="!downloaded"
      :aria-label="$t('list__downloaded')"
      @mouseenter="handleDownloadedEnter"
      @mouseleave="handleDownloadedLeave"
    >
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 24 24" space="preserve">
        <use xlink:href="#icon-check" />
      </svg>
    </span>
    <button v-if="playBtn" type="button" :aria-label="$t('list__play')" @contextmenu.capture.stop @click.stop="handleClick('play')">
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 287.386 287.386" space="preserve">
        <use xlink:href="#icon-testPlay" />
      </svg>
    </button>
    <button v-if="listAddBtn" type="button" :aria-label="$t('list__add_to')" @contextmenu.capture.stop @click.stop="handleClick('listAdd')">
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 42 42" space="preserve">
        <use xlink:href="#icon-addTo" />
      </svg>
    </button>
    <button
      v-if="likeBtn"
      type="button"
      :aria-label="$t('setting__hot_key_player_music_love')"
      :class="[$style.like, { [$style.liked]: liked }]"
      @contextmenu.capture.stop
      @click.stop="handleClick('like')"
    >
      {{ liked ? '♥' : '♡' }}
    </button>
    <button v-if="downloadBtn" type="button" :aria-label="$t('list__download')" @contextmenu.capture.stop @click.stop="handleClick('download')">
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 475.078 475.077" space="preserve">
        <use xlink:href="#icon-download" />
      </svg>
    </button>
    <button v-if="startBtn" type="button" :aria-label="$t('list__start')" @contextmenu.capture.stop @click.stop="handleClick('start')">
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
        <use xlink:href="#icon-play" />
      </svg>
    </button>
    <button v-if="pauseBtn" type="button" :aria-label="$t('list__pause')" @contextmenu.capture.stop @click.stop="handleClick('pause')">
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
        <use xlink:href="#icon-pause" />
      </svg>
    </button>
    <button v-if="fileBtn" type="button" :aria-label="$t('list__file')" @contextmenu.capture.stop @click.stop="handleClick('file')">
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="-61 0 512 512" space="preserve">
        <use xlink:href="#icon-musicFile" />
      </svg>
    </button>
    <button v-if="searchBtn" type="button" :aria-label="$t('list__search')" @contextmenu.capture.stop @click.stop="handleClick('search')">
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 30.239 30.239" space="preserve">
        <use xlink:href="#icon-search" />
      </svg>
    </button>
    <button v-if="removeBtn" type="button" :aria-label="$t('list__remove')" @click.stop="handleClick('remove')">
      <svg v-once version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 212.982 212.982" space="preserve">
        <use xlink:href="#icon-delete" />
      </svg>
    </button>
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
import { getDownloadedFileInfo, indexVersion } from '@renderer/store/download/downloadedIndex'

export default {
  props: {
    index: {
      type: Number,
      required: true,
    },
    startBtn: {
      type: Boolean,
      default: false,
    },
    pauseBtn: {
      type: Boolean,
      default: false,
    },
    removeBtn: {
      type: Boolean,
      default: false,
    },
    downloadBtn: {
      type: Boolean,
      default: true,
    },
    playBtn: {
      type: Boolean,
      default: true,
    },
    listAddBtn: {
      type: Boolean,
      default: true,
    },
    likeBtn: {
      type: Boolean,
      default: false,
    },
    liked: {
      type: Boolean,
      default: false,
    },
    searchBtn: {
      type: Boolean,
      default: false,
    },
    fileBtn: {
      type: Boolean,
      default: false,
    },
    downloaded: {
      type: Boolean,
      default: false,
    },
    showDownloaded: {
      type: Boolean,
      default: false,
    },
    musicInfo: {
      type: Object,
      default: null,
    },
  },
  emits: ['btn-click'],
  data() {
    return {
      tipVisible: false,
      tipLoading: false,
      tipInfo: null,
      tipStyle: {},
      tipMusicId: null,
      tipVersion: -1,
    }
  },
  methods: {
    handleClick(action) {
      this.$emit('btn-click', { action, index: this.index })
    },
    handleDownloadedEnter(event) {
      if (!this.downloaded || !this.musicInfo) return
      const rect = event.currentTarget.getBoundingClientRect()
      const showBelow = rect.top < 100
      // 右对齐到图标右边缘，向左展开，避免超出窗口右侧
      this.tipStyle = showBelow
        ? { left: `${rect.right}px`, top: `${rect.bottom + 8}px`, transform: 'translate(-100%, 0)' }
        : { left: `${rect.right}px`, top: `${rect.top - 8}px`, transform: 'translate(-100%, -100%)' }
      this.tipVisible = true

      // 同一首歌、已有信息且索引未变更时直接复用，否则重新读取
      const version = indexVersion.value
      if (this.tipMusicId === this.musicInfo.id && this.tipInfo && this.tipVersion === version) return
      this.tipMusicId = this.musicInfo.id
      this.tipVersion = version
      this.tipInfo = null
      void this.loadTipInfo()
    },
    handleDownloadedLeave() {
      this.tipVisible = false
    },
    async loadTipInfo() {
      this.tipLoading = true
      const info = await getDownloadedFileInfo(this.musicInfo)
      this.tipLoading = false
      if (!this.tipVisible) return
      this.tipInfo = info
    },
  },
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

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

.btns {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  line-height: 0;

  .downloaded {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 16px;
    height: 16px;
    color: #52c41a;
    line-height: 0;

    svg {
      height: 14px;
    }
  }

  .downloadedHidden {
    visibility: hidden;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background-color: transparent;
    border: none;
    border-radius: @form-radius;
    margin-right: 0;
    cursor: pointer;
    padding: 4px 7px;
    min-height: 24px;
    color: var(--color-button-font);
    outline: none;
    transition: background-color 0.2s ease;
    line-height: 0;
    &:last-child {
      margin-right: 0;
    }

    svg {
      height: 16px;
    }

    &.like {
      min-width: 32px;
      color: var(--color-font-label);
      font-size: 22px;
      line-height: 1;

      &:hover,
      &.liked {
        color: #e94b5f;
      }
    }

    &:hover {
      background-color: var(--color-button-background-hover);
    }
    &:active {
      background-color: var(--color-button-background-active);
    }
  }
}

</style>
