import {
  AnalysisStatus,
  FileItem as BaseFileType,
  DirectoryItem,
  getQualityScoreStars
} from '@yonuc/types'
import { LogCategory, logger } from '@yonuc/shared'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatFileSize, getFileIcon } from './FileItem'

import { FileItem } from './FileItem'
import { MaterialIcon } from '../../lib/utils'
import { cn } from '../../lib/utils'
import { t } from '@app/languages'
import { useAnalysisQueueStore } from '../../stores/analysis-queue-store'
import { useFileDisplaySettings } from '../../hooks/useFileDisplaySettings'
import { useFileExplorerStore } from '../../stores/app-store'

// 扩展 FileType 类型，添加 relativePathPrefix 属性
interface FileType extends BaseFileType {
  relativePathPrefix?: string
  thumbnailPath?: string // 添加 thumbnailPath 属性
}






// 动态导入react-window
let ListComponent: any = null
let GridComponent: any = null
let isReactWindowLoaded = false

if (typeof window !== 'undefined') {
  try {
    // 使用动态导入确保在客户端运行时加载
    import('react-window')
      .then((module: any) => {
        // Log module for debugging
        logger.info(LogCategory.RENDERER, 'Loaded react-window module:', module)
        ListComponent =
          module.FixedSizeList ||
          module.default?.FixedSizeList ||
          module.List ||
          module.default?.List
        GridComponent = module.FixedSizeGrid || module.default?.FixedSizeGrid
        isReactWindowLoaded = true
      })
      .catch(e => {
        logger.warn(LogCategory.RENDERER, 'Failed to load react-window:', e)
        isReactWindowLoaded = false
      })
  } catch (e) {
    logger.warn(LogCategory.RENDERER, 'Failed to dynamically import react-window:', e)
    isReactWindowLoaded = false
  }
}

interface FileListProps {
  files: FileType[]
  directories: DirectoryItem[]
  selectedFiles: FileType[]
  activeItem?: FileType | DirectoryItem | null // 当前在属性面板中显示的文件/目录
  onFileSelect: (files: (FileType | DirectoryItem | string)[], isFromCheckbox?: boolean) => void
  onDirectoryChange: (path: string) => void
  loading?: boolean
  viewMode?: 'list' | 'grid' | 'table'
  currentPath: string
  showAnalysisStatus?: boolean // 是否显示分析状态列（虚拟目录不显示）
  showsmartName?: boolean // 是否显示智能文件名列（虚拟目录显示）
  isRealDirectory?: boolean // 是否是真实目录模式（真实目录不显示AI分析相关字段）
  sortBy?:
    | 'name'
    | 'size'
    | 'modified'
    | 'type'
    | 'smartName'
    | 'analysisStatus'
    | 'author'
    | 'qualityScore'
    | 'language' // 可选的排序字段（虚拟目录传入）
  sortOrder?: 'asc' | 'desc' // 可选的排序顺序（虚拟目录传入）
  disableClientSort?: boolean // 是否禁用客户端排序（虚拟目录已在后端排序）
  onSortChange?: (
    sortBy:
      | 'name'
      | 'size'
      | 'modified'
      | 'type'
      | 'smartName'
      | 'analysisStatus'
      | 'author'
      | 'qualityScore'
      | 'language',
    sortOrder: 'asc' | 'desc'
  ) => void // 排序变化回调
  workspaceDirectoryPath?: string // 工作目录路径（用于解析缩略图路径）
}

interface ListItemData {
  items: (FileType | DirectoryItem)[]
  selectedFiles: FileType[]
  activeItem?: FileType | DirectoryItem | null
  onFileSelect: (files: (FileType | DirectoryItem)[], isFromCheckbox?: boolean) => void
  onDirectoryChange: (path: string) => void
  onToggleDirectory?: (path: string) => void
  viewMode?: 'list' | 'grid' | 'table'
  showAnalysisStatus?: boolean
  showsmartName?: boolean
  shouldShowField?: (
    field: 'qualityScore' | 'description' | 'tags' | 'author' | 'language'
  ) => boolean
  isRealDirectory?: boolean
  columnCount?: number
  getAllFilesInDirectory?: (dirPath: string) => (FileType | DirectoryItem)[]
  isImageFile?: (extension: string) => boolean
}

// 定义RowRenderer组件的props类型
interface RowRendererProps {
  index: number
  style: React.CSSProperties
  data: ListItemData
}

// 缓存目录结构，避免重复计算
const directoryCache = new Map<string, (FileType | DirectoryItem)[]>()

// 渲染分析状态
const renderAnalysisStatus = (status?: AnalysisStatus, error?: string) => {
  if (!status) return null

  const title = status === 'failed' ? error || t('未知失败原因') : undefined

  switch (status) {
    case 'completed':
      return (
        <div className="flex items-center space-x-1 text-green-600" title={title}>
          <MaterialIcon icon="check_circle" className="text-sm" />
          <span className="text-xs font-medium">{t('已分析')}</span>
        </div>
      )
    case 'pending':
      return (
        <div
          className="flex items-center space-x-1 text-yellow-600 dark:text-yellow-500"
          title={title}
        >
          <MaterialIcon icon="pending" className="text-sm" />
          <span className="text-xs font-medium">{t('分析队列中')}</span>
        </div>
      )
    case 'analyzing':
      return (
        <div className="flex items-center space-x-1 text-primary dark:text-primary" title={title}>
          <MaterialIcon icon="sync" className="text-sm animate-spin" />
          <span className="text-xs font-medium">{t('分析中')}</span>
        </div>
      )
    case 'failed':
      return (
        <div className="flex items-center space-x-1 text-red-600" title={title}>
          <MaterialIcon icon="error" className="text-sm" />
          <span className="text-xs font-medium">{t('失败')}</span>
        </div>
      )
    default:
      return null
  }
}

