import { shallowRef } from '@common/utils/vueTools'
import { readDir, basename, extname, joinPath, getFileStats } from '@renderer/utils'
import { filterFileName, formatDurationText } from '@common/utils/common'
import { clipFileNameLength, clipNameLength, formatMusicName } from '@common/utils/tools'
import { appSetting } from '@renderer/store/setting'

// 参与判定的音频扩展名，与下载逻辑保持一致（歌词等非音频文件不参与）
const AUDIO_EXTS = ['mp3', 'flac', 'wav', 'ape']

// 下载文件名可能使用的格式，全部尝试，兼容用户改过设置的情况
const NAME_FORMATS = ['歌名 - 歌手', '歌手 - 歌名', '歌名']

export interface DownloadedFileInfo {
  fileName: string
  sizeText: string
  bitrate: string
  durationText: string
}

/**
 * 下载目录中已存在的歌曲：文件名（不含扩展名、统一小写） → 完整路径
 * 使用 shallowRef 整体替换，便于触发依赖更新
 */
export const downloadedFiles = shallowRef<Map<string, string>>(new Map())

// 文件信息缓存，避免重复读取
const fileInfoCache = new Map<string, DownloadedFileInfo>()

/**
 * 索引版本号，每次索引或文件信息缓存发生变化时递增
 * 用于让已展示过提示的组件丢弃旧信息
 */
export const indexVersion = shallowRef(0)

const bumpVersion = () => {
  indexVersion.value++
}

/**
 * 使已下载文件的信息缓存失效
 * @param filePath 指定文件路径；不传则清空全部缓存
 */
export const invalidateDownloadedFileInfo = (filePath?: string) => {
  if (filePath) fileInfoCache.delete(filePath)
  else fileInfoCache.clear()
  bumpVersion()
}

let isRefreshing = false
let isPending = false

/**
 * 扫描下载目录，重建「已下载文件」索引
 */
export const refreshDownloadedIndex = async() => {
  if (isRefreshing) {
    isPending = true
    return
  }
  isRefreshing = true
  try {
    const savePath = appSetting['download.savePath']
    const files = savePath ? await readDir(savePath) : []
    const map = new Map<string, string>()
    for (const file of files) {
      const ext = extname(file).slice(1).toLowerCase()
      if (!AUDIO_EXTS.includes(ext)) continue
      map.set(basename(file, extname(file)).toLowerCase(), joinPath(savePath, file))
    }
    downloadedFiles.value = map
    fileInfoCache.clear()
    bumpVersion()
  } finally {
    isRefreshing = false
    if (isPending) {
      isPending = false
      void refreshDownloadedIndex()
    }
  }
}

let refreshTimer: NodeJS.Timeout | null = null
/**
 * 节流刷新索引，避免批量下载完成时频繁扫描目录
 */
export const refreshDownloadedIndexThrottle = () => {
  if (refreshTimer) return
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void refreshDownloadedIndex()
  }, 1000)
}

/**
 * 查找歌曲对应的已下载文件路径
 * @param musicInfo 歌曲信息
 * @returns 文件完整路径，未找到时返回空字符串
 */
const findDownloadedFilePath = (musicInfo: LX.Music.MusicInfo): string => {
  if (musicInfo.source == 'local') return ''
  const files = downloadedFiles.value
  if (!files.size) return ''

  const singer = clipNameLength(musicInfo.singer ?? '')
  for (const format of NAME_FORMATS) {
    const fileName = filterFileName(clipFileNameLength(formatMusicName(format, musicInfo.name, singer)))
    const filePath = files.get(fileName.toLowerCase())
    if (filePath) return filePath
  }
  return ''
}

/**
 * 判断歌曲是否已存在于下载目录中（按歌曲名与歌手匹配文件名）
 * @param musicInfo 歌曲信息
 */
export const isMusicDownloaded = (musicInfo: LX.Music.MusicInfo): boolean => {
  // 本地歌曲本身就是文件
  if (musicInfo.source == 'local') return true
  return !!findDownloadedFilePath(musicInfo)
}

/**
 * 读取已下载文件的大小、比特率、时长
 */
const readFileInfo = async(filePath: string): Promise<DownloadedFileInfo> => {
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

  // 读取元数据失败时，用扩展名兜底
  if (!bitrate) {
    const ext = extname(filePath).toLowerCase()
    bitrate = ['.flac', '.wav', '.ape'].includes(ext) ? '无损' : '未知'
  }

  return {
    fileName: basename(filePath),
    sizeText: `${(size / 1024 / 1024).toFixed(2)}M`,
    bitrate,
    durationText: duration ? formatDurationText(duration) : '未知',
  }
}

/**
 * 获取歌曲在下载目录中已存在文件的信息
 * @param musicInfo 歌曲信息
 * @returns 文件信息，未找到时返回 null
 */
export const getDownloadedFileInfo = async(musicInfo: LX.Music.MusicInfo): Promise<DownloadedFileInfo | null> => {
  const filePath = findDownloadedFilePath(musicInfo)
  if (!filePath) return null

  const cached = fileInfoCache.get(filePath)
  if (cached) return cached

  const info = await readFileInfo(filePath)
  fileInfoCache.set(filePath, info)
  return info
}
