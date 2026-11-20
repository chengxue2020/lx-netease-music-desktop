import { getListMusics, removeListMusics } from '@renderer/store/list/action'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'
import { showToast } from '@renderer/utils/showToast'

/**
 * 把时长文本（如 03:55）解析为秒数，空时长视为 0。
 */
const getDurationSeconds = (interval) => {
  if (!interval) return 0
  const parts = interval.split(':')
  let seconds = 0
  let unit = 1
  while (parts.length) {
    seconds += (parseInt(parts.pop()) || 0) * unit
    unit *= 60
  }
  return seconds
}

/**
 * 歌曲去重：按「歌名 + 歌手」两个维度比较，都相同的视为同一首歌，
 * 每组仅保留时长最长的一首；若整组时长都为空（视为 0 秒），则保留首次出现的一首。
 */
export default () => {
  const t = useI18n()

  const handleDedupe = async(listInfo) => {
    if (!listInfo) return
    const list = await getListMusics(listInfo.id)
    if (!list?.length) {
      showToast(t('lists__dedupe_empty'))
      return
    }

    // key -> { id, duration }：每组当前保留的歌曲及其时长（秒）
    const keepMap = new Map()
    const removeIds = []
    for (const musicInfo of list) {
      const key = `${(musicInfo.name ?? '').toLowerCase().trim()}\u0000${(musicInfo.singer ?? '').toLowerCase().trim()}`
      const duration = getDurationSeconds(musicInfo.interval)
      const kept = keepMap.get(key)
      if (!kept) {
        // 首次出现，先作为保留项
        keepMap.set(key, { id: musicInfo.id, duration })
      } else if (duration > kept.duration) {
        // 当前歌曲更长：改保留当前这首，把之前保留的移入删除列表
        removeIds.push(kept.id)
        keepMap.set(key, { id: musicInfo.id, duration })
      } else {
        // 当前更短或相等（含整组都无时长的情况）：删除当前这首
        removeIds.push(musicInfo.id)
      }
    }

    if (!removeIds.length) {
      showToast(t('lists__dedupe_empty'))
      return
    }

    const confirm = await dialog.confirm({
      message: t('lists__dedupe_tip', { len: removeIds.length }),
      confirmButtonText: t('lists__remove_tip_button'),
    })
    if (!confirm) return

    await removeListMusics({ listId: listInfo.id, ids: removeIds })
    showToast(t('lists__dedupe_done', { len: removeIds.length }))
  }

  return {
    handleDedupe,
  }
}
