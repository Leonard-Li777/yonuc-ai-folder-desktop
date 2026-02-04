import { LogCategory, logger } from '@yonuc/shared'
import { MaterialIcon, cn } from '../../lib/utils'
import React, { useEffect, useRef, useState } from 'react'

import { LatestNewsItem } from '@yonuc/types/config-types'
import { SearchBar } from '../common/SearchBar'
import { SettingsButton } from '../settings/settings-button'
import { WorkspaceDirectory } from '@yonuc/types'
import { t } from '@app/languages'
import { useConfigStore } from '../../stores/config-store'
import { useNavigate } from 'react-router-dom'
import logoIcon from '../../assets/icon.ico'

interface DirectoryHeaderProps {
  currentWorkspaceDirectory: WorkspaceDirectory | null
  workspaceDirectories: WorkspaceDirectory[]
  showDirectoryDropdown: boolean
  isRealDirectory: boolean // true for real directory, false for virtual directory
  onToggleDirectoryDropdown: () => void
  onSelectWorkspaceDirectory: (directory: WorkspaceDirectory) => Promise<void>
  onAddWorkspaceDirectory: (type?: 'SPEEDY' | 'PRIVATE') => Promise<void>
  dropdownRef: React.RefObject<HTMLDivElement | null>
  onSearch: (keyword: string) => void // 搜索回调
}

