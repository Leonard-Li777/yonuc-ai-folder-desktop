import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { FileList } from './FileList'
import { FileDetailsPanel } from './FileDetailsPanel'
import { DirectoryHeader } from './DirectoryHeader'
import { useFileExplorerStore } from '../../stores/app-store'
import { MaterialIcon } from '../../lib/utils'
import { Button } from '../ui/button'
import {
  WorkspaceDirectory,
  FileItem as FileType,
  DirectoryItem,
} from '@yonuc/types'
import { useAnalysisQueueStore } from '../../stores/analysis-queue-store'
import { useSearchStore } from '../../stores/search-store'
import { useSettingsStore } from '../../stores/settings-store'
import { NoWorkspaceDirectoryMessage } from '../common/NoWorkspaceDirectoryMessage'
import { InvitationModal } from '../invitation/InvitationModal'
import { toast } from '../common/Toast'
import { t } from '@app/languages'
import { logger, LogCategory } from '@yonuc/shared'
import { useInvitation } from '../../hooks/useInvitation'

interface RealDirectoryProps {
  onFileSelect?: (files: any[], isFromCheckbox?: boolean) => void
  onDirectoryChange?: (path: string) => void
}

export const RealDirectory: React.FC<RealDirectoryProps> = ({
  onFileSelect: externalOnFileSelect,
  onDirectoryChange,
}) => {
  const navigate = useNavigate()

  // 内部处理文件选择的函敶
  const handleFileSelect = (
    newSelection: (string | FileType | DirectoryItem)[],
    isFromCheckbox = false
  ) => {
    const { selectedFiles, setSelectedFiles } = useFileExplorerStore.getState()

    const normalizePath = (p?: string) => (p ? p.replace(/\\/g, '/') : '')
    const resolveByPath = (path: string) => {
      const { directories, files } = useFileExplorerStore.getState()
      const all = [...directories, ...files]
      const n = normalizePath(path)
      return all.find(it => normalizePath((it as any).path) === n) || null
    }
    const toObjectEntry = (entry: string | FileType | DirectoryItem) => {
      if (entry && typeof entry === 'object') return entry as FileType | DirectoryItem
      const path = typeof entry === 'string' ? entry : ''
      if (!path) return null
      return resolveByPath(path)
    }
    const getEntryPath = (entry: string | FileType | DirectoryItem) =>
      typeof entry === 'object' ? ((entry as any).path as string) : entry || ''

    if (isFromCheckbox) {
      // Create a set of the current selection paths for efficient lookup
      const currentSelectionPaths = new Set(
        selectedFiles.filter(f => !!(f as any).path).map((f: any) => normalizePath(f.path))
      )
      // Create a set of the new selection paths
      const newSelectionPaths = new Set(
        newSelection.map(e => normalizePath(getEntryPath(e))).filter(Boolean)
      )

      // Determine which files to add and which to remove
      const filesToAdd = newSelection
        .filter(e => {
          const p = normalizePath(getEntryPath(e))
          return p && !currentSelectionPaths.has(p)
        })
        .map(toObjectEntry)
        .filter(Boolean) as (FileType | DirectoryItem)[]
      const filesToRemove = selectedFiles.filter((f: any) => {
        const p = normalizePath(f.path)
        return p && !newSelectionPaths.has(p)
      })

      let updatedSelection = [...selectedFiles]

      if (filesToAdd.length > 0) {
        updatedSelection = [...updatedSelection, ...(filesToAdd as FileType[])]

      }
      if (filesToRemove.length > 0) {
        const pathsToRemove = new Set(
          filesToRemove.filter(f => !!f.path).map(f => normalizePath(f.path))
        )
        updatedSelection = updatedSelection.filter(
          f => !pathsToRemove.has(f.path.replace(/\\/g, '/'))
        )
      }

      // 处理目录递归选择
      const directorySelected = newSelection
        .map(toObjectEntry)
        .find(obj => !!obj && (obj as any).isDirectory) as DirectoryItem | undefined

      if (directorySelected) {
        const isSelected = directorySelected.path
          ? newSelectionPaths.has(normalizePath(directorySelected.path))
          : false
        const allItems = [
          ...useFileExplorerStore.getState().directories,
          ...useFileExplorerStore.getState().files,
        ]

        const getAllChildItems = (dirPath: string): (FileType | DirectoryItem)[] => {
          const children = allItems.filter(
            item => normalizePath((item as any).parentPath) === normalizePath(dirPath)
          )
          let allChildren = [...children]
          children.forEach(child => {
            if ('isDirectory' in child && child.isDirectory) {
              allChildren = [...allChildren, ...getAllChildItems(child.path)]
            }
          })
          return allChildren
        }

        const childItems = getAllChildItems(directorySelected.path || '')
        const childPaths = new Set(
          childItems.filter(item => !!item.path).map(item => normalizePath(item.path))
        )

        if (isSelected) {
          const itemsToAdd = [directorySelected, ...childItems].filter(
            item => !currentSelectionPaths.has(normalizePath(item.path))
          )
          updatedSelection = [...updatedSelection, ...(itemsToAdd as FileType[])]
        } else {
          const pathsToRemove = new Set([normalizePath(directorySelected.path), ...childPaths])
          updatedSelection = updatedSelection.filter(
            (f: unknown) => !pathsToRemove.has(normalizePath((f as FileType).path))
          )
        }
      }

      setSelectedFiles(updatedSelection)
    } else {
      // For single-item clicks, update only the details panel, not the selection state
      // This ensures clicking a directory name only shows details, without adding it to any list
      if (newSelection.length > 0) {
        const selectedItemObject = toObjectEntry(newSelection[0])
        if (selectedItemObject) {
          // Check if clicking the same item to toggle selection
          if (selectedItem && selectedItem.path === selectedItemObject.path) {
            setSelectedItem(null)
          } else {
            setSelectedItem(selectedItemObject)
          }
          setShowDetailsPanel(true)
          // Note: We intentionally do NOT modify selectedFiles here to avoid confusion
          // Only checkbox interactions should modify the selection
        }
      } else {
        setSelectedItem(null)
        setShowDetailsPanel(true)
      }
    }

    if (externalOnFileSelect) {
      externalOnFileSelect(newSelection, isFromCheckbox)
    }
  }
  const {
    currentPath,
    files: storeFiles,
    directories: storeDirectories,
    selectedFiles,
    setCurrentPath,
    toggleDirectory,
    expandDirectory,
    collapseDirectory,
  } = useFileExplorerStore()

  // 使用 useMemo 稳定 files 和 directories 的引用，避免不必要的重新渲染
  // 只有当数组长度或第一个/最后一个元素的路径变化时才更新
  const files = useMemo(() => storeFiles, [
    storeFiles.length,
    storeFiles[0]?.path,
    storeFiles[storeFiles.length - 1]?.path
  ])
  
  const directories = useMemo(() => storeDirectories, [
    storeDirectories.length,
    storeDirectories[0]?.path,
    storeDirectories[storeDirectories.length - 1]?.path
  ])

  const { config } = useSettingsStore()
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(config.defaultView || 'list')
  const [workspaceDirectories, setWorkspaceDirectories] = useState<WorkspaceDirectory[]>([])
  const [currentWorkspaceDirectory, setCurrentWorkspaceDirectory] =
    useState<WorkspaceDirectory | null>(null)
  const [showDirectoryDropdown, setShowDirectoryDropdown] = useState(false)
  const [selectedItem, setSelectedItem] = useState<FileType | DirectoryItem | null>(null)
  const [showDetailsPanel, setShowDetailsPanel] = useState(true)

  // 邀请相关状态
  const [showInvitationModal, setShowInvitationModal] = useState(false)
  const { invitationCount, refreshCount: refreshInvitationCount, isLoading: isInvitationLoading } = useInvitation(true)
  const [machineId, setMachineId] = useState('')
  const [navigationHistory, setNavigationHistory] = useState<string[]>([])
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1)
  const [isHistoryNavigation, setIsHistoryNavigation] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // analysis queue store
  const { snapshot, openModal, addItems, start } = useAnalysisQueueStore()

  // search store
  const { realDirectoryKeyword, setRealDirectoryKeyword, clearRealDirectorySearch } =
    useSearchStore()

  // 监听defaultView配置变化
  useEffect(() => {
    if (config.defaultView) {
      setViewMode(config.defaultView)
    }
  }, [config.defaultView])

  // 过滤文件和目录（根据搜索关键词）
  const filteredData = useMemo(() => {
    if (!realDirectoryKeyword.trim()) {
      return { files, directories }
    }

    const keyword = realDirectoryKeyword.toLowerCase().trim()

    const filteredFiles = files.filter(file => {
      // 搜索文件名
      if (file.name.toLowerCase().includes(keyword)) return true
      // 搜索文件路径
      if (file.path.toLowerCase().includes(keyword)) return true
      // 搜索文件扩展名
      if (file.extension && file.extension.toLowerCase().includes(keyword)) return true
      return false
    })

    const filteredDirs = directories.filter(dir => {
      // 搜索目录名
      if (dir.name.toLowerCase().includes(keyword)) return true
      // 搜索目录路径
      if (dir.path.toLowerCase().includes(keyword)) return true
      return false
    })

    return { files: filteredFiles, directories: filteredDirs }
  }, [files, directories, realDirectoryKeyword])

  // 点击外部区域关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDirectoryDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // 获取工作目录
  useEffect(() => {
    const loadWorkspaceDirectories = async () => {
      try {
        // 预加载机器ID
        try {
          const mId = await window.electronAPI.getMachineId()
          setMachineId(mId)
        } catch (e) {
          logger.error(LogCategory.RENDERER, 'Failed to get machine ID:', e)
        }

        const directories = await window.electronAPI.getAllWorkspaceDirectories()
        setWorkspaceDirectories(directories)

        const currentDir = await window.electronAPI.getCurrentWorkspaceDirectory()
        setCurrentWorkspaceDirectory(currentDir)

        // 如果有当前工作目录，设置当前路径
        if (currentDir) {
          setCurrentPath(currentDir.path)
        } else {
          // 如果没有工作目录，清空当前路径
          setCurrentPath('')
        }
      } catch (error) {
        logger.error(LogCategory.RENDERER, '获取工作目录失败:', error)
        // 出错时也清空当前路径
        setCurrentPath('')
      }
    }

    loadWorkspaceDirectories()

    // 监听工作目录更新事件
    const unsubscribe = window.electronAPI.onWorkspaceDirectoriesUpdated?.(() => {
      logger.info(LogCategory.RENDERER, '工作目录已更新，重新加载...')
      loadWorkspaceDirectories()
    })

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [])

  // 获取当前目录的文件列表
  useEffect(() => {
    const loadDirectoryContents = async () => {
      if (!currentPath || !currentWorkspaceDirectory) return // 只有在有工作目录且路径存在时才加载内容

      try {
        const { files, directories } = await window.electronAPI.readDirectory(currentPath)
        logger.info(LogCategory.RENDERER, '接收到目录数据', { 
          currentPath, 
          filesCount: files.length, 
          directoriesCount: directories.length,
          directoryNames: directories.map(d => d.name)
        })
        useFileExplorerStore.getState().setFiles(files)
        useFileExplorerStore.getState().setDirectories(directories)
        logger.info(LogCategory.RENDERER, '已更新store', { 
          storeFilesCount: useFileExplorerStore.getState().files.length,
          storeDirectoriesCount: useFileExplorerStore.getState().directories.length
        })
      } catch (error) {
        logger.error(LogCategory.RENDERER, '读取目录失败:', error)
        // 读取失败时清空文件和目录
        useFileExplorerStore.getState().setFiles([])
        useFileExplorerStore.getState().setDirectories([])
      }
    }

    loadDirectoryContents()
  }, [currentPath, currentWorkspaceDirectory]) // 依赖中添加 currentWorkspaceDirectory

  // 更新导航历史记录
  useEffect(() => {
    if (currentPath && navigationHistory[currentHistoryIndex] !== currentPath) {
      // 如果是历史导航（后退/前进），不添加新历史记录
      if (isHistoryNavigation) {
        setIsHistoryNavigation(false)
        return
      }

      // 否则，添加新的历史记录
      setNavigationHistory(prev => {
        const newHistory = prev.slice(0, currentHistoryIndex + 1)
        newHistory.push(currentPath)
        return newHistory
      })
      setCurrentHistoryIndex(prev => prev + 1)
    }
  }, [currentPath, isHistoryNavigation, navigationHistory, currentHistoryIndex])

  // 选择工作目录
  const handleSelectWorkspaceDirectory = async (directory: WorkspaceDirectory) => {
    try {
      await window.electronAPI.setCurrentWorkspaceDirectory(directory.path)
      setCurrentWorkspaceDirectory(directory)
      setCurrentPath(directory.path)
      setShowDirectoryDropdown(false)
      // 重置导航历史，确保工作空间切换时历史被隔离
      setNavigationHistory([])
      setCurrentHistoryIndex(-1)

      if (onDirectoryChange) {
        onDirectoryChange(directory.path)
      }
    } catch (error) {
      logger.error(LogCategory.RENDERER, '设置当前工作目录失败:', error)
    }
  }

  // 添加工作目录
  const handleAddWorkspaceDirectory = async (type: 'SPEEDY' | 'PRIVATE' = 'SPEEDY') => {
    // 检查私有目录权限
    if (type === 'PRIVATE') {
      // 1. 检查本地状态
      const isUnlocked = config.isPrivateDirectoryUnlocked
      
      if (!isUnlocked) {
        try {
          // 2. 校验云端进度
          const countResult = await window.electronAPI.invitation.getCount()
          // Correctly parse the result (it's a raw number now)
          const count = typeof countResult === 'object' && countResult !== null && 'count' in countResult 
            ? countResult.count 
            : (typeof countResult === 'number' ? countResult : 0);
          
          // 3. 分支处理
          if (count < 3) {
            // CASE 邀请人数 < 3
            // We rely on useInvitation hook for count state, but here we just need to check the value.
            // setInvitationCount was removed when we switched to useInvitation hook.
            // The hook will update the count on refresh.
            await refreshInvitationCount();
            
            if (!machineId) {
              const mId = await window.electronAPI.getMachineId()
              setMachineId(mId)
            }
            setShowInvitationModal(true)
            return
          } else {
            // CASE 邀请人数 >= 3
            // 更新本地配置文件：设置 isPrivateDirectoryUnlocked = true
            await window.electronAPI.updateConfigValue('IS_PRIVATE_DIRECTORY_UNLOCKED', true)
            // 继续执行“新建私有目录”逻辑
          }
        } catch (error) {
          logger.error(LogCategory.RENDERER, 'Failed to check invitation count:', error)
          toast.error(t('无法验证邀请状态，请稍后重试'))
          return
        }
      }
    }

    try {
      const result = await window.electronAPI.utils.showOpenDialog({
        properties: ['openDirectory'],
      })

      if (!result.canceled && result.filePaths.length > 0) {
        const directoryPath = result.filePaths[0]
        const directoryName = directoryPath.split(/[\\/]/).pop() || directoryPath

        const newDirectory: WorkspaceDirectory = {
          path: directoryPath,
          name: directoryName,
          type: type,
          recursive: true,
          isActive: true,
          lastScanAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        await window.electronAPI.addWorkspaceDirectory(newDirectory)

        // 重新加载工作目录
        const directories = await window.electronAPI.getAllWorkspaceDirectories()
        setWorkspaceDirectories(directories)

        // 设置为当前目录
        await handleSelectWorkspaceDirectory(newDirectory)
      }
    } catch (error) {
      logger.error(LogCategory.RENDERER, '添加工作目录失败:', error)
    }
  }

  const handleBack = () => {
    if (currentHistoryIndex > 0) {
      const previousPath = navigationHistory[currentHistoryIndex - 1]
      setIsHistoryNavigation(true)
      setCurrentHistoryIndex(prev => prev - 1)
      setCurrentPath(previousPath)
      // 清空搜索关键词，避免过滤目录
      clearRealDirectorySearch()
      if (onDirectoryChange) {
        onDirectoryChange(previousPath)
      }
    }
  }

  const handleForward = () => {
    if (currentHistoryIndex < navigationHistory.length - 1) {
      const nextPath = navigationHistory[currentHistoryIndex + 1]
      setIsHistoryNavigation(true)
      setCurrentHistoryIndex(prev => prev + 1)
      setCurrentPath(nextPath)
      // 清空搜索关键词，避免过滤目录
      clearRealDirectorySearch()
      if (onDirectoryChange) {
        onDirectoryChange(nextPath)
      }
    }
  }

  const handleUp = () => {
    console.log('handleUp called', {
      currentPath,
      currentWorkspaceDirectory: currentWorkspaceDirectory?.path,
      realDirectoryKeyword, // 添加搜索关键词日志
    })

    // 检查是否应该禁用向上导航
    if (isUpButtonDisabled()) {
      console.log('Up button is disabled - already at workspace directory root')
      return
    }

    // 使用更健壮的路径处理函数
    const parentPath = getParentPath(currentPath)
    console.log('Navigating to parent path:', parentPath)
    
    // 清空搜索关键词，避免过滤目录
    console.log('Clearing search keyword before navigation')
    clearRealDirectorySearch()
    console.log('Search keyword after clear:', realDirectoryKeyword)
    
    setCurrentPath(parentPath)
    if (onDirectoryChange) {
      onDirectoryChange(parentPath)
    }
  }

  // 获取父路径的辅助函数，保持Windows原生路径格式（反斜杠）
  const getParentPath = (currentPath: string): string => {
    if (!currentPath || currentPath === '') {
      return ''
    }

    // 检查是否为Windows盘符根目录（如 C:\ 或 C:）
    if (/^[A-Za-z]:\\?$/.test(currentPath)) {
      return currentPath.endsWith('\\') ? currentPath : currentPath + '\\'
    }

    // 移除末尾的斜杠
    const cleanPath = currentPath.replace(/[\\\/]+$/, '')

    // 使用 path.dirname 的逻辑，但保持原生分隔符
    const lastSeparatorIndex = Math.max(
      cleanPath.lastIndexOf('\\'),
      cleanPath.lastIndexOf('/')
    )

    if (lastSeparatorIndex === -1) {
      return ''
    }

    const parentPath = cleanPath.substring(0, lastSeparatorIndex)

    // 如果父路径是盘符（如 C:），添加反斜杠
    if (/^[A-Za-z]:$/.test(parentPath)) {
      return parentPath + '\\'
    }

    return parentPath || ''
  }

  // 检查向上按钮是否应该被禁用
  const isUpButtonDisabled = () => {
    // 用户操作总是限制在工作目录范围内，所以必须有工作目录
    if (!currentWorkspaceDirectory) {
      return true // 没有工作目录时禁用向上按钮
    }

    // 只要当前目录是工作目录根目录，就禁用向上按钮
    const normalizedCurrentPath = currentPath.replace(/\\/g, '/')
    const normalizedWorkspacePath = currentWorkspaceDirectory.path
      ? currentWorkspaceDirectory.path.replace(/\\/g, '/')
      : ''

    return normalizedCurrentPath === normalizedWorkspacePath
  }

  const handleDirectoryChange = (path: string) => {
    setCurrentPath(path)
    // 确保当前目录被展开，以便显示其子目录
    expandDirectory(path)
    // 同时展开父目录，确保目录树结构正确
    const parentPath = path.split('/').slice(0, -1).join('/') || '/'
    if (parentPath !== '/') {
      expandDirectory(parentPath)
    }
    // 清空选中状态
    setSelectedItem(null)
    setShowDetailsPanel(true)
    useFileExplorerStore.getState().setSelectedFiles([])
    // 清空搜索关键词，避免过滤目录
    clearRealDirectorySearch()
    if (onDirectoryChange) {
      onDirectoryChange(path)
    }
  }

  // 搜索处理函数
  const handleSearch = (keyword: string) => {
    setRealDirectoryKeyword(keyword)
  }

  // 刷新当前目录内容的函数
  const refreshDirectoryContents = async () => {
    if (!currentPath || !currentWorkspaceDirectory) return
    try {
      const { files, directories } = await window.electronAPI.readDirectory(currentPath)
      useFileExplorerStore.getState().setFiles(files)
      useFileExplorerStore.getState().setDirectories(directories)
      logger.info(LogCategory.RENDERER, '目录内容已刷新:', currentPath)

      // 如果一个项目当前在详情面板中被选中，同样更新它的数据
      // 这是为了确保在分析完成后，详情面板的缩略图也能刷新
      if (selectedItem) {
        const allItems = [...files, ...directories]
        const updatedSelectedItem = allItems.find(it => it.path === selectedItem.path)
        if (updatedSelectedItem) {
          setSelectedItem(updatedSelectedItem)
        }
      }
    } catch (error) {
      logger.error(LogCategory.RENDERER, '刷新文件列表失败:', error)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-muted/10 overflow-hidden">
      {/* Shared Header */}
      <DirectoryHeader
        currentWorkspaceDirectory={currentWorkspaceDirectory}
        workspaceDirectories={workspaceDirectories}
        showDirectoryDropdown={showDirectoryDropdown}
        isRealDirectory={true}
        onToggleDirectoryDropdown={() => setShowDirectoryDropdown(!showDirectoryDropdown)}
        onSelectWorkspaceDirectory={handleSelectWorkspaceDirectory}
        onAddWorkspaceDirectory={handleAddWorkspaceDirectory}
        dropdownRef={dropdownRef}
        onSearch={handleSearch}
      />

      {currentWorkspaceDirectory ? (
        <div className="flex-1 flex overflow-x-auto overflow-y-hidden">
          <main className="flex-1 bg-card overflow-hidden flex">
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Navigation Bar / Toolbar */}
              <div className="flex-shrink-0 border-b border-border px-3 py-2 flex items-center justify-between bg-card">
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-foreground dark:text-foreground hover:bg-accent dark:hover:bg-accent"
                    onClick={handleBack}
                    disabled={currentHistoryIndex <= 0}
                  >
                    <MaterialIcon icon="arrow_back" className="text-xl" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-foreground dark:text-foreground hover:bg-accent dark:hover:bg-accent"
                    onClick={handleForward}
                    disabled={currentHistoryIndex >= navigationHistory.length - 1}
                  >
                    <MaterialIcon icon="arrow_forward" className="text-xl" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-foreground dark:text-foreground hover:bg-accent dark:hover:bg-accent"
                    onClick={handleUp}
                    disabled={isUpButtonDisabled()}
                  >
                    <MaterialIcon icon="arrow_upward" className="text-xl" />
                  </Button>
                  <div className="text-sm font-medium text-foreground dark:text-foreground ml-3 truncate flex-shrink min-w-0">
                    {currentPath}
                  </div>
                </div>
                <div className="flex items-center space-x-2 text-foreground dark:text-foreground">
                  {/* View Mode Toggle */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-foreground dark:text-foreground hover:bg-accent dark:hover:bg-accent"
                    onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
                    title={viewMode === 'list' ? t('切换为缩略图视图'): t('切换为列表视图')}
                  >
                    <MaterialIcon
                      icon={viewMode === 'list' ? 'view_list' : 'grid_view'}
                      className="text-xl"
                    />
                  </Button>
                  <Button
                    variant={selectedFiles.length ? 'default' : 'secondary'}
                    size="sm"
                    className="gap-1"
                    onClick={async () => {
                      const { selectedFiles } = useFileExplorerStore.getState()
                      
                      // 使用 Map 去重，避免同一个文件被添加多次
                      const uniqueFiles = new Map<string, any>();
                      selectedFiles.forEach((f: any) => {
                        if (f?.path && !uniqueFiles.has(f.path)) {
                          uniqueFiles.set(f.path, f);
                        }
                      });

                      const filesToAdd = Array.from(uniqueFiles.values())
                        .map((f: any) => ({
                          path: f?.path,
                          name: f?.name,
                          size: f?.isDirectory ? 0 : f?.size || 0,
                          type: f?.isDirectory ? 'folder' : f?.extension || 'file',
                        }))
                        .filter(i => !!i.path)

                      if (filesToAdd.length > 0) {
                        await addItems(filesToAdd)
                        await start()
                      }
                    }}
                  >
                    <MaterialIcon icon="auto_awesome" className="text-base" />
                    <span>{t('立即分析')}</span>
                  </Button>
                  <Button variant="secondary" size="sm" className="gap-1" onClick={openModal}>
                    {t('分析队列 ({length}/{snapshotLength})', {length: snapshot.items.filter(i => i.status !== 'completed').length, snapshotLength: snapshot.items.length})}
                  </Button>
                </div>
              </div>

              {/* File List - 只有这个区域可以滚动 */}
              <div className="flex-1 overflow-auto bg-muted dark:bg-muted">
                <FileList
                  files={filteredData.files}
                  directories={filteredData.directories}
                  selectedFiles={selectedFiles}
                  activeItem={selectedItem}
                  onFileSelect={handleFileSelect}
                  onDirectoryChange={handleDirectoryChange}
                  viewMode={viewMode}
                  currentPath={currentPath}
                  isRealDirectory={true}
                  workspaceDirectoryPath={currentWorkspaceDirectory?.path}
                />
              </div>
            </div>

            {/* File Details Panel - 固定位置,右侧吸附 */}
            {showDetailsPanel && (
              <FileDetailsPanel
                item={selectedItem || undefined}
                workspaceDirectoryPath={currentWorkspaceDirectory?.path}
                onClose={() => setShowDetailsPanel(false)}
                onFileDeleted={refreshDirectoryContents}
                onFileUpdated={refreshDirectoryContents}
              />
            )}
          </main>
        </div>
      ) : (
        <NoWorkspaceDirectoryMessage onAddWorkspaceDirectory={handleAddWorkspaceDirectory} />
      )}

      {/* 邀请提示弹窗 */}
      <InvitationModal
        isOpen={showInvitationModal}
        onClose={() => setShowInvitationModal(false)}
        invitationCount={invitationCount}
        machineId={machineId}
        onRefresh={async () => {
          const newCount = await refreshInvitationCount()
          if (newCount >= 3) {
            await window.electronAPI.updateConfigValue('IS_PRIVATE_DIRECTORY_UNLOCKED', true)
            toast.success(t('恭喜！您已满足邀请条件，请重新点击创建私有目录'))
            setShowInvitationModal(false)
          } else {
            toast.info(t('当前邀请人数：{count}/3，还需要邀请 {need} 人', { 
              count: newCount, 
              need: 3 - newCount 
            }))
          }
        }}
        isLoading={isInvitationLoading}
      />
    </div>
  )
}

