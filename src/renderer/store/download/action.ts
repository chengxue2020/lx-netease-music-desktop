import {
  downloadTasksGet,
  // downloadListClear,
  downloadTasksCreate,
  downloadTasksRemove,
  downloadTasksUpdate,
  onDownloadListOverwrite,
} from '@renderer/utils/ipc'
import {
  downloadList,
} from './state'
import { markRaw, toRaw } from '@common/utils/vueTools'
import { getMusicUrl, getPicUrl, getLyricInfo, isNeteaseCookieMusicUrl } from '@renderer/core/music/online'
import { appSetting } from '../setting'
import { qualityList } from '..'
import { proxyCallback } from '@renderer/worker/utils'
import { arrPush, arrUnshift, joinPath, basename, extname, readDir, checkPath, getFileStats, removeFile, formatDurationText } from '@renderer/utils'
import { DOWNLOAD_STATUS } from '@common/constants'
import { proxy } from '../index'
import { buildSavePath } from './utils'
import { showToast } from '@renderer/utils/showToast'
import { dialog } from '@renderer/plugins/Dialog'
import { refreshDownloadedIndexThrottle, invalidateDownloadedFileInfo } from './downloadedIndex'

const waitingUpdateTasks = new Map<string, LX.Download.ListItem>()
let timer: NodeJS.Timeout | null = null
const throttleUpdateTask = (tasks: LX.Download.ListItem[]) => {
  for (const task of tasks) waitingUpdateTasks.set(task.id, toRaw(task))
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    void downloadTasksUpdate(Array.from(waitingUpdateTasks.values()))
    waitingUpdateTasks.clear()
  }, 100)
}

const runingTask = new Map<string, LX.Download.ListItem>()

type DownloadQuality = LX.Music.MusicQualityType & { hash?: string }
type DownloadQualityMap = Record<string, { size: string | null, hash?: string }>

const cloneQualitys = (qualitys?: DownloadQuality[]) => {
  if (!Array.isArray(qualitys)) return []
  return qualitys.map(quality => {
    const clonedQuality: DownloadQuality = {
      type: quality.type,
      size: quality.size ?? null,
    }
    if (quality.hash != null) clonedQuality.hash = quality.hash
    return clonedQuality
  })
}

const cloneQualityMap = (qualityMap?: DownloadQualityMap): DownloadQualityMap => {
  const rawQualityMap: DownloadQualityMap = toRaw(qualityMap ?? {})
  return Object.entries(rawQualityMap).reduce<DownloadQualityMap>((target, [type, quality]) => {
    if (!quality) return target
    const clonedQuality: DownloadQualityMap[string] = {
      size: quality.size ?? null,
    }
    if (quality.hash != null) clonedQuality.hash = quality.hash
    target[type] = clonedQuality
    return target
  }, {})
}

const cloneArtists = (artists?: Array<{ id: string | number, name: string }>) => {
  if (!Array.isArray(artists)) return undefined
  return artists.map(artist => ({
    id: artist.id,
    name: artist.name,
  })).filter(artist => artist.id != null && artist.name)
}

const cloneMusicInfoForDownload = (musicInfo: LX.Music.MusicInfoOnline, depth = 0): LX.Music.MusicInfoOnline => {
  const rawMusicInfo = toRaw(musicInfo)
  const rawMeta: Record<string, any> = toRaw(rawMusicInfo.meta)
  const meta: Record<string, any> = {
    songId: rawMeta.songId,
    albumName: rawMeta.albumName ?? '',
    picUrl: rawMeta.picUrl ?? null,
    qualitys: cloneQualitys(rawMeta.qualitys),
    _qualitys: cloneQualityMap(rawMeta._qualitys),
    albumId: rawMeta.albumId,
  }

  if (rawMeta.fee != null) meta.fee = rawMeta.fee
  if (rawMeta.originCoverType != null) meta.originCoverType = rawMeta.originCoverType
  if (rawMeta.mv != null) meta.mv = rawMeta.mv
  const artists = cloneArtists(rawMeta.artists)
  if (artists?.length) meta.artists = artists
  if (rawMeta.toggleMusicInfo && depth < 2) meta.toggleMusicInfo = cloneMusicInfoForDownload(rawMeta.toggleMusicInfo, depth + 1)

  switch (rawMusicInfo.source) {
    case 'kg':
      meta.hash = rawMeta.hash
      break
    case 'tx':
      meta.strMediaMid = rawMeta.strMediaMid
      meta.id = rawMeta.id
      meta.albumMid = rawMeta.albumMid
      break
    case 'mg':
      meta.copyrightId = rawMeta.copyrightId
      meta.lrcUrl = rawMeta.lrcUrl
      meta.mrcUrl = rawMeta.mrcUrl
      meta.trcUrl = rawMeta.trcUrl
      break
    default:
      break
  }

  const clonedMusicInfo = {
    id: rawMusicInfo.id,
    alias: rawMusicInfo.alias ?? null,
    name: rawMusicInfo.name,
    singer: rawMusicInfo.singer,
    source: rawMusicInfo.source,
    interval: rawMusicInfo.interval,
    meta,
  }
  return clonedMusicInfo as LX.Music.MusicInfoOnline
}