export const DirectoryHeader: React.FC<DirectoryHeaderProps> = ({
  currentWorkspaceDirectory,
  workspaceDirectories,
  showDirectoryDropdown,
  isRealDirectory,
  onToggleDirectoryDropdown,
  onSelectWorkspaceDirectory,
  onAddWorkspaceDirectory,
  dropdownRef,
  onSearch
}) => {
  const navigate = useNavigate()
  const [isMaximized, setIsMaximized] = useState(false)
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false)

  // 消息轮播相关
  const config = useConfigStore(state => state.config)
  const latestNews = (config?.LATEST_NEWS as LatestNewsItem[]) || []
  const [currentNewsIndex, setCurrentNewsIndex] = useState(0)
  const newsTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    logger.info(LogCategory.RENDERER, '📰 [DirectoryHeader] 消息列表状态更新:', {
      count: latestNews.length,
      firstNews: latestNews[0]?.text,
      allNews: latestNews
    })
  }, [latestNews])

  useEffect(() => {
    const checkMaximized = async () => {
      if (window.electronAPI?.window?.isMaximized) {
        const maximized = await window.electronAPI.window.isMaximized()
        setIsMaximized(maximized)
      }
    }
    checkMaximized()
  }, [])

  // 轮播逻辑
  useEffect(() => {
    if (latestNews.length <= 1) {
      if (newsTimerRef.current) clearInterval(newsTimerRef.current)
      return
    }

    newsTimerRef.current = setInterval(() => {
      setCurrentNewsIndex(prev => (prev + 1) % latestNews.length)
    }, 5000)

    return () => {
      if (newsTimerRef.current) clearInterval(newsTimerRef.current)
    }
  }, [latestNews.length])

  const handleNewsClick = (url: string) => {
    if (url && window.electronAPI?.utils?.openExternal) {
      window.electronAPI.utils.openExternal(url)
    }
  }

  const handleMinimize = () => {
    window.electronAPI.window.minimize()
  }

  const handleMaximize = async () => {
    if (window.electronAPI?.window?.maximize) {
      await window.electronAPI.window.maximize()
      const maximized = await window.electronAPI.window.isMaximized()
      setIsMaximized(maximized)
    }
  }

  const handleClose = () => {
    window.electronAPI.window.close()
  }

  // 当任何下拉菜单打开时，禁用拖拽，以便点击事件可以正常传播到关闭逻辑
  const isAnyDropdownOpen = showDirectoryDropdown || isSearchDropdownOpen

  return (
    <header
      className="relative flex-shrink-0 dark:bg-muted bg-linear-to-b from-0% from-black/10 via-10% via-black/30 to-90%  to-transparent border-b border-border flex items-center justify-between px-4 py-4"
      style={{ WebkitAppRegion: isAnyDropdownOpen ? 'no-drag' : 'drag' } as React.CSSProperties}
    >
      {/* Window Controls - positioned with z-index to be on top */}
      <div
        className="absolute top-5 right-2 flex items-center space-x-1 z-50"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          title={t('最小化')}
        >
          <MaterialIcon icon="minimize" className="text-muted-foreground text-lg leading-none" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          title={isMaximized ? t('恢复') : t('最大化')}
        >
          <MaterialIcon
            icon={isMaximized ? 'fullscreen_exit' : 'fullscreen'}
            className="text-muted-foreground text-lg leading-none"
          />
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-destructive hover:text-destructive-foreground transition-colors cursor-pointer"
          title={t('关闭')}
        >
          <MaterialIcon icon="close" className="text-muted-foreground text-lg leading-none" />
        </button>
      </div>

      {/* Left Side: Logo and Notification */}
      <div className="flex items-center space-x-4 min-w-0 flex-1 overflow-hidden">
        {/* Logo and Title */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          <img src={logoIcon} className="w-6 h-6 object-contain flex-shrink-0" alt="logo" />
          <span className="text-base font-semibold text-foreground dark:text-foreground">
            {t('萤核智能文件夹')}
          </span>
        </div>

        {/* System Notification / News Carousel */}
        <div
          className="flex items-center space-x-2 text-xs px-3 py-1 text-primary transition-all duration-500 min-w-0 flex-1 overflow-hidden"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {latestNews.length > 0 ? (
            <div
              className={cn(
                'flex items-center gap-2 bg-primary/10 px-2 py-0.5 rounded-full animate-in fade-in slide-in-from-left-1 duration-500 min-w-0 overflow-hidden',
                latestNews[currentNewsIndex]?.url ? 'cursor-pointer hover:bg-primary/20' : ''
              )}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              onClick={() =>
                latestNews[currentNewsIndex]?.url &&
                handleNewsClick(latestNews[currentNewsIndex].url)
              }
            >
              <span className="flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
              <span className="flex-1 min-w-0 truncate" title={latestNews[currentNewsIndex]?.text}>
                {latestNews[currentNewsIndex]?.text}
              </span>
            </div>
          ) : (
            <span className="truncate">{t('AI 摘要功能已上线!')}</span>
          )}
        </div>
      </div>

      {/* Right Side: Controls */}
      <div className="flex items-center space-x-4 flex-shrink-0 justify-end mr-28">
        {/* Directory Selector */}
        <div
          className="relative flex-shrink-0"
          ref={dropdownRef}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            className="flex items-center space-x-2 px-3 py-2 hover:bg-accent hover:text-accent-foreground hover:border-border rounded-md transition-all duration-200 hover:shadow-sm text-foreground dark:text-foreground cursor-pointer"
            onClick={onToggleDirectoryDropdown}
            title={t('当前工作目录: {name}，点击切换', {
              name: currentWorkspaceDirectory?.name || t('未选择')
            })}
          >
            <MaterialIcon
              icon={isRealDirectory ? 'folder_open' : 'folder_special'}
              className="text-muted-foreground dark:text-muted-foreground"
            />
            <span className="text-sm font-medium truncate max-w-[200px]">
              {t('工作目录: {name}', { name: currentWorkspaceDirectory?.name || t('未选择') })}
            </span>
            <MaterialIcon
              icon="arrow_drop_down"
              className="text-muted-foreground dark:text-muted-foreground"
            />
          </button>

          {/* Directory Dropdown */}
          {showDirectoryDropdown && (
            <div className="absolute top-full left-0 mt-1 w-80 bg-popover border border-border rounded-md shadow-lg z-50">
              <div className="max-h-60 overflow-y-auto">
                {workspaceDirectories.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {t('暂无工作目录')}
                  </div>
                ) : (
                  workspaceDirectories.map(directory => (
                    <button
                      key={directory.path}
                      className={cn(
                        'w-full flex items-center space-x-3 px-3 py-2 text-sm text-left transition-colors cursor-pointer',
                        currentWorkspaceDirectory?.path === directory.path
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                      onClick={() => onSelectWorkspaceDirectory(directory)}
                      title={t('切换到工作目录: {path}', { path: directory.path })}
                    >
                      <MaterialIcon
                        icon="folder"
                        className={cn(
                          'text-base',
                          currentWorkspaceDirectory?.path === directory.path
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{directory.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {directory.path}
                        </div>
                      </div>
                      {currentWorkspaceDirectory?.path === directory.path && (
                        <MaterialIcon icon="check" className="text-primary text-base" />
                      )}
                    </button>
                  ))
                )}
              </div>
              <div className="p-2 border-b border-border space-y-1">
                <button
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 rounded-md transition-colors cursor-pointer"
                  onClick={() => onAddWorkspaceDirectory('SPEEDY')}
                  title={t('创建极速目录（推荐）')}
                >
                  <MaterialIcon icon="rocket_launch" className="text-base" />
                  <span>{t('创建极速目录')}</span>
                </button>
                <button
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-md transition-colors cursor-pointer"
                  onClick={() => onAddWorkspaceDirectory('PRIVATE')}
                  title={t('创建私有目录')}
                >
                  <MaterialIcon icon="lock" className="text-base" />
                  <span>{t('创建私有目录')}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Real/Virtual Toggle */}
        <div
          className="flex bg-muted border border-border rounded-md overflow-hidden shadow-sm flex-shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            className={cn(
              'px-4 py-2 text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer',
              isRealDirectory
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
            onClick={() => navigate('/real-directory')}
            title={t('切换到真实文件系统视图')}
          >
            {t('真实目录')}
          </button>
          <button
            className={cn(
              'px-4 py-2 text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer',
              !isRealDirectory
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
            onClick={() => navigate('/virtual-directory')}
            title={t('切换到AI智能分类视图')}
          >
            {t('虚拟目录')}
          </button>
        </div>

        {/* Search Bar */}
        <div
          className="flex-1 max-w-xs min-w-[200px]"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <SearchBar
            type={isRealDirectory ? 'real-directory' : 'virtual-directory'}
            placeholder={
              isRealDirectory
                ? t('搜索文件、标签、作者或内容...')
                : t('搜索标签、描述、智能文件名...')
            }
            onSearch={onSearch}
            className="w-full"
            onToggleSuggestions={setIsSearchDropdownOpen}
          />
        </div>

        {/* Settings Button */}
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <SettingsButton
            variant="ghost"
            className="text-sm hover:bg-accent hover:text-accent-foreground hover:shadow-sm text-muted-foreground transition-all duration-200 whitespace-nowrap cursor-pointer"
          >
            <MaterialIcon icon="settings" className="text-base mr-1" />
            {t('设置')}
          </SettingsButton>
        </div>
      </div>
    </header>
  )
}
