import { ref, watch } from '@common/utils/vueTools'
import { overwriteListMusics } from '@renderer/store/list/action'

/**
 * 每个歌单的"添加顺序"快照：按添加时间先后记录的歌曲 id 顺序。
 * MusicInfo 没有独立的添加时间字段，列表原始数组顺序即添加顺序；
 * 表头排序会覆盖列表顺序，所以用快照保留最初的添加顺序作为"添加时间"排序基准。
 */
const addOrderSnapshots = new Map()

const getIntervalSeconds = (interval) => {
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

export default ({ props, list }) => {
  // 当前排序字段与方向：field 为 null 表示保持列表原顺序
  const sortField = ref(null)
  const sortOrder = ref('asc')

  // 同步添加顺序快照：保留已有 id 的相对顺序，新歌追加到末尾，已删除的移除
  const syncAddOrder = (musicInfos) => {
    const listId = props.listId
    const currentIds = musicInfos.map(m => m.id)
    const snapshot = addOrderSnapshots.get(listId)
    if (!snapshot) {
      addOrderSnapshots.set(listId, [...currentIds])
      return
    }
    const currentSet = new Set(currentIds)
    const snapshotSet = new Set(snapshot)
    const kept = snapshot.filter(id => currentSet.has(id))
    for (const id of currentIds) {
      if (!snapshotSet.has(id)) kept.push(id)
    }
    addOrderSnapshots.set(listId, kept)
  }

  watch(list, (musicInfos) => {
    if (musicInfos?.length) syncAddOrder(musicInfos)
  })

  const handleSort = (field) => {
    if (!list.value?.length) return

    // 同一字段再次点击切换升降序；切换到新字段默认升序
    if (sortField.value === field) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortField.value = field
      sortOrder.value = 'asc'
    }

    syncAddOrder(list.value)
    const addOrder = addOrderSnapshots.get(props.listId) ?? []
    const addOrderIndex = new Map(addOrder.map((id, i) => [id, i]))
    const locale = window.i18n.locale
    const isAsc = sortOrder.value === 'asc'

    const sorted = [...list.value].sort((a, b) => {
      let result = 0
      switch (field) {
        case 'interval':
          result = getIntervalSeconds(a.interval) - getIntervalSeconds(b.interval)
          break
        case 'addTime':
          result = (addOrderIndex.get(a.id) ?? 0) - (addOrderIndex.get(b.id) ?? 0)
          break
        case 'name':
        case 'singer':
        default:
          result = (a[field] ?? '').localeCompare(b[field] ?? '', locale)
          break
      }
      return isAsc ? result : -result
    })

    // 覆盖列表顺序后，myListUpdate 会刷新列表并让 updatePlayIndex() 按 id 重定位，
    // 正在播放的歌曲不中断、高亮自动同步。
    void overwriteListMusics({ listId: props.listId, musicInfos: sorted })
  }

  return {
    sortField,
    sortOrder,
    handleSort,
  }
}