const normalizeDownloadInfo = (downloadInfo: LX.Download.ListItem) => {
  markRaw(downloadInfo.metadata)
  if (downloadInfo.isRemoteSynced) {
    downloadInfo.status = DOWNLOAD_STATUS.PAUSE
    downloadInfo.statusText = ''
    downloadInfo.progress = 0
    downloadInfo.speed = ''
    return downloadInfo
  }
  switch (downloadInfo.status) {
    case DOWNLOAD_STATUS.RUN:
    case DOWNLOAD_STATUS.WAITING:
      downloadInfo.status = DOWNLOAD_STATUS.PAUSE
      downloadInfo.statusText = window.i18n.t('download___status_paused')
    default:
      break
  }
  return downloadInfo
}

export const getDownloadList = async(): Promise<LX.Download.ListItem[]> => {
  if (!downloadList.length) {
    const list = await downloadTasksGet()
    for (const downloadInfo of list) normalizeDownloadInfo(downloadInfo)
    arrPush(downloadList, list)
  }
  return downloadList
}

export const registerDownloadListOverwrite = () => {
  onDownloadListOverwrite(({ params: list }) => {
    const existingTaskMap = new Map(downloadList.map(task => [task.id, task]))
    const nextList = list.map(task => {
      const existingTask = existingTaskMap.get(task.id)
      if (existingTask && !existingTask.isRemoteSynced) return existingTask
      return normalizeDownloadInfo(task)
    })
    downloadList.splice(0, downloadList.length)
    arrPush(downloadList, nextList)
    window.app_event.downloadListUpdate()
  })
}

const addTasks = async(list: LX.Download.ListItem[]) => {
  const addMusicLocationType = appSetting['list.addMusicLocationType']

  await downloadTasksCreate(list.map(i => toRaw(i)), addMusicLocationType)

  if (addMusicLocationType === 'top') {
    arrUnshift(downloadList, list)
  } else {
    arrPush(downloadList, list)
  }
  window.app_event.downloadListUpdate()
}

const setStatusText = (downloadInfo: LX.Download.ListItem, text: string) => { // 设置状态文本
  downloadInfo.statusText = text
  throttleUpdateTask([downloadInfo])
}

const setUrl = (downloadInfo: LX.Download.ListItem, url: string) => {
  downloadInfo.metadata.url = url
  downloadInfo.metadata.isNeteaseCookieUrl = isNeteaseCookieMusicUrl(url)
  throttleUpdateTask([downloadInfo])
}

const updateFilePath = (downloadInfo: LX.Download.ListItem, filePath: string) => {
  downloadInfo.metadata.filePath = filePath
  throttleUpdateTask([downloadInfo])
}

const setProgress = (downloadInfo: LX.Download.ListItem, progress: LX.Download.ProgressInfo) => {
  downloadInfo.total = progress.total
  downloadInfo.downloaded = progress.downloaded
  downloadInfo.writeQueue = progress.writeQueue
  if (progress.progress == 100) {
    downloadInfo.speed = ''
    downloadInfo.progress = 99.99
    setStatusText(downloadInfo, window.i18n.t('download_status_write_queue', { num: progress.writeQueue }))
  } else {
    downloadInfo.speed = progress.speed
    downloadInfo.progress = progress.progress
  }
  throttleUpdateTask([downloadInfo])
}

