import { getListMusics, removeListMusics } from '@renderer/store/list/action'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'
import { showToast } from '@renderer/utils/showToast'

/**
 * 歌曲去重：按「歌名 + 歌手」两个维度比较，都相同的视为同一首歌，
 * 仅保留列表中首次出现的一首，其余移除。
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

    const seen = new Set()
    const removeIds = []
    for (const musicInfo of list) {
      const key = `${(musicInfo.name ?? '').toLowerCase().trim()}\u0000${(musicInfo.singer ?? '').toLowerCase().trim()}`
      if (seen.has(key)) {
        removeIds.push(musicInfo.id)
      } else {
        seen.add(key)
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
