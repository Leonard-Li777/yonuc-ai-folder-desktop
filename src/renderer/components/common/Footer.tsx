import React from 'react'
import { useModelStore } from '@/renderer/stores/model-store'
import { MaterialIcon } from '@/renderer/lib/utils'
import { useAnalysisQueueStore } from '@/renderer/stores/analysis-queue-store'
import { AIServiceStatus } from '@yonuc/types'
import { t } from '@app/languages'

/**
 * 应用底部状态栏组件
 */
export function Footer () {
  const { modelName, serviceStatus, modelMode, lastError, provider } = useModelStore()
  const { snapshot, openModal } = useAnalysisQueueStore()

  function getFooterDisplay (status: AIServiceStatus) {
    const modeName = modelMode === 'local' ? t('本地') : t('云端')
    let modelInfo = `[${modeName}]`

    if (modelMode === 'cloud') {
      const displayProvider = provider || ''
      
      if (displayProvider && modelName) {
        modelInfo = `[${modeName}] ${displayProvider} - ${modelName}`
      } else if (modelName) {
        modelInfo = `[${modeName}] ${modelName}`
      }
    } else if (modelMode === 'local' && modelName) {
      modelInfo = `[${modeName}] ${modelName}`
    }

    switch (status) {
      case AIServiceStatus.UNINITIALIZED:
        return {
          text: t('AI 服务未就绪'),
          icon: 'radio_button_unchecked',
          color: 'text-gray-400'
        }
      case AIServiceStatus.CONFIGURING:
        return {
          text: t('正在配置 AI 服务...'),
          icon: 'settings',
          color: 'text-blue-400',
          animate: 'animate-spin'
        }
      case AIServiceStatus.INITIALIZING:
        return {
          text: t('正在初始化 AI 引擎...'),
          icon: 'sync',
          color: 'text-blue-500',
          animate: 'animate-spin'
        }
      case AIServiceStatus.RESTARTING:
        return {
          text: t('正在重启 AI 服务...'),
          icon: 'restart_alt',
          color: 'text-orange-400',
          animate: 'animate-spin'
        }
      case AIServiceStatus.STOPPED:
        return {
          text: t('AI 服务已停止'),
          icon: 'stop_circle',
          color: 'text-gray-500'
        }
      case AIServiceStatus.PENDING:
        return {
          text:
            modelMode === 'local'
              ? t('{modelInfo} 模型已就绪，等待加载', { modelInfo })
              : t('{modelInfo} 配置已加载，等待连接', { modelInfo }),
          icon: 'pause_circle_outline',
          color: 'text-blue-500'
        }
      case AIServiceStatus.LOADING:
        return {
          text: t('{modelInfo} 模型资源加载中...', { modelInfo }),
          icon: 'downloading',
          color: 'text-yellow-500',
          animate: 'animate-pulse'
        }
      case AIServiceStatus.CONNECTING:
        return {
          text: t('{modelInfo} 正在测试服务连接...', { modelInfo }),
          icon: 'swap_calls',
          color: 'text-orange-500',
          animate: 'animate-bounce'
        }
      case AIServiceStatus.IDLE:
        return {
          text: t('{modelInfo} AI 服务就绪', { modelInfo }),
          icon: 'check_circle',
          color: 'text-green-500'
        }
      case AIServiceStatus.PROCESSING:
        return {
          text: t('{modelInfo} AI 分析进行中...', { modelInfo }),
          icon: 'auto_awesome',
          color: 'text-purple-500',
          animate: 'animate-pulse'
        }

      case AIServiceStatus.ERROR:
        return {
          text: t('{modelInfo} 服务异常: {error}', {
            modelInfo,
            error: lastError || t('未知错误')
          }),
          icon: 'error_outline',
          color: 'text-red-500'
        }
      default:
        return {
          text: t('状态未知'),
          icon: 'help',
          color: 'text-gray-500'
        }
    }
  }

  const waiting = snapshot?.items.filter(i => i.status === 'pending').length || 0
  const analyzing = snapshot?.items.find(i => i.status === 'analyzing')
  const aiServiceInfo = getFooterDisplay(serviceStatus)

  return (
    <footer className="bg-card border-t border-border px-6 py-3 flex justify-between items-center text-sm text-foreground">
      <div className="flex items-center gap-2">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <MaterialIcon
              icon={aiServiceInfo.icon}
              className={`${aiServiceInfo.color} ${aiServiceInfo.animate || ''} text-sm`}
            />
            <span className={aiServiceInfo.color}>{aiServiceInfo.text}</span>
          </div>
        </div>
      </div>
      <button
        className="text-foreground dark:text-foreground hover:underline cursor-pointer transition-colors"
        onClick={openModal}
        title={
          analyzing
            ? t('查看分析队列 - 当前: {name}', { name: analyzing.name })
            : t('查看分析队列 - {count} 个文件等待中', { count: waiting })
        }
      >
        {analyzing
          ? t('分析中: {name} · 进度: {progress}%', {
              name: analyzing.name,
              progress: typeof analyzing.progress === 'number' ? analyzing.progress : 0
            })
          : t('空闲')}{' '}
        · {t('等待: {count}', { count: waiting })}
      </button>
    </footer>
  )
}