const setStatus = (downloadInfo: LX.Download.ListItem, status: LX.Download.DownloadTaskStatus, statusText?: string) => { // 设置状态及状态文本
  if (statusText == null) {
    switch (status) {
      case DOWNLOAD_STATUS.RUN:
        statusText = window.i18n.t('download___status_running')
        break
      case DOWNLOAD_STATUS.WAITING:
        statusText = window.i18n.t('download___status_waiting')
        break
      case DOWNLOAD_STATUS.PAUSE:
        statusText = window.i18n.t('download___status_paused')
        break
      case DOWNLOAD_STATUS.ERROR:
        statusText = window.i18n.t('download___status_error')
        break
      case DOWNLOAD_STATUS.COMPLETED:
        statusText = window.i18n.t('download___status_completed')
        break
      default:
        statusText = ''
        break
    }
  }

  if (downloadInfo.statusText == statusText && downloadInfo.status == status) return

  if (status == DOWNLOAD_STATUS.COMPLETED) downloadInfo.isComplate = true
  downloadInfo.statusText = statusText
  downloadInfo.status = status
  throttleUpdateTask([downloadInfo])
}

// 修复 1.1.x版本 酷狗源歌词格式
const fixKgLyric = (lrc: string) => /\[00:\d\d:\d\d.\d+\]/.test(lrc) ? lrc.replace(/(?:\[00:(\d\d:\d\d.\d+\]))/gm, '[$1') : lrc

const getProxy = () => {
  return proxy.enable && proxy.host ? {
    host: proxy.host,
    port: parseInt(proxy.port || '80'),
  } : proxy.envProxy ? {
    host: proxy.envProxy.host,
    port: parseInt(proxy.envProxy.port || '80'),
  } : undefined
}
/**
 * 设置歌曲meta信息
 * @param downloadInfo 下载任务信息
 */
const saveMeta = (downloadInfo: LX.Download.ListItem) => {
  if (downloadInfo.metadata.quality === 'ape') return
  const isUseOtherSource = appSetting['download.isUseOtherSource']
  const tasks: [Promise<string | null>, Promise<LX.Player.LyricInfo | null>] = [
    appSetting['download.isEmbedPic']
      ? downloadInfo.metadata.musicInfo.meta.picUrl
        ? Promise.resolve(downloadInfo.metadata.musicInfo.meta.picUrl)
        : getPicUrl({ musicInfo: downloadInfo.metadata.musicInfo, isRefresh: false, allowToggleSource: isUseOtherSource }).catch(err => {
          console.log(err)
          return null
        })
      : Promise.resolve(null),
    appSetting['download.isEmbedLyric']
      ? getLyricInfo({ musicInfo: downloadInfo.metadata.musicInfo, isRefresh: false, allowToggleSource: isUseOtherSource }).catch(err => {
        console.log(err)
        return null
      })
      : Promise.resolve(null),
  ]
  void Promise.all(tasks).then(([imgUrl, lyrics]) => {
    const musicInfo = downloadInfo.metadata.musicInfo
    const title = appSetting['download.writeAlias'] && musicInfo.alias
      ? `${musicInfo.name} (${musicInfo.alias})`
      : musicInfo.name
    const info = {
      filePath: downloadInfo.metadata.filePath,
      isEmbedLyricLx: appSetting['download.isEmbedLyricLx'],
      isEmbedLyricT: appSetting['download.isEmbedLyricT'],
      isEmbedLyricR: appSetting['download.isEmbedLyricR'],
      title,
      artist: downloadInfo.metadata.musicInfo.singer?.replaceAll('、', ';'),
      album: downloadInfo.metadata.musicInfo.meta.albumName,
      APIC: imgUrl,
    }
    void window.lx.worker.download.writeMeta(info, lyrics ?? { lyric: '' }, getProxy())
  })
}

/**
 * 保存歌词文件
 * @param downloadInfo 下载任务信息
 */
const downloadLyric = (downloadInfo: LX.Download.ListItem) => {
  if (!appSetting['download.isDownloadLrc']) return
  void getLyricInfo({
    musicInfo: downloadInfo.metadata.musicInfo,
    isRefresh: false,
    allowToggleSource: appSetting['download.isUseOtherSource'],
  }).then(lrcs => {
    if (lrcs.lyric) {
      lrcs.lyric = fixKgLyric(lrcs.lyric)
      const info = {
        filePath: downloadInfo.metadata.filePath.substring(0, downloadInfo.metadata.filePath.lastIndexOf('.')) + '.lrc',
        format: appSetting['download.lrcFormat'],
        downloadLxlrc: appSetting['download.isDownloadLxLrc'],
        downloadTlrc: appSetting['download.isDownloadTLrc'],
        downloadRlrc: appSetting['download.isDownloadRLrc'],
      }
      void window.lx.worker.download.saveLrc(lrcs, info)
    }
  })
}

