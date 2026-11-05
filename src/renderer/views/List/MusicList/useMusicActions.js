import { useRouter } from '@common/utils/vueRouter'
import musicSdk from '@renderer/utils/musicSdk'
import { openUrl, clipboardWriteText } from '@common/utils/electron'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'
import { removeListMusics } from '@renderer/store/list/action'
import { appSetting } from '@renderer/store/setting'
import { formatMusicName, toOldMusicInfo } from '@renderer/utils/index'
import { addDislikeInfo, hasDislike } from '@renderer/core/dislikeList'
import { playNext } from '@renderer/core/player'
import { playMusicInfo } from '@renderer/store/player/state'
import { isMusicDownloaded, refreshDownloadedIndex } from '@renderer/store/download/downloadedIndex'
import { showToast } from '@renderer/utils/showToast'


export default ({ props, list, selectedList, removeAllSelect }) => {
  const router = useRouter()
  const t = useI18n()

  const handleSearch = index => {
    const info = list.value[index]
    router.push({
      path: '/search',
      query: {
        text: `${info.name} ${info.singer}`,
      },
    })
  }

  const handleOpenMusicDetail = index => {
    const minfo = list.value[index]
    const url = musicSdk[minfo.source]?.getMusicDetailPageUrl(toOldMusicInfo(minfo))
    if (!url) return
    openUrl(url)
  }

  const handleCopyName = index => {
    const minfo = list.value[index]
    clipboardWriteText(formatMusicName(appSetting['download.fileName'], minfo.name, minfo.singer))
  }

  const handleDislikeMusic = async(index) => {
    const minfo = list.value[index]
    const confirm = await dialog.confirm({
      message: minfo.singer ? t('lists__dislike_music_singer_tip', { name: minfo.name, singer: minfo.singer }) : t('lists__dislike_music_tip', { name: minfo.name }),
      cancelButtonText: t('cancel_button_text_2'),
      confirmButtonText: t('confirm_button_text'),
    })
    if (!confirm) return
    await addDislikeInfo([{ name: minfo.name, singer: minfo.singer }])
    if (hasDislike(playMusicInfo.musicInfo)) {
      playNext(true)
    }
  }

  const handleRemoveMusic = async(index, single) => {
    if (selectedList.value.length && !single) {
      const confirm = await (selectedList.value.length > 1
        ? dialog.confirm({
          message: t('lists__remove_music_tip', { len: selectedList.value.length }),
          confirmButtonText: t('lists__remove_tip_button'),
        })
        : Promise.resolve(true)
      )
      if (!confirm) return
      removeListMusics({ listId: props.listId, ids: selectedList.value.map(m => m.id) })
      removeAllSelect()
    } else {
      removeListMusics({ listId: props.listId, ids: [list.value[index].id] })
    }
  }

  /**
   * 删除歌单中本地已存在的歌曲（仅从列表移除，不删除本地文件）
   */
  const handleRemoveDownloaded = async() => {
    // 先刷新索引，避免刚进入页面时索引为空导致全部判为未下载
    await refreshDownloadedIndex()
    const ids = list.value.filter(item => isMusicDownloaded(item)).map(item => item.id)
    if (!ids.length) {
      showToast(t('lists__remove_downloaded_empty'))
      return
    }
    const confirm = await dialog.confirm({
      message: t('lists__remove_downloaded_tip', { len: ids.length }),
      confirmButtonText: t('lists__remove_tip_button'),
    })
    if (!confirm) return
    removeListMusics({ listId: props.listId, ids })
    removeAllSelect()
  }

  return {
    handleSearch,
    handleOpenMusicDetail,
    handleCopyName,
    handleDislikeMusic,
    handleRemoveMusic,
    handleRemoveDownloaded,
  }
}