const RowRenderer: React.FC<RowRendererProps> = ({ index, style, data }) => {
  const item = data.items[index]
  const { snapshot } = useAnalysisQueueStore()
  // 勾选状态（checkbox选中）
  const isSelected = data.selectedFiles.some((f: any) => {
    // 使用更健壮的路径比较，确保类型正确
    const normalizedPath1 = f?.path ? f.path.replace(/\\/g, '/') : ''
    const normalizedPath2 = item?.path ? item.path.replace(/\\/g, '/') : ''
    return normalizedPath1 && normalizedPath2 && normalizedPath1 === normalizedPath2
  })
  // 活动状态（属性面板选中）
  const isActive =
    data.activeItem && item.path.replace(/\\/g, '/') === data.activeItem.path.replace(/\\/g, '/')

  // 获取文件的分析状态
  const getFileAnalysisStatus = (file: FileType): AnalysisStatus | undefined => {
    const normalizedPath = file.path.replace(/\\/g, '/')
    // 首先检查队列中的状态
    const queueItem = snapshot.items.find(item => item.path.replace(/\\/g, '/') === normalizedPath)
    if (queueItem) {
      return queueItem.status
    }
    // 如果不在队列中，检查文件是否已分析
    if (file.isAnalyzed) {
      return 'completed'
    }
    return undefined
  }

  // 获取文件的失败原因（仅当队列中存在失败记录时可用）
  const getFileAnalysisError = (file: FileType): string | undefined => {
    const normalizedPath = file.path.replace(/\\/g, '/')
    const queueItem = snapshot.items.find(item => item.path.replace(/\\/g, '/') === normalizedPath)
    if (queueItem?.status === 'failed') {
      return queueItem.error || undefined
    }
    return undefined
  }

  // 优化后的递归获取目录下所有文件的函数
  const getAllFilesInDirectory = useCallback(
    (dirPath: string): (FileType | DirectoryItem)[] => {
      // 检查缓存
      if (directoryCache.has(dirPath)) {
        return directoryCache.get(dirPath)!
      }

      // 使用Set避免重复
      const resultSet = new Set<FileType | DirectoryItem>()

      // 添加当前目录本身
      const currentDir = data.items.find(
        item =>
          'isDirectory' in item &&
          item.isDirectory &&
          item.path.replace(/\\/g, '/') === dirPath.replace(/\\/g, '/')
      )
      if (currentDir) {
        resultSet.add(currentDir)
      }

      // 使用队列进行广度优先搜索，避免深度递归
      const queue = [dirPath]
      const visited = new Set<string>()

      while (queue.length > 0) {
        const currentPath = queue.shift()!
        if (visited.has(currentPath.replace(/\\/g, '/'))) continue
        visited.add(currentPath.replace(/\\/g, '/'))

        // 获取当前路径下的所有文件和目录
        const currentFiles = data.items.filter(item => {
          if ('isDirectory' in item && item.isDirectory) {
            // 目录：检查是否是当前路径的直接子目录
            return item.parentPath.replace(/\\/g, '/') === currentPath.replace(/\\/g, '/')
          } else {
            // 文件：检查是否在当前路径下
            const filePath = (item as FileType).path
            // 标准化路径分隔符
            const normalizedFilePath = filePath.replace(/\\/g, '/')
            const normalizedCurrentPath = currentPath.replace(/\\/g, '/')

            // 检查文件路径是否以当前路径开头，并且后面跟着路径分隔符
            return (
              normalizedFilePath.startsWith(normalizedCurrentPath + '/') &&
              normalizedFilePath !== normalizedCurrentPath
            )
          }
        })

        currentFiles.forEach(file => {
          resultSet.add(file)
          // 如果是目录，加入队列继续搜索
          if ('isDirectory' in file && file.isDirectory) {
            queue.push(file.path)
          }
        })
      }

      const result = Array.from(resultSet)
      // 更新缓存
      directoryCache.set(dirPath, result)
      return result
    },
    [data.items]
  )

  if ('isDirectory' in item && item.isDirectory) {
    const rowClass = [
      'transition-colors file-row',
      !isActive && 'hover:bg-accent/40 dark:hover:bg-accent/40',
      isSelected && 'selected bg-accent/70 dark:bg-accent/70',
      isActive && 'active bg-primary/20 dark:bg-primary/30'
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <tr
        className={rowClass}
        onDoubleClick={() => {
          // 双击目录：导航到该目录
          data.onDirectoryChange(item.path)
        }}
      >
        {data.isRealDirectory && (
          <td className="p-2">
            <input
              className="rounded border-input dark:border-input text-primary dark:text-primary focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
              type="checkbox"
              checked={isSelected}
              onChange={e => {
                const { checked } = e.target
                const allChildItems = getAllFilesInDirectory(item.path)
                const itemsToSelect = [item, ...allChildItems]

                if (checked) {
                  // Add the directory and all its children to the selection
                  const newSelected = [...new Set([...data.selectedFiles, ...itemsToSelect])]
                  data.onFileSelect(newSelected, true)
                } else {
                  // Remove the directory and all its children from the selection
                  const pathsToRemove = new Set(itemsToSelect.map(i => i.path.replace(/\\/g, '/')))
                  const newSelected = data.selectedFiles.filter(
                    f => !pathsToRemove.has(f.path.replace(/\\/g, '/'))
                  )
                  data.onFileSelect(newSelected, true)
                }
              }}
              onDoubleClick={e => e.stopPropagation()}
            />
          </td>
        )}
        {data.showsmartName && (
          <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap min-w-[400px]">
            {/* 目录没有虚拟名称 */}
          </td>
        )}
        {!data.showsmartName && (
          <td className="p-2 flex items-center min-w-[400px]">
            <span className="material-icons text-amber-500 mr-2 text-xl">folder</span>
            <span
              className="font-medium cursor-pointer hover:text-primary dark:text-primary transition-colors"
              onClick={() => {
                // 点击目录名：只显示详情侧边栏，不改变勾选状态
                data.onFileSelect([item], false) // 传递 isFromCheckbox=false
              }}
            >
              {item.name}
            </span>
          </td>
        )}
        {data.shouldShowField && data.shouldShowField('qualityScore') && (
          <td className="p-2 whitespace-nowrap">{/* 目录没有评分 */}</td>
        )}
        {data.shouldShowField && data.shouldShowField('description') && (
          <td className="p-2 whitespace-nowrap">{/* 目录没有描述 */}</td>
        )}
        {data.shouldShowField && data.shouldShowField('tags') && (
          <td className="p-2 whitespace-nowrap">{/* 目录没有标签 */}</td>
        )}
        {data.shouldShowField && data.shouldShowField('author') && (
          <td className="p-2 whitespace-nowrap">{/* 目录没有作者 */}</td>
        )}
        {data.shouldShowField && data.shouldShowField('language') && (
          <td className="p-2 whitespace-nowrap">{/* 目录没有语言 */}</td>
        )}
        {data.showAnalysisStatus && (
          <td className="p-2 whitespace-nowrap">{/* 目录没有分析状态 */}</td>
        )}
        <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap">
          {new Date(item.modifiedAt).toLocaleString('zh-CN')}
        </td>
        <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap">
          {t('文件夹')}
        </td>
        <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap"></td>
      </tr>
    )
  }

  const fileItem = item as FileType
  const rowClass = [
    'transition-colors file-row',
    !isActive && 'hover:bg-accent/40 dark:hover:bg-accent/40',
    isSelected && 'selected bg-accent/70 dark:bg-accent/70',
    isActive && 'active bg-primary/20 dark:bg-primary/30'
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <tr key={item.path || index} className={rowClass}>
      {data.isRealDirectory && (
        <td className="p-2 w-10 text-center">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary cursor-pointer"
            checked={isSelected}
            onChange={e => {
              const newSelected = e.target.checked
                ? [...data.selectedFiles, fileItem]
                : data.selectedFiles.filter((f: FileType) => {
                    // 使用更健壮的路径比较
                    const normalizedPath1 = f.path.replace(/\\/g, '/')
                    const normalizedPath2 = fileItem.path.replace(/\\/g, '/')
                    return normalizedPath1 !== normalizedPath2
                  })
              data.onFileSelect(newSelected, true) // 传递 isFromCheckbox=true
            }}
          />
        </td>
      )}
      {data.showsmartName && (
        <td
          className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap min-w-[400px]"
          title={fileItem.description || ''}
        >
          <div className="flex items-start">
            <span className="material-icons text-blue-500 mr-2 text-xl flex-shrink-0">
              description
            </span>
            <div className="flex flex-col min-w-0 flex-1">
              <span
                className="font-medium cursor-pointer hover:text-primary dark:text-primary transition-colors truncate"
                onClick={e => {
                  e.stopPropagation() // 阻止事件冒泡到行点击处理
                  data.onFileSelect([fileItem], false)
                }}
                onDoubleClick={async e => {
                  e.stopPropagation()
                  try {
                    if (window.electronAPI) {
                      if (window.electronAPI) {
                        await window.electronAPI.utils.openFileWithDefaultApp(fileItem.path)
                      }
                    }
                  } catch (error) {
                    logger.error(LogCategory.RENDERER, '打开文件失败:', error)
                  }
                }}
              >
                {fileItem.smartName || '-'}
              </span>
              <span className="text-xs text-muted-foreground truncate mt-0.5">
                {fileItem.relativePathPrefix
                  ? `${fileItem.relativePathPrefix}/${fileItem.name}`
                  : fileItem.name}
              </span>
            </div>
          </div>
        </td>
      )}
      {!data.showsmartName && (
        <td className="p-2 min-w-[400px]">
          <div className="flex items-center">
            <span className="material-icons text-blue-500 mr-2 text-xl">description</span>
            <span
              className="font-medium cursor-pointer hover:text-primary dark:text-primary transition-colors"
              onClick={e => {
                e.stopPropagation() // 阻止事件冒泡到行点击处理
                data.onFileSelect([fileItem], false)
              }}
              onDoubleClick={async e => {
                e.stopPropagation()
                try {
                  if (window.electronAPI) {
                    await window.electronAPI.utils.openFileWithDefaultApp(fileItem.path)
                  }
                } catch (error) {
                  logger.error(LogCategory.RENDERER, '打开文件失败:', error)
                }
              }}
            >
              {fileItem.name}
            </span>
          </div>
        </td>
      )}
      {data.shouldShowField && data.shouldShowField('qualityScore') && (
        <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap">
          {fileItem.qualityScore ? (
            <div className="flex items-center">
              {getQualityScoreStars(fileItem.qualityScore).stars.map((star, index) => (
                <span key={index} className="text-primary">
                  {star === 'star' ? '★' : star === 'star_half' ? '☆' : '☆'}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground dark:text-muted-foreground">-</span>
          )}
        </td>
      )}
      {data.shouldShowField && data.shouldShowField('description') && (
        <td
          className="p-2 text-foreground/80 dark:text-foreground/80 max-w-xs"
          title={fileItem.description || ''}
        >
          <div className="line-clamp-2 text-sm leading-relaxed">
            {fileItem.description || (
              <span className="text-muted-foreground dark:text-muted-foreground">-</span>
            )}
          </div>
        </td>
      )}
      {data.shouldShowField && data.shouldShowField('tags') && (
        <td className="p-2">
          {fileItem.tags && fileItem.tags.length > 0 ? (
            <div className="flex gap-1 flex-wrap max-h-20 overflow-hidden">
              {fileItem.tags.slice(0, 6).map((tag, tagIndex) => (
                <span
                  key={tagIndex}
                  className="text-xs bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary px-2 py-1 rounded whitespace-nowrap"
                >
                  {tag}
                </span>
              ))}
              {fileItem.tags.length > 6 && (
                <span className="text-xs text-muted-foreground dark:text-muted-foreground self-center">
                  +{fileItem.tags.length - 6}
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground dark:text-muted-foreground">-</span>
          )}
        </td>
      )}
      {data.shouldShowField && data.shouldShowField('author') && (
        <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap">
          {fileItem.author || (
            <span className="text-muted-foreground dark:text-muted-foreground">-</span>
          )}
        </td>
      )}
      {data.shouldShowField && data.shouldShowField('language') && (
        <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap">
          {fileItem.language || (
            <span className="text-muted-foreground dark:text-muted-foreground">-</span>
          )}
        </td>
      )}
      {data.showAnalysisStatus && (
        <td className="p-2 whitespace-nowrap">
          {renderAnalysisStatus(getFileAnalysisStatus(fileItem), getFileAnalysisError(fileItem))}
        </td>
      )}
      <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap">
        {new Date(fileItem.modifiedAt).toLocaleString('zh-CN')}
      </td>
      <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap">
        {fileItem.extension || t('文件')}
      </td>
      <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap">
        {formatFileSize(fileItem.size)}
      </td>
    </tr>
  )
}

interface GridCellProps {
  columnIndex: number
  rowIndex: number
  style: React.CSSProperties
  data: any
}

const GridCell: React.FC<GridCellProps> = ({ columnIndex, rowIndex, style, data }) => {
  if (!style || !data) return null

  const {
    items,
    columnCount,
    selectedFiles,
    activeItem,
    onFileSelect,
    onDirectoryChange,
    getAllFilesInDirectory,
    isImageFile,
    showsmartName,
    isRealDirectory
  } = data

  const index = rowIndex * columnCount + columnIndex
  if (index >= items.length) return null

  const item = items[index]
  const isSelected = selectedFiles.some((f: any) => {
    const normalizedPath1 = f.path.replace(/\\/g, '/')
    const normalizedPath2 = item.path.replace(/\\/g, '/')
    return normalizedPath1 === normalizedPath2
  })
  const isActive =
    activeItem && item.path.replace(/\\/g, '/') === activeItem.path.replace(/\\/g, '/')
  const isDirectory = 'isDirectory' in item && item.isDirectory
  const fileItem = !isDirectory ? (item as FileType) : null
  const showThumbnail = fileItem && isImageFile(fileItem.extension)

  // Adjust style to add gap
  const itemStyle = {
    ...style,
    left: (style.left as number) + 8,
    top: (style.top as number) + 8,
    width: (style.width as number) - 16,
    height: (style.height as number) - 16
  }

  const containerClass = cn(
    'group relative flex flex-col items-center p-3 rounded-xl border transition-all duration-200 cursor-pointer',
    // Base styles with visible hover backgrounds
    'bg-white border-border/40 shadow-sm',
    !isActive &&
      'hover:bg-accent/40 dark:hover:bg-accent/40 hover:shadow-md hover:border-primary/20 hover:-translate-y-0.5',
    // Dark mode base
    'dark:bg-secondary/10 dark:border-white/5',
    // Checked state (checkbox selection) - visible accent color
    isSelected && 'ring-2 ring-accent-500 bg-accent/70 dark:bg-accent/70 border-transparent',
    // Active state (properties panel selection) - distinct primary color (NOT accent)
    isActive && 'bg-primary/30 dark:bg-primary/40 shadow-lg z-10'
  )

  return (
    <div
      style={itemStyle}
      className={containerClass}
      onClick={e => {
        const isCheckboxClick = (e.target as HTMLElement).tagName === 'INPUT'
        if (!isCheckboxClick) {
          onFileSelect([item], false)
        }
      }}
      onDoubleClick={async () => {
        if (isDirectory) {
          onDirectoryChange(item.path)
        } else {
          try {
            if (window.electronAPI) {
              await window.electronAPI.utils.openFileWithDefaultApp(item.path)
            }
          } catch (error) {
            logger.error(LogCategory.RENDERER, '打开文件失败:', error)
          }
        }
      }}
    >
      {/* Checkbox - Visible on hover or selected - ONLY in Real Directory */}
      {isRealDirectory && (
        <div
          className={cn(
            'absolute top-3 left-3 z-20 transition-opacity duration-200',
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          <input
            className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary cursor-pointer shadow-sm"
            type="checkbox"
            checked={isSelected}
            onChange={e => {
              if (isDirectory) {
                if (e.target.checked) {
                  const allFilesInDir = getAllFilesInDirectory(item.path)
                  const newSelected = [...selectedFiles, item, ...allFilesInDir]
                  onFileSelect(newSelected, true)
                } else {
                  const allFilesInDir = getAllFilesInDirectory(item.path)
                  const filesToRemove = [item, ...allFilesInDir].map((file: any) =>
                    file.path.replace(/\\/g, '/')
                  )
                  const newSelected = selectedFiles.filter((f: any) => {
                    const normalizedPath = f.path.replace(/\\/g, '/')
                    return !filesToRemove.some((removePath: string) => {
                      const normalizedRemovePath = removePath.replace(/\\/g, '/')
                      return normalizedPath === normalizedRemovePath
                    })
                  })
                  onFileSelect(newSelected, true)
                }
              } else {
                const newSelected = e.target.checked
                  ? [...selectedFiles, item]
                  : selectedFiles.filter((f: any) => {
                      const normalizedPath1 = f.path.replace(/\\/g, '/')
                      const normalizedPath2 = (item as FileType).path.replace(/\\/g, '/')
                      return normalizedPath1 !== normalizedPath2
                    })
                onFileSelect(newSelected, true)
              }
            }}
            onClick={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Thumbnail Container */}
      <div className="w-full aspect-square flex items-center justify-center mb-3 overflow-hidden rounded-lg bg-gray-50 dark:bg-gray-800/50 relative group-hover:bg-gray-100 dark:group-hover:bg-gray-800 transition-colors">
        {showThumbnail ? (
          <img
            src={`file://${fileItem!.path}`}
            alt={item.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            onError={e => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              const parent = target.parentElement
              if (parent) {
                const icon = document.createElement('span')
                icon.className = 'material-icons text-green-500 text-5xl'
                icon.textContent = 'image'
                parent.appendChild(icon)
              }
            }}
          />
        ) : (
          <div className="transform transition-transform duration-300 group-hover:scale-110 drop-shadow-sm flex items-center justify-center w-full h-full">
            {/* Increase icon size by wrapping in a larger container or using scale */}
            <div className="scale-[2.5]">
              {getFileIcon(isDirectory ? 'directory' : 'file', fileItem?.extension || '')}
            </div>
          </div>
        )}
      </div>

      {/* File Name */}
      <div
        className="text-sm font-medium text-center truncate w-full px-1 text-gray-700 dark:text-gray-100 group-hover:text-primary transition-colors"
        title={
          showsmartName && fileItem?.smartName
            ? fileItem.smartName
            : fileItem?.relativePathPrefix
              ? `${fileItem.relativePathPrefix}/${item.name}`
              : item.name
        }
      >
        {showsmartName && fileItem?.smartName ? fileItem.smartName : item.name}
      </div>
      {/* File Path - Show relative path in Virtual Directory mode */}
      {showsmartName && fileItem && (
        <div className="text-xs text-muted-foreground mt-1 truncate w-full px-1 text-center">
          {fileItem.relativePathPrefix
            ? `${fileItem.relativePathPrefix}/${fileItem.name}`
            : fileItem.name}
        </div>
      )}

      {/* File Size */}
      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-medium">
        {isDirectory ? '' : formatFileSize(fileItem?.size || 0)}
      </div>
    </div>
  )
}

export const FileList: React.FC<FileListProps> = ({
  files,
  directories,
  selectedFiles,
  activeItem,
  onFileSelect,
  onDirectoryChange,
  loading = false,
  viewMode = 'list',
  currentPath,
  showAnalysisStatus = true, // 默认显示分析状态列
  showsmartName = false, // 默认不显示智能文件名列
  isRealDirectory = false, // 默认不是真实目录模式
  sortBy: propSortBy,
  sortOrder: propSortOrder,
  disableClientSort = false,
  onSortChange,
  workspaceDirectoryPath // 工作目录路径（用于解析缩略图路径）
}) => {
  const [reactWindowAvailable, setReactWindowAvailable] = useState(false)
  const listRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  const { expandedDirectories } = useFileExplorerStore()
  const { snapshot } = useAnalysisQueueStore()
  const { shouldShowField, getFieldLabel } = useFileDisplaySettings(isRealDirectory)

  // 使用传入的 sortBy/sortOrder，如果没有则从 store 中获取
  const storeSortBy = useFileExplorerStore(state => state.sortBy)
  const storeSortOrder = useFileExplorerStore(state => state.sortOrder)
  const sortBy = propSortBy || storeSortBy
  const sortOrder = propSortOrder || storeSortOrder

  // 获取文件的分析状态
  const getFileAnalysisStatus = useCallback(
    (file: FileType): AnalysisStatus | undefined => {
      const normalizedPath = file.path.replace(/\\/g, '/')
      // 首先检查队列中的状态
      const queueItem = snapshot.items.find(
        item => item.path.replace(/\\/g, '/') === normalizedPath
      )
      if (queueItem) {
        return queueItem.status
      }
      // 如果不在队列中，检查文件是否已分析
      if (file.isAnalyzed) {
        return 'completed'
      }
      return undefined
    },
    [snapshot]
  )

  // 检查文件是否是图片
  const isImageFile = useCallback((extension?: string) => {
    if (!extension) return false
    const imageExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.bmp',
      '.webp',
      '.svg',
      '.tiff',
      '.tif',
      '.ico'
    ]
    return imageExtensions.includes(extension.toLowerCase())
  }, [])

  const items = useMemo(() => {
    // 显示当前目录下的所有直接子目录（直接比较原生路径）
    const dirs = directories.filter(dir => dir.parentPath === currentPath)
    
    const allItems = [...dirs, ...files]

    // 如果禁用客户端排序（虚拟目录模式，后端已排序），直接返回
    if (disableClientSort) {
      return allItems
    }

    return allItems.sort((a, b) => {
      // 目录始终排在前面
      const aIsDir = 'isDirectory' in a && a.isDirectory
      const bIsDir = 'isDirectory' in b && b.isDirectory
      if (aIsDir && !bIsDir) return -1
      if (!aIsDir && bIsDir) return 1

      // 根据排序字段和顺序排序
      let comparison = 0
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'size':
          comparison = (a as FileType).size - (b as FileType).size
          break
        case 'modified':
          comparison = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime()
          break
        case 'type': {
          const aType = 'isDirectory' in a ? 'directory' : (a as FileType).extension || ''
          const bType = 'isDirectory' in b ? 'directory' : (b as FileType).extension || ''
          comparison = aType.localeCompare(bType)
          break
        }
        case 'smartName': {
          const asmartName = 'isDirectory' in a ? '' : (a as FileType).smartName || ''
          const bsmartName = 'isDirectory' in b ? '' : (b as FileType).smartName || ''
          comparison = asmartName.localeCompare(bsmartName)
          break
        }
        case 'analysisStatus': {
          const aStatus = 'isDirectory' in a ? '' : getFileAnalysisStatus(a as FileType) || ''
          const bStatus = 'isDirectory' in b ? '' : getFileAnalysisStatus(b as FileType) || ''
          // Sort order: completed < analyzing < pending < failed < undefined
          const statusOrder: Record<string, number> = {
            completed: 1,
            analyzing: 2,
            pending: 3,
            failed: 4,
            '': 5
          }
          comparison = (statusOrder[aStatus] || 5) - (statusOrder[bStatus] || 5)
          break
        }
        case 'author': {
          const aAuthor = 'isDirectory' in a ? '' : (a as FileType).author || ''
          const bAuthor = 'isDirectory' in b ? '' : (b as FileType).author || ''
          comparison = aAuthor.localeCompare(bAuthor)
          break
        }
        case 'qualityScore': {
          const aScore = 'isDirectory' in a ? 0 : (a as FileType).qualityScore || 0
          const bScore = 'isDirectory' in b ? 0 : (b as FileType).qualityScore || 0
          comparison = aScore - bScore
          break
        }
        case 'language': {
          const aLang = 'isDirectory' in a ? '' : (a as FileType).language || ''
          const bLang = 'isDirectory' in b ? '' : (b as FileType).language || ''
          comparison = aLang.localeCompare(bLang)
          break
        }
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [
    directories, 
    files, 
    currentPath, 
    sortBy, 
    sortOrder, 
    disableClientSort,
    // 只有在按分析状态排序时才依赖 snapshot.items.length
    // 使用 length 而不是整个 snapshot 对象，减少不必要的重新计算
    sortBy === 'analysisStatus' ? snapshot.items.length : -1
  ])

  // 递归获取目录下所有文件的函数（统一定义，避免在条件分支中重复定义）
  const getAllFilesInDirectory = useCallback(
    (dirPath: string): (FileType | DirectoryItem)[] => {
      // 检查缓存
      if (directoryCache.has(dirPath)) {
        return directoryCache.get(dirPath)!
      }

      // 使用Set避免重复
      const resultSet = new Set<FileType | DirectoryItem>()

      // 添加当前目录本身
      const currentDir = items.find(
        item =>
          'isDirectory' in item &&
          item.isDirectory &&
          item.path.replace(/\\/g, '/') === dirPath.replace(/\\/g, '/')
      )
      if (currentDir) {
        resultSet.add(currentDir)
      }

      // 使用队列进行广度优先搜索，避免深度递归
      const queue = [dirPath]
      const visited = new Set<string>()

      while (queue.length > 0) {
        const currentPath = queue.shift()!
        if (visited.has(currentPath.replace(/\\/g, '/'))) continue
        visited.add(currentPath.replace(/\\/g, '/'))

        // 获取当前路径下的所有文件和目录
        const currentFiles = items.filter(item => {
          if ('isDirectory' in item && item.isDirectory) {
            // 目录：检查是否是当前路径的直接子目录
            return item.parentPath.replace(/\\/g, '/') === currentPath.replace(/\\/g, '/')
          } else {
            // 文件：检查是否在当前路径下
            const filePath = (item as FileType).path
            // 标准化路径分隔符
            const normalizedFilePath = filePath.replace(/\\/g, '/')
            const normalizedCurrentPath = currentPath.replace(/\\/g, '/')

            // 检查文件路径是否以当前路径开头，并且后面跟着路径分隔符
            return (
              normalizedFilePath.startsWith(normalizedCurrentPath + '/') &&
              normalizedFilePath !== normalizedCurrentPath
            )
          }
        })

        currentFiles.forEach(file => {
          resultSet.add(file)
          // 如果是目录，加入队列继续搜索
          if ('isDirectory' in file && file.isDirectory) {
            queue.push(file.path)
          }
        })
      }

      const result = Array.from(resultSet)
      // 更新缓存
      directoryCache.set(dirPath, result)
      return result
    },
    [items]
  )

  const itemData: ListItemData = useMemo(
    () => ({
      items,
      selectedFiles,
      onFileSelect,
      onDirectoryChange,
      viewMode: viewMode,
      showAnalysisStatus,
      showsmartName,
      shouldShowField
    }),
    [
      items,
      selectedFiles,
      onFileSelect,
      onDirectoryChange,
      viewMode,
      showAnalysisStatus,
      showsmartName,
      shouldShowField
    ]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        // 使用更高效的全选方式，避免传递大量文件对象
        onFileSelect(
          items.map(item => item.path),
          true
        ) // 传递路径数组而不是文件对象
      } else if (e.key === 'Escape') {
        onFileSelect([], true) // 传递 isFromCheckbox=true
      }
    },
    [items, onFileSelect]
  )

  useEffect(() => {
    // 检查react-window是否已加载
    const checkReactWindow = () => {
      if (isReactWindowLoaded && ListComponent) {
        setReactWindowAvailable(true)
      } else if (!isReactWindowLoaded) {
        // 如果还未加载完成，稍后再检查
        setTimeout(checkReactWindow, 100)
      }
    }

    checkReactWindow()
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ width, height })
    })

    observer.observe(containerRef.current)

    return () => observer.disconnect()
  }, [viewMode])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollToItem(0)
    }
  }, [items])

  if (loading) {
    return (
      <div className="file-list-loading">
        <div className="loading-spinner">{t('加载中...')}</div>
      </div>
    )
  }

  if (viewMode === 'list') {
    const getSortIcon = (column: string) => {
      if (sortBy !== column) return null
      return sortOrder === 'asc' ? (
        <MaterialIcon icon="arrow_upward" className="text-xs ml-1" />
      ) : (
        <MaterialIcon icon="arrow_downward" className="text-xs ml-1" />
      )
    }

    // 修改 handleHeaderClick 函数以支持 author 字段排序
    const handleHeaderClick = (
      column:
        | 'name'
        | 'size'
        | 'modified'
        | 'type'
        | 'smartName'
        | 'analysisStatus'
        | 'author'
        | 'qualityScore'
        | 'language'
    ) => {
      // 如果提供了 onSortChange 回调（虚拟目录模式），使用它
      if (onSortChange) {
        const newSortOrder = sortBy === column ? (sortOrder === 'asc' ? 'desc' : 'asc') : 'asc'
        onSortChange(column, newSortOrder)
      } else {
        // 否则使用 FileExplorerStore（真实目录模式）
        const { setSortBy, toggleSortOrder } = useFileExplorerStore.getState()
        if (sortBy === column) {
          toggleSortOrder()
        } else {
          // 修复类型错误，确保 setSortBy 可以接受所有合法的排序字段
          setSortBy(column as any)
        }
      }
    }

    return (
      <div className="w-full h-full overflow-auto dark:bg-muted">
        <table className="min-w-[1000px]  w-full text-sm text-left table-fixed">
          <colgroup>
            {isRealDirectory && <col className="w-8" />}
            <col className="w-1/2" />
            {shouldShowField('qualityScore') && <col className="w-22" />}
            {shouldShowField('description') && <col className="w-48" />}
            {shouldShowField('tags') && <col className="w-65" />}
            {shouldShowField('author') && <col className="w-32" />}
            {shouldShowField('language') && <col className="w-24" />}
            {showAnalysisStatus && <col className="w-20" />}
            <col className="w-32" />
            <col className="w-20" />
            <col className="w-16" />
          </colgroup>
          <thead className="text-xs text-foreground/80 dark:text-foreground/80 bg-muted dark:bg-muted sticky top-0 shadow-sm z-10 border-b border-border/50 dark:border-border/50">
            <tr>
              {isRealDirectory && (
                <th className="p-2 text-center font-medium">
                  <input
                    className="rounded border-input dark:border-input text-primary dark:text-primary focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                    type="checkbox"
                    checked={
                      items.length > 0 &&
                      items.every(it =>
                        selectedFiles.some(
                          (f: any) =>
                            (f?.path || '').replace(/\\/g, '/') ===
                            (it?.path || '').replace(/\\/g, '/')
                        )
                      )
                    }
                    onChange={() => {
                      const allSelected =
                        items.length > 0 &&
                        items.every(it =>
                          selectedFiles.some(
                            (f: any) =>
                              (f?.path || '').replace(/\\/g, '/') ===
                              (it?.path || '').replace(/\\/g, '/')
                          )
                        )
                      if (allSelected) {
                        // 仅取消当前可见项
                        const visiblePaths = new Set(
                          items.map(it => (it?.path || '').replace(/\\/g, '/'))
                        )
                        const newSelected = selectedFiles.filter(
                          (f: any) => !visiblePaths.has((f?.path || '').replace(/\\/g, '/'))
                        )
                        onFileSelect(newSelected, true)
                      } else {
                        // 选中当前可见项
                        onFileSelect(
                          items.map(it => it.path),
                          true
                        )
                      }
                    }}
                    title={
                      items.length > 0 &&
                      items.every(it =>
                        selectedFiles.some(
                          (f: any) =>
                            (f?.path || '').replace(/\\/g, '/') ===
                            (it?.path || '').replace(/\\/g, '/')
                        )
                      )
                        ? t('取消全选')
                        : t('全选当前页面')
                    }
                  />
                </th>
              )}
              {showsmartName && (
                <th
                  className="p-2 font-medium cursor-pointer hover:bg-accent dark:hover:bg-accent transition-colors whitespace-nowrap min-w-[300px]"
                  onClick={() => handleHeaderClick('smartName')}
                  title={t('按智能文件名排序')}
                >
                  <div className="flex items-center">
                    {t('智能文件名')}
                    {getSortIcon('smartName')}
                  </div>
                </th>
              )}
              {!showsmartName && (
                <th
                  className="p-2 font-medium cursor-pointer hover:bg-accent dark:hover:bg-accent transition-colors min-w-[300px]"
                  onClick={() => handleHeaderClick('name')}
                  title={t('按文件名排序')}
                >
                  <div className="flex items-center">
                    {t('名称')}
                    {getSortIcon('name')}
                  </div>
                </th>
              )}
              {shouldShowField('qualityScore') && (
                <th
                  className="p-2 font-medium cursor-pointer hover:bg-accent dark:hover:bg-accent transition-colors whitespace-nowrap"
                  onClick={() => handleHeaderClick('qualityScore')}
                  title={t('按质量评分排序')}
                >
                  <div className="flex items-center">
                    {getFieldLabel('qualityScore')}
                    {getSortIcon('qualityScore')}
                  </div>
                </th>
              )}
              {shouldShowField('description') && (
                <th className="p-2 font-medium whitespace-nowrap">
                  {getFieldLabel('description')}
                </th>
              )}
              {shouldShowField('tags') && (
                <th className="p-2 font-medium whitespace-nowrap">{getFieldLabel('tags')}</th>
              )}
              {shouldShowField('author') && (
                <th
                  className="p-2 font-medium cursor-pointer hover:bg-accent dark:hover:bg-accent transition-colors whitespace-nowrap"
                  onClick={() => handleHeaderClick('author')}
                  title={t('点击对作者列进行排序')}
                >
                  <div className="flex items-center">
                    {getFieldLabel('author')}
                    {getSortIcon('author')}
                  </div>
                </th>
              )}
              {shouldShowField('language') && (
                <th
                  className="p-2 font-medium cursor-pointer hover:bg-accent dark:hover:bg-accent transition-colors whitespace-nowrap"
                  onClick={() => handleHeaderClick('language')}
                  title={t('按语言排序')}
                >
                  <div className="flex items-center">
                    {getFieldLabel('language')}
                    {getSortIcon('language')}
                  </div>
                </th>
              )}
              {showAnalysisStatus && (
                <th
                  className="p-2 font-medium cursor-pointer hover:bg-accent dark:hover:bg-accent transition-colors whitespace-nowrap truncate"
                  onClick={() => handleHeaderClick('analysisStatus')}
                  title={t('按分析状态排序')}
                >
                  <div className="flex items-center truncate">
                    {t('分析状态')}
                    {getSortIcon('analysisStatus')}
                  </div>
                </th>
              )}
              <th
                className="p-2 font-medium cursor-pointer hover:bg-accent dark:hover:bg-accent transition-colors whitespace-nowrap truncate"
                onClick={() => handleHeaderClick('modified')}
                title={t('按修改时间排序')}
              >
                <div className="flex items-center truncate">
                  {t('修改日期')}
                  {getSortIcon('modified')}
                </div>
              </th>
              <th
                className="p-2 font-medium cursor-pointer hover:bg-accent dark:hover:bg-accent transition-colors whitespace-nowrap truncate"
                onClick={() => handleHeaderClick('type')}
                title={t('按文件类型排序')}
              >
                <div className="flex items-center truncate">
                  {t('类型')}
                  {getSortIcon('type')}
                </div>
              </th>
              <th
                className="p-2 font-medium cursor-pointer hover:bg-accent dark:hover:bg-accent transition-colors whitespace-nowrap truncate"
                onClick={() => handleHeaderClick('size')}
                title={t('按文件大小排序')}
              >
                <div className="flex items-center truncate">
                  {t('大小')}
                  {getSortIcon('size')}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30 dark:divide-border/30">
            {items.map((item, index) => {
              const isSelected = selectedFiles.some(f => {
                // 使用更健壮的路径比较，确保类型正确
                const normalizedPath1 = f.path.replace(/\\/g, '/')
                const normalizedPath2 = item.path.replace(/\\/g, '/')
                return normalizedPath1 === normalizedPath2
              })
              const isActive =
                activeItem && item.path.replace(/\\/g, '/') === activeItem.path.replace(/\\/g, '/')

              // 包装整个行的点击处理函数
              const handleRowClick = (e: React.MouseEvent) => {
                // 检查点击的是否是checkbox或按钮
                const target = e.target as HTMLElement
                const isInteractiveElement =
                  target.tagName === 'INPUT' ||
                  target.tagName === 'BUTTON' ||
                  target.closest('input') ||
                  target.closest('button')

                // 如果点击的不是交互元素，则执行文件选择逻辑
                if (!isInteractiveElement) {
                  onFileSelect([item], false)
                }
              }

              if ('isDirectory' in item && item.isDirectory) {
                const rowClass = [
                  'transition-colors file-row',
                  !isActive && 'hover:bg-accent/40 dark:hover:bg-accent/40',
                  isSelected && 'selected bg-accent/70 dark:bg-accent/70',
                  isActive && 'active bg-primary/20 dark:bg-primary/30'
                ]
                  .filter(Boolean)
                  .join(' ')

                return (
                  <tr
                    key={item.path || index}
                    className={rowClass}
                    onClick={handleRowClick}
                    onDoubleClick={() => {
                      // 双击目录：导航到该目录
                      onDirectoryChange(item.path)
                    }}
                  >
                    {isRealDirectory && (
                      <td className="p-2 text-center">
                        <input
                          className="rounded border-input dark:border-input text-primary dark:text-primary focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => {
                            const { checked } = e.target
                            const allChildItems = getAllFilesInDirectory(item.path)
                            const itemsToSelect = [item, ...allChildItems]

                            if (checked) {
                              // Add the directory and all its children to the selection
                              const newSelected = [...new Set([...selectedFiles, ...itemsToSelect])]
                              onFileSelect(newSelected, true)
                            } else {
                              // Remove the directory and all its children from the selection
                              const pathsToRemove = new Set(
                                itemsToSelect.map(i => i.path.replace(/\\/g, '/'))
                              )
                              const newSelected = selectedFiles.filter(
                                f => !pathsToRemove.has(f.path.replace(/\\/g, '/'))
                              )
                              onFileSelect(newSelected, true)
                            }
                          }}
                          onDoubleClick={e => e.stopPropagation()}
                        />
                      </td>
                    )}
                    {showsmartName && (
                      <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap min-w-[300px]">
                        {/* 目录没有虚拟名称 */}
                      </td>
                    )}
                    {!showsmartName && (
                      <td className="p-2 flex items-center min-w-[300px]">
                        <span className="material-icons text-amber-500 mr-2 text-xl">folder</span>
                        <span
                          className="font-medium cursor-pointer hover:text-primary dark:text-primary transition-colors"
                          onClick={() => {
                            // 点击文件名：只显示详情侧边栏，完全不改变勾选状态
                            // 传递当前点击的文件，但isFromCheckbox=false表示不更新选中状态
                            onFileSelect([item], false) // 传递 isFromCheckbox=false
                          }}
                        >
                          {item.name}
                        </span>
                      </td>
                    )}
                    {shouldShowField('qualityScore') && (
                      <td className="p-2 whitespace-nowrap">{/* 目录没有评分 */}</td>
                    )}
                    {shouldShowField('description') && (
                      <td className="p-2 whitespace-nowrap">{/* 目录没有描述 */}</td>
                    )}
                    {shouldShowField('tags') && (
                      <td className="p-2 whitespace-nowrap">{/* 目录没有标签 */}</td>
                    )}
                    {shouldShowField('author') && (
                      <td className="p-2 whitespace-nowrap">{/* 目录没有作者 */}</td>
                    )}
                    {shouldShowField('language') && (
                      <td className="p-2 whitespace-nowrap">{/* 目录没有语言 */}</td>
                    )}
                    {showAnalysisStatus && (
                      <td className="p-2 whitespace-nowrap">{/* 目录没有分析状态 */}</td>
                    )}
                    <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap">
                      {new Date(item.modifiedAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap">
                      {t('文件夹')}
                    </td>
                    <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap"></td>
                  </tr>
                )
              }

              const fileItem = item as FileType
              const analysisStatus = getFileAnalysisStatus(fileItem)
              const rowClass = [
                'transition-colors file-row',
                !isActive && 'hover:bg-accent/40 dark:hover:bg-accent/40',
                isSelected && 'selected bg-accent/70 dark:bg-accent/70',
                isActive && 'active bg-primary/20 dark:bg-primary/30'
              ]
                .filter(Boolean)
                .join(' ')

              return (
                <tr key={item.path || index} className={rowClass} onClick={handleRowClick}>
                  {isRealDirectory && (
                    <td className="p-2 text-center">
                      <input
                        className="rounded border-input dark:border-input text-primary dark:text-primary focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => {
                          const newSelected = e.target.checked
                            ? [...selectedFiles, fileItem]
                            : selectedFiles.filter(f => {
                                // 使用更健壮的路径比较
                                const normalizedPath1 = f.path.replace(/\\/g, '/')
                                const normalizedPath2 = fileItem.path.replace(/\\/g, '/')
                                return normalizedPath1 !== normalizedPath2
                              })
                          onFileSelect(newSelected, true) // 传递 isFromCheckbox=true
                        }}
                      />
                    </td>
                  )}
                  {showsmartName && (
                    <td className="p-2" title={fileItem.description || ''}>
                      <div className="flex items-start">
                        <span className="material-icons text-blue-500 mr-2 text-xl flex-shrink-0">
                          description
                        </span>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span
                            className="font-medium cursor-pointer hover:text-primary dark:text-primary transition-colors truncate"
                            onClick={e => {
                              e.stopPropagation() // 阻止事件冒泡到行点击处理
                              onFileSelect([fileItem], false)
                            }}
                            onDoubleClick={async e => {
                              e.stopPropagation()
                              try {
                                if (window.electronAPI) {
                                  await window.electronAPI.utils.openFileWithDefaultApp(
                                    fileItem.path
                                  )
                                }
                              } catch (error) {
                                logger.error(LogCategory.RENDERER, '打开文件失败:', error)
                              }
                            }}
                          >
                            {fileItem.smartName || '-'}
                          </span>
                          <span className="text-xs text-gray-400 truncate mt-0.5">
                            {fileItem.relativePathPrefix
                              ? `${fileItem.relativePathPrefix}/${fileItem.name}`
                              : fileItem.name || '-'}
                          </span>
                        </div>
                      </div>
                    </td>
                  )}
                  {!showsmartName && (
                    <td className="p-2 min-w-[400px]">
                      <div className="flex items-center">
                        <span className="material-icons text-blue-500 mr-2 text-xl">
                          description
                        </span>
                        <span
                          className="font-medium cursor-pointer hover:text-primary dark:text-primary transition-colors"
                          onClick={e => {
                            e.stopPropagation() // 阻止事件冒泡到行点击处理
                            onFileSelect([fileItem], false)
                          }}
                          onDoubleClick={async e => {
                            e.stopPropagation()
                            try {
                              if (window.electronAPI) {
                                await window.electronAPI.utils.openFileWithDefaultApp(fileItem.path)
                              }
                            } catch (error) {
                              logger.error(LogCategory.RENDERER, '打开文件失败:', error)
                            }
                          }}
                        >
                          {fileItem.name}
                        </span>
                      </div>
                    </td>
                  )}
                  {shouldShowField('qualityScore') && (
                    <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap">
                      {fileItem.qualityScore ? (
                        <div className="flex items-center">
                          {getQualityScoreStars(fileItem.qualityScore).stars.map((star, index) => (
                            <span key={index} className="text-primary">
                              {star === 'star' ? '★' : star === 'star_half' ? '☆' : '☆'}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground dark:text-muted-foreground">-</span>
                      )}
                    </td>
                  )}
                  {shouldShowField('description') && (
                    <td
                      className="p-2 text-foreground/80 dark:text-foreground/80 max-w-xs"
                      title={fileItem.description || ''}
                    >
                      <div className="line-clamp-2 text-sm leading-relaxed">
                        {fileItem.description || (
                          <span className="text-muted-foreground dark:text-muted-foreground">
                            -
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                  {shouldShowField('tags') && (
                    <td className="p-2">
                      {fileItem.tags && fileItem.tags.length > 0 ? (
                        <div className="flex gap-1 flex-wrap max-h-20 overflow-hidden">
                          {fileItem.tags.slice(0, 6).map((tag, tagIndex) => (
                            <span
                              key={tagIndex}
                              className="text-xs bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary px-2 py-1 rounded whitespace-nowrap"
                            >
                              {tag}
                            </span>
                          ))}
                          {fileItem.tags.length > 6 && (
                            <span className="text-xs text-muted-foreground dark:text-muted-foreground">
                              +{fileItem.tags.length - 6}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground dark:text-muted-foreground">-</span>
                      )}
                    </td>
                  )}
                  {shouldShowField('author') && (
                    <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap">
                      {fileItem.author || (
                        <span className="text-muted-foreground dark:text-muted-foreground">-</span>
                      )}
                    </td>
                  )}
                  {shouldShowField('language') && (
                    <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap">
                      {fileItem.language || (
                        <span className="text-muted-foreground dark:text-muted-foreground">-</span>
                      )}
                    </td>
                  )}
                  {showAnalysisStatus && (
                    <td className="p-2 whitespace-nowrap">
                      {renderAnalysisStatus(getFileAnalysisStatus(fileItem))}
                    </td>
                  )}
                  <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap">
                    {new Date(fileItem.modifiedAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap">
                    {fileItem.extension || t('文件')}
                  </td>
                  <td className="p-2 text-foreground/80 dark:text-foreground/80 whitespace-nowrap">
                    {formatFileSize(fileItem.size)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }
  if (viewMode === 'grid') {
    if (
      reactWindowAvailable &&
      GridComponent &&
      containerSize.width > 0 &&
      containerSize.height > 0
    ) {
      const minColumnWidth = 180
      const columnCount = Math.max(1, Math.floor(containerSize.width / minColumnWidth))
      const columnWidth = containerSize.width / columnCount
      const rowHeight = 240 // Increased height for better spacing
      const rowCount = Math.ceil(items.length / columnCount)

      return (
        <div className="flex-1 h-full overflow-hidden" ref={containerRef}>
          <GridComponent
            columnCount={columnCount}
            columnWidth={columnWidth}
            height={containerSize.height}
            rowCount={rowCount}
            rowHeight={rowHeight}
            width={containerSize.width}
            itemData={{
              items,
              columnCount,
              selectedFiles,
              onFileSelect,
              onDirectoryChange,
              getAllFilesInDirectory,
              isImageFile,
              showsmartName
            }}
          >
            {GridCell}
          </GridComponent>
        </div>
      )
    }

    // Fallback for initial render or if react-window fails
    return (
      <div className="flex-1 overflow-y-auto p-4 bg-muted dark:bg-muted" ref={containerRef}>
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))'
          }}
        >
          {items.map((item, index) => {
            const isSelected = selectedFiles.some(f => {
              // 使用更健壮的路径比较，确保类型正确
              const normalizedPath1 = f.path.replace(/\\/g, '/')
              const normalizedPath2 = item.path.replace(/\\/g, '/')
              return normalizedPath1 === normalizedPath2
            })
            const isActive =
              activeItem && item.path.replace(/\\/g, '/') === activeItem.path.replace(/\\/g, '/')
            const isDirectory = 'isDirectory' in item && item.isDirectory
            const fileItem = !isDirectory ? (item as FileType) : null
            // 优先使用thumbnailPath，如果没有则检查是否为图片文件
            const hasThumbnail = fileItem && fileItem.thumbnailPath
            const showThumbnail = fileItem && (hasThumbnail || isImageFile(fileItem.extension))

            return (
              <div
                key={item.path || index}
                className={cn(
                  'relative flex flex-col items-center p-3 rounded-lg border transition-all duration-200 cursor-pointer',
                  // Base styles with visible hover backgrounds
                  'bg-white border-border/40 shadow-sm',
                  !isActive &&
                    'hover:bg-accent/40 dark:hover:bg-accent/40 hover:shadow-md hover:border-primary/20 hover:-translate-y-0.5',
                  // Dark mode base
                  'dark:bg-secondary/10 dark:border-white/5',
                  // Checked state (checkbox selection) - visible accent color
                  isSelected &&
                    'ring-2 ring-accent-500 bg-accent/70 dark:bg-accent/70 border-transparent',
                  // Active state (properties panel selection) - distinct primary color (NOT accent)
                  isActive && 'bg-primary/30 dark:bg-primary/40 shadow-lg z-10'
                )}
                onClick={e => {
                  // 检查点击的是否是checkbox
                  const isCheckboxClick = (e.target as HTMLElement).tagName === 'INPUT'

                  if (!isCheckboxClick) {
                    // 如果点击的不是checkbox，则执行文件/目录的点击逻辑
                    onFileSelect([item], false)
                  }
                }}
                onDoubleClick={async () => {
                  if (isDirectory) {
                    onDirectoryChange(item.path)
                  } else {
                    // 双击文件：用系统默认程序打开
                    try {
                      await window.electronAPI?.utils.openFileWithDefaultApp(item.path)
                    } catch (error) {
                      logger.error(LogCategory.RENDERER, '打开文件失败:', error)
                    }
                  }
                }}
              >
                {/* 左上角checkbox */}
                {isRealDirectory && (
                  <div className="absolute top-2 left-2 z-10">
                    <input
                      className="rounded border-input dark:border-input text-primary dark:text-primary focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                      type="checkbox"
                      checked={isSelected}
                      onChange={e => {
                        // 点击checkbox：勾选/取消勾选文件
                        if (isDirectory) {
                          // 目录：递归处理所有子文件
                          if (e.target.checked) {
                            // 选择：添加目录本身及其所有子文件
                            const allFilesInDir = getAllFilesInDirectory(item.path)
                            const newSelected = [...selectedFiles, item, ...allFilesInDir]
                            onFileSelect(newSelected, true) // 传递 isFromCheckbox=true
                          } else {
                            // 取消选择：移除目录本身及其所有子文件
                            const allFilesInDir = getAllFilesInDirectory(item.path)
                            const filesToRemove = [item, ...allFilesInDir].map(file =>
                              file.path.replace(/\\/g, '/')
                            )
                            const newSelected = selectedFiles.filter(f => {
                              const normalizedPath = f.path.replace(/\\/g, '/')
                              return !filesToRemove.some(removePath => {
                                const normalizedRemovePath = removePath.replace(/\\/g, '/')
                                return normalizedPath === normalizedRemovePath
                              })
                            })
                            onFileSelect(newSelected, true) // 传递 isFromCheckbox=true
                          }
                        } else {
                          // 文件：直接处理
                          const newSelected = e.target.checked
                            ? [...selectedFiles, item]
                            : selectedFiles.filter(f => {
                                // 使用更健壮的路径比较，确保类型正确
                                const normalizedPath1 = f.path.replace(/\\/g, '/')
                                const normalizedPath2 = (item as FileType).path.replace(/\\/g, '/')
                                return normalizedPath1 !== normalizedPath2
                              })
                          onFileSelect(newSelected, true) // 传递 isFromCheckbox=true
                        }
                      }}
                      onClick={e => {
                        // 阻止checkbox点击事件冒泡到图标
                        e.stopPropagation()
                      }}
                      onDoubleClick={e => e.stopPropagation()}
                    />
                  </div>
                )}

                {/* 缩略图或图标 */}
                <div className="w-32 h-32 flex items-center justify-center mb-2 overflow-hidden rounded text-muted-foreground dark:text-muted-foreground">
                  {showThumbnail ? (
                    <img
                      src={
                        hasThumbnail && fileItem!.thumbnailPath && workspaceDirectoryPath
                          ? `file://${workspaceDirectoryPath.replace(/\\/g, '/')}/${fileItem!.thumbnailPath.replace(/\\/g, '/')}`
                          : `file://${fileItem!.path}`
                      }
                      alt={item.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={e => {
                        // 如果图片加载失败，显示默认图标
                        const target = e.target as HTMLImageElement
                        target.style.display = 'none'
                        const parent = target.parentElement
                        if (parent) {
                          const icon = document.createElement('span')
                          icon.className = 'material-icons text-green-500 text-5xl'
                          icon.textContent = 'image'
                          parent.appendChild(icon)
                        }
                      }}
                    />
                  ) : (
                    getFileIcon(isDirectory ? 'directory' : 'file', fileItem?.extension || '')
                  )}
                </div>
                <div
                  className="text-sm font-medium text-center truncate w-full text-primary dark:text-primary"
                  title={showsmartName && fileItem?.smartName ? fileItem.smartName : item.name}
                >
                  {showsmartName && fileItem?.smartName ? fileItem.smartName : item.name}
                </div>
                {showsmartName && fileItem && (
                  <div className="text-xs text-gray-400 text-center truncate w-full mt-0.5">
                    {fileItem.relativePathPrefix
                      ? `${fileItem.relativePathPrefix}/${fileItem.name}`
                      : fileItem.name}
                  </div>
                )}
                <div className="text-xs text-muted-foreground dark:text-muted-foreground mt-1">
                  {isDirectory ? '' : formatFileSize(fileItem?.size || 0)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // 默认返回列表视图
  return (
    <div className="flex-1 overflow-x-auto overflow-y-auto">
      <table
        className="text-sm text-left"
        style={{ minWidth: showsmartName ? '1400px' : '1000px' }}
      >
        <colgroup>
          <col style={{ width: '32px' }} />
          {showsmartName && <col style={{ minWidth: '400px' }} />}
          {!showsmartName && <col style={{ minWidth: '400px' }} />}
          {shouldShowField('qualityScore') && <col style={{ width: '120px' }} />}
          {shouldShowField('description') && <col style={{ minWidth: '200px' }} />}
          {shouldShowField('tags') && <col style={{ minWidth: '400px' }} />}
          {shouldShowField('author') && <col style={{ width: '120px' }} />}
          {shouldShowField('language') && <col style={{ width: '100px' }} />}
          {showAnalysisStatus && <col style={{ width: '120px' }} />}
          <col style={{ width: '180px' }} />
          <col style={{ width: '100px' }} />
          <col style={{ width: '100px' }} />
        </colgroup>
        <thead className="bg-gray-50 sticky top-0 z-10">
          <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <th className="p-2 w-10">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                checked={selectedFiles.length === items.length && items.length > 0}
                onChange={e => {
                  if (e.target.checked) {
                    onFileSelect(
                      items.map(item => item.path),
                      true
                    )
                  } else {
                    onFileSelect([], true)
                  }
                }}
                title={
                  selectedFiles.length === items.length && items.length > 0
                    ? t('取消全选')
                    : t('全选所有项目')
                }
              />
            </th>
            {showsmartName && (
              <th
                className="p-2 font-medium whitespace-nowrap truncate hover:bg-gray-100 cursor-default transition-colors"
                title={t('AI生成的智能文件名')}
              >
                {t('智能文件名')}
              </th>
            )}
            {!showsmartName && (
              <th
                className="p-2 font-medium truncate hover:bg-gray-100 cursor-default transition-colors"
                title={t('文件名称')}
              >
                {t('名称')}
              </th>
            )}
            {shouldShowField('qualityScore') && (
              <th
                className="p-2 font-medium whitespace-nowrap truncate hover:bg-gray-100 cursor-default transition-colors"
                title={t('AI质量评分')}
              >
                {getFieldLabel('qualityScore')}
              </th>
            )}
            {shouldShowField('description') && (
              <th
                className="p-2 font-medium whitespace-nowrap truncate hover:bg-gray-100 cursor-default transition-colors"
                title={t('文件描述')}
              >
                {getFieldLabel('description')}
              </th>
            )}
            {shouldShowField('tags') && (
              <th
                className="p-2 font-medium whitespace-nowrap truncate hover:bg-gray-100 cursor-default transition-colors"
                title={t('文件标签')}
              >
                {getFieldLabel('tags')}
              </th>
            )}
            {shouldShowField('author') && (
              <th
                className="p-2 font-medium whitespace-nowrap truncate hover:bg-gray-100 cursor-default transition-colors"
                title={t('作者')}
              >
                {getFieldLabel('author')}
              </th>
            )}
            {shouldShowField('language') && (
              <th
                className="p-2 font-medium whitespace-nowrap truncate hover:bg-gray-100 cursor-default transition-colors"
                title={t('语言')}
              >
                {getFieldLabel('language')}
              </th>
            )}
            {showAnalysisStatus && (
              <th
                className="p-2 font-medium whitespace-nowrap truncate hover:bg-gray-100 cursor-default transition-colors"
                title={t('AI分析状态')}
              >
                {t('分析状态')}
              </th>
            )}
            <th
              className="p-2 font-medium whitespace-nowrap truncate hover:bg-gray-100 cursor-default transition-colors"
              title={t('最后修改时间')}
            >
              {t('修改日期')}
            </th>
            <th
              className="p-2 font-medium whitespace-nowrap truncate hover:bg-gray-100 cursor-default transition-colors"
              title={t('文件类型')}
            >
              {t('类型')}
            </th>
            <th
              className="p-2 font-medium whitespace-nowrap truncate hover:bg-gray-100 cursor-default transition-colors"
              title={t('文件大小')}
            >
              {t('大小')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item, index) => (
            <RowRenderer key={item.path || index} index={index} style={{}} data={itemData} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