const getUrl = async(downloadInfo: LX.Download.ListItem, isRefresh: boolean = false) => {
  let toggleMusicInfo = downloadInfo.metadata.musicInfo.meta.toggleMusicInfo
  return (toggleMusicInfo ? getMusicUrl({
    musicInfo: toggleMusicInfo,
    isRefresh,
    quality: downloadInfo.metadata.quality,
    allowToggleSource: false,
  }) : Promise.reject(new Error('not found'))).catch(() => {
    return getMusicUrl({
      musicInfo: downloadInfo.metadata.musicInfo,
      isRefresh: false,
      quality: downloadInfo.metadata.quality,
      allowToggleSource: appSetting['download.isUseOtherSource'],
    })
  }).catch(() => '')
}
const handleRefreshUrl = (downloadInfo: LX.Download.ListItem) => {
  setStatusText(downloadInfo, window.i18n.t('download_status_error_refresh_url'))
  let toggleMusicInfo = downloadInfo.metadata.musicInfo.meta.toggleMusicInfo
  ;(toggleMusicInfo ? getMusicUrl({
    musicInfo: toggleMusicInfo,
    isRefresh: true,
    quality: downloadInfo.metadata.quality,
    allowToggleSource: false,
  }) : Promise.reject(new Error('not found'))).catch(() => {
    return getMusicUrl({
      musicInfo: downloadInfo.metadata.musicInfo,
      isRefresh: true,
      quality: downloadInfo.metadata.quality,
      allowToggleSource: appSetting['download.isUseOtherSource'],
    })
  })
    .catch(() => '')
    .then(url => {
    // commit('setStatusText', { downloadInfo, text: '链接刷新成功' })
      setUrl(downloadInfo, url)
      void window.lx.worker.download.updateUrl(downloadInfo.id, url)
    })
    .catch(err => {
      console.log(err)
      handleError(downloadInfo, err.message)
    })
}
const handleError = (downloadInfo: LX.Download.ListItem, message?: string) => {
  setStatus(downloadInfo, DOWNLOAD_STATUS.ERROR, message)
  void window.lx.worker.download.removeTask(downloadInfo.id)
  runingTask.delete(downloadInfo.id)
  void checkStartTask()
}

// 参与「同名文件」判定的音频扩展名，歌词（.lrc/.krc）等非音频文件不参与
const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.ape']

/**
 * 解析歌曲时长字符串（如 "03:55"）为秒数
 */
const parseIntervalToSeconds = (interval?: string | null): number => {
  if (!interval) return 0
  const parts = interval.split(':').map(part => parseInt(part, 10))
  if (parts.some(num => Number.isNaN(num))) return 0
  switch (parts.length) {
    case 2:
      return parts[0] * 60 + parts[1]
    case 3:
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    default:
      return 0
  }
}

/**
 * 在保存目录中查找已存在的同一首歌文件
 * 优先匹配完全同名的文件，其次匹配「文件名相同但扩展名不同」的音频文件（忽略 .lrc 等歌词文件）
 * @param savePath 保存目录
 * @param fileName 本次要下载的文件名
 * @returns 已存在的文件完整路径，不存在时返回空字符串
 */
const findExistMusicFile = async(savePath: string, fileName: string): Promise<string> => {
  const targetPath = joinPath(savePath, fileName)
  // 1. 完全同名的文件
  if (await checkPath(targetPath)) return targetPath

  // 2. 文件名相同、扩展名不同的音频文件
  const targetBaseName = basename(fileName, extname(fileName)).toLowerCase()
  if (!targetBaseName) return ''

  const files = await readDir(savePath)
  const matched = files.find(file => {
    const ext = extname(file).toLowerCase()
    if (!AUDIO_EXTS.includes(ext)) return false
    return basename(file, extname(file)).toLowerCase() === targetBaseName
  })
  return matched ? joinPath(savePath, matched) : ''
}

/**
 * 读取已存在文件的大小、比特率、时长
 */
const getExistFileInfo = async(filePath: string, interval?: string | null) => {
  const stats = await getFileStats(filePath)
  const size = stats?.size ?? 0

  let bitrate = ''
  let duration = 0
  try {
    const { parseFile } = await import('music-metadata')
    const metadata = await parseFile(filePath)
    if (metadata.format.bitrate) bitrate = `${Math.round(metadata.format.bitrate / 1000)}kbps`
    if (metadata.format.duration) duration = Math.round(metadata.format.duration)
  } catch (err) {
    console.log(err)
  }

  // 读取文件元数据失败时，用扩展名与歌曲信息兜底
  if (!bitrate) {
    const ext = extname(filePath).toLowerCase()
    bitrate = ['.flac', '.wav', '.ape'].includes(ext) ? '无损' : '未知'
  }
  if (!duration) duration = parseIntervalToSeconds(interval)

  return { size, bitrate, duration }
}

// 弹窗串行化，避免多个任务同时触发检查时弹窗叠加
let existDialogQueue: Promise<unknown> = Promise.resolve()
const showExistDialog = (message: string): Promise<boolean> => {
  const result = existDialogQueue.then(async(): Promise<boolean> => {
    const isContinue = await dialog.confirm({
      message,
      confirmButtonText: '下载',
      cancelButtonText: '不下载',
    })
    return isContinue === true
  })
  existDialogQueue = result.catch(() => false)
  return result
}

// 记录用户已确认继续下载的任务，避免重试时重复弹窗
const confirmedExistTasks = new Set<string>()

interface ExistCheckResult {
  isContinue: boolean
  existFilePath: string
}

/**
 * 检查下载目录是否已存在此歌曲，如存在则弹窗让用户决定是否继续下载
 * @returns isContinue 是否继续下载；existFilePath 已存在的文件路径（供「忽略扩展名」时删除）
 */
const checkExistMusicFile = async(downloadInfo: LX.Download.ListItem, savePath: string): Promise<ExistCheckResult> => {
  if (confirmedExistTasks.has(downloadInfo.id)) return { isContinue: true, existFilePath: '' }

  const existFilePath = await findExistMusicFile(savePath, downloadInfo.metadata.fileName)
  if (!existFilePath) return { isContinue: true, existFilePath: '' }

  const { size, bitrate, duration } = await getExistFileInfo(existFilePath, downloadInfo.metadata.musicInfo.interval)
  const message = [
    `已存在此歌曲，文件名为：${basename(existFilePath)}`,
    `比特率为：${bitrate}`,
    `文件大小为：${(size / 1024 / 1024).toFixed(2)}M`,
    `时长为：${formatDurationText(duration)}`,
    '是否继续下载？',
  ].join('\n')

  const isContinue = await showExistDialog(message)
  if (isContinue) confirmedExistTasks.add(downloadInfo.id)
  return { isContinue, existFilePath }
}

const handleStartTask = async(downloadInfo: LX.Download.ListItem) => {
  const savePath = buildSavePath(downloadInfo)
  const filePath = joinPath(savePath, downloadInfo.metadata.fileName)
  if (downloadInfo.metadata.filePath != filePath) updateFilePath(downloadInfo, filePath)

  // 任务开始执行时，检查下载目录是否已存在此歌曲（含同文件名不同扩展名，排除歌词文件）
  if (downloadInfo.downloaded == 0) {
    setStatusText(downloadInfo, window.i18n.t('download_status_check_exist'))
    const { isContinue, existFilePath } = await checkExistMusicFile(downloadInfo, savePath)
    if (!isContinue) {
      handleError(downloadInfo, window.i18n.t('download_status_error_check_path_exist'))
      return
    }
    if (downloadInfo.status != DOWNLOAD_STATUS.RUN) return

    // 开启「忽略扩展名」时，覆盖删除同名的其他格式文件；同扩展名的由 worker 覆盖
    if (appSetting['download.ignoreFileExt'] && existFilePath && existFilePath != filePath) {
      try {
        await removeFile(existFilePath)
      } catch (err) {
        console.log('删除已存在的同名歌曲文件失败：', err)
      }
    }
  }

  if (!downloadInfo.metadata.url) {
    setStatusText(downloadInfo, window.i18n.t('download_status_url_getting'))
    const url = await getUrl(downloadInfo)
    if (!url) {
      handleError(downloadInfo, window.i18n.t('download_status_error_url_failed'))
      return
    }
    setUrl(downloadInfo, url)
    if (downloadInfo.status != DOWNLOAD_STATUS.RUN) return
  }

  setStatusText(downloadInfo, window.i18n.t('download_status_start'))

  // 用户已确认继续下载时强制覆盖同名文件，否则沿用设置项
  const skipExistFile = confirmedExistTasks.has(downloadInfo.id) ? false : appSetting['download.skipExistFile']

  await window.lx.worker.download.startTask(toRaw(downloadInfo), savePath, skipExistFile, proxyCallback((event: LX.Download.DownloadTaskActions) => {
    // console.log(event)
    switch (event.action) {
      case 'start':
        setStatus(downloadInfo, DOWNLOAD_STATUS.RUN)
        break
      case 'complete':
        downloadInfo.progress = 100
        saveMeta(downloadInfo)
        downloadLyric(downloadInfo)
        void window.lx.worker.download.removeTask(downloadInfo.id)
        runingTask.delete(downloadInfo.id)
        setStatus(downloadInfo, DOWNLOAD_STATUS.COMPLETED)
        // 更新列表的「已下载」标志，并让旧的文件信息缓存失效
        invalidateDownloadedFileInfo()
        refreshDownloadedIndexThrottle()
        void checkStartTask()
        break
      case 'refreshUrl':
        handleRefreshUrl(downloadInfo)
        break
      case 'statusText':
        setStatusText(downloadInfo, event.data)
        break
      case 'progress':
        setProgress(downloadInfo, event.data)
        break
      case 'error':
        handleError(downloadInfo, event.data.error
          ? window.i18n.t(event.data.error) + (event.data.message ?? '')
          : event.data.message,
        )
        break
      default:
        break
    }
  }), getProxy())
}
const startTask = async(downloadInfo: LX.Download.ListItem) => {
  setStatus(downloadInfo, DOWNLOAD_STATUS.RUN)
  runingTask.set(downloadInfo.id, downloadInfo)
  void handleStartTask(downloadInfo)
}

const getStartTask = (list: LX.Download.ListItem[]): LX.Download.ListItem | null => {
  let downloadCount = 0
  const waitList = list.filter(item => {
    if (item.status == DOWNLOAD_STATUS.WAITING) return true
    if (item.status == DOWNLOAD_STATUS.RUN) ++downloadCount
    return false
  })
  // console.log(downloadCount, waitList)
  return downloadCount < appSetting['download.maxDownloadNum'] ? waitList.shift() ?? null : null
}

const checkStartTask = async() => {
  if (runingTask.size >= appSetting['download.maxDownloadNum']) return
  let result = getStartTask(downloadList)
  // console.log(result)
  while (result) {
    await startTask(result)
    result = getStartTask(downloadList)
  }
}

/**
 * 过滤重复任务
 * @param list
 */
const filterTask = (list: LX.Download.ListItem[]) => {
  const set = new Set<string>()
  for (const item of downloadList) set.add(item.id)
  return list.filter(item => {
    if (set.has(item.id)) return false
    markRaw(item.metadata)
    set.add(item.id)
    return true
  })
}
/**
 * 重置任务，以便重新下载
 * @param task 下载任务
 */
const resetTaskForRedownload = (task: LX.Download.ListItem) => {
  task.downloaded = 0
  task.total = 0
  task.progress = 0
  task.speed = ''
  task.writeQueue = 0
  task.isComplate = false
  task.metadata.url = null
  setStatus(task, DOWNLOAD_STATUS.WAITING)
}

/**
 * 创建下载任务
 * @param list 要下载的歌曲
 * @param quality 下载音质
 */
export const createDownloadTasks = async(list: LX.Music.MusicInfoOnline[], quality: LX.Quality, listId?: string) => {
  if (!list.length) {
    showToast('没有可添加的下载歌曲')
    return
  }
  let allTasks: LX.Download.ListItem[] = []
  try {
    const safeList = list.map(musicInfo => cloneMusicInfoForDownload(musicInfo))
    allTasks = await window.lx.worker.download.createDownloadTasks(safeList, quality,
      appSetting['download.fileName'],
      toRaw(qualityList.value), listId,
    )
  } catch (err: any) {
    console.log(err)
    showToast(`添加下载任务失败：${err?.message || '未知错误'}`)
    return
  }

  const tasks = filterTask(allTasks)
  const newTaskIds = new Set(tasks.map(task => task.id))
  // 已在下载列表中的任务
  const existTasks = downloadList.filter(task => !newTaskIds.has(task.id) && allTasks.some(t => t.id === task.id))
  // 其中尚未完成的任务（下载中 / 排队中 / 已暂停 / 失败）
  const pendingTasks = existTasks.filter(task => !task.isComplate)
  const hasFailedTask = pendingTasks.some(task => task.status == DOWNLOAD_STATUS.ERROR)
  const hasDownloadingTask = pendingTasks.some(task => task.status != DOWNLOAD_STATUS.ERROR)

  // 目标音质不可用时会被降级为实际可用音质，标记出来用于提示与强制覆盖
  const hasDegraded = allTasks.some(task => task.metadata.quality != quality)

  if (tasks.length) {
    // 新加入的任务需要重新检查已存在的文件，清除历史确认标记
    for (const task of tasks) confirmedExistTasks.delete(task.id)
    await addTasks(tasks)
  }

  // 重置需要重新下载的任务：
  // 1. 已完成但文件已被手动删除
  // 2. 本次目标音质被降级（即使旧文件还在，也用降级后的音质覆盖）
  const reDownloadTasks: LX.Download.ListItem[] = []
  for (const task of existTasks) {
    if (!task.isComplate) continue
    if (task.metadata.quality == quality) {
      const filePath = task.metadata.filePath || joinPath(buildSavePath(task), task.metadata.fileName)
      if (await checkPath(filePath)) continue
    }
    reDownloadTasks.push(task)
  }
  for (const task of reDownloadTasks) {
    // 用户已通过选择音质确认要下载，不再弹「文件已存在」确认框
    confirmedExistTasks.add(task.id)
    resetTaskForRedownload(task)
  }

  if (hasDegraded) {
    showToast('无此音质，自动下载降级音质')
  } else if (reDownloadTasks.length) {
    showToast(`已重新添加 ${reDownloadTasks.length} 个下载任务`)
  } else if (tasks.length) {
    showToast(`已添加 ${tasks.length} 个下载任务`)
  } else if (hasFailedTask) {
    showToast('任务已存在，但下载失败')
  } else if (hasDownloadingTask) {
    showToast('任务已存在，正在下载')
  } else {
    showToast('要下载歌曲文件已存在')
  }
  void checkStartTask()
}

/**
 * 开始下载任务
 * @param list
 */
export const startDownloadTasks = async(list: LX.Download.ListItem[]) => {
  for (const downloadInfo of list) {
    if (downloadInfo.isRemoteSynced) continue
    switch (downloadInfo.status) {
      case DOWNLOAD_STATUS.PAUSE:
      case DOWNLOAD_STATUS.ERROR:
        if (runingTask.size < appSetting['download.maxDownloadNum']) void startTask(downloadInfo)
        else setStatus(downloadInfo, DOWNLOAD_STATUS.WAITING)
      default:
        break
    }
  }
  void checkStartTask()
}

/**
 * 暂停下载任务
 * @param list
 */
export const pauseDownloadTasks = async(list: LX.Download.ListItem[]) => {
  for (const downloadInfo of list) {
    if (downloadInfo.isRemoteSynced) continue
    switch (downloadInfo.status) {
      case DOWNLOAD_STATUS.RUN:
        void window.lx.worker.download.pauseTask(downloadInfo.id)
        runingTask.delete(downloadInfo.id)
      case DOWNLOAD_STATUS.WAITING:
      case DOWNLOAD_STATUS.ERROR:
        setStatus(downloadInfo, DOWNLOAD_STATUS.PAUSE)
      default:
        break
    }
  }
  void checkStartTask()
}

/**
 * 移除下载任务
 * @param ids 要移除的任务Id
 */
export const removeDownloadTasks = async(ids: string[]) => {
  await downloadTasksRemove(ids)

  const idsSet = new Set<string>(ids)
  // 任务被移除后，清除其「已确认继续下载」标记，重新添加时需重新检查
  for (const id of idsSet) confirmedExistTasks.delete(id)
  const newList = downloadList.filter(task => {
    if (runingTask.has(task.id)) {
      void window.lx.worker.download.removeTask(task.id)
      runingTask.delete(task.id)
    }
    return !idsSet.has(task.id)
  })
  downloadList.splice(0, downloadList.length)
  arrPush(downloadList, newList)


  void checkStartTask()
  window.app_event.downloadListUpdate()
}
