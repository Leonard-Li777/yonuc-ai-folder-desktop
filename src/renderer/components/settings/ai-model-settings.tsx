import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { t } from '@app/languages'
import { Card } from '../ui/card'
import { Label } from '../ui/label'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { useSettingsStore } from '../../stores/settings-store'
import { useModelStore } from '../../stores/model-store'
import { CloudModelConfigSettings } from './cloud-model-config-settings'
import { HardwareInfo } from '@yonuc/types'
import { IModelSummary, IModelFile } from '@yonuc/types/model-manager'
import { useModelDownload } from '@hooks/use-model-download'
import { ModelDownloadProgress } from '@components/download/ModelDownloadProgress'
import {
  Download,
  Trash2,
  RefreshCw,
  HardDrive,
  Cpu,
  Zap,
  CheckCircle,
  AlertCircle,
  Loader2,
  Check,
  Cloud,
  Server
} from 'lucide-react'

/**
 * AI模型设置组件
 */
export const AIModelSettings: React.FC = () => {
  const { config, getConfigValue, updateConfigValue, isLoading } = useSettingsStore()
  const { modelName, setModelName } = useModelStore()

  const [models, setModels] = useState<any[]>([])
  const [allModels, setAllModels] = useState<IModelSummary[]>([])
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null)
  const [recommendedModelIds, setRecommendedModelIds] = useState<string[]>([])
  const [modelDownloadStatus, setModelDownloadStatus] = useState<Record<string, boolean>>({})
  const [activeDownloadId, setActiveDownloadId] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false) // 添加本地的loading状态

  const {
    state: downloadState,
    startDownload,
    cancelDownload,
    retryDownload
  } = useModelDownload(activeDownloadId || '', {
    onDownloadComplete: () => {
      if (activeDownloadId) {
        setModelDownloadStatus(prev => ({
          ...prev,
          [activeDownloadId]: true
        }))
      }
      loadModelsAndHardware()
      setActiveDownloadId(null)
    },
    onDownloadError: () => {
      setActiveDownloadId(null)
    },
    onDownloadCancel: () => {
      setActiveDownloadId(null)
    }
  })

  const [modelStoragePath, setModelStoragePath] = useState(
    getConfigValue<string>('MODEL_STORAGE_PATH') || ''
  )

  const isCloudMode = getConfigValue<string>('AI_SERVICE_MODE') === 'cloud'
  const aiPlatform = getConfigValue<string>('AI_PLATFORM')
  const isOllama = aiPlatform === 'ollama'

  const loadModelsAndHardware = useCallback(async () => {
    try {
      if (!downloadState.isDownloading) {
        setLoading(true)
      }

      if (window.electronAPI?.listModels) {
        const modelList = await window.electronAPI.listModels()
        setModels(modelList || [])
        setAllModels(modelList || [])

        const statusMap: Record<string, boolean> = {}
        if (window.electronAPI?.modelDownload?.checkDownloadStatus && !isOllama) {
          for (const model of modelList || []) {
            try {
              const status = await window.electronAPI.modelDownload.checkDownloadStatus(model.id)
              statusMap[model.id] = status.isDownloaded
            } catch (error) {
              console.error(`检查模型 ${model.id} 下载状态失败:`, error)
              statusMap[model.id] = false
            }
          }
        } else if (window.electronAPI?.ollama?.checkModel && isOllama) {
          for (const model of modelList || []) {
            try {
              const status = await window.electronAPI.ollama.checkModel(model.id)
              statusMap[model.id] = status.installed
            } catch (error) {
              console.error(`检查 Ollama 模型 ${model.id} 状态失败:`, error)
              statusMap[model.id] = false
            }
          }
        }
        setModelDownloadStatus(statusMap)
      }

      if (window.electronAPI?.getHardwareInfo) {
        const hwInfo = await window.electronAPI.getHardwareInfo()
        setHardwareInfo(hwInfo)

        if (window.electronAPI?.recommendModelsByHardware) {
          try {
            const recommendationResult = await window.electronAPI.recommendModelsByHardware(
              hwInfo.freeMemGB || hwInfo.totalMemGB,
              hwInfo.hasGPU,
              hwInfo.vramGB
            )
            if (recommendationResult && Array.isArray(recommendationResult.recommendedModels)) {
              setRecommendedModelIds(recommendationResult.recommendedModels)
            } else if (Array.isArray(recommendationResult)) {
              setRecommendedModelIds(recommendationResult)
            } else {
              setRecommendedModelIds([])
            }
          } catch (err) {
            console.error('获取推荐模型失败:', err)
            setRecommendedModelIds([])
          }
        }
      }
    } catch (error) {
      console.error('加载模型列表失败:', error)
    } finally {
      if (!downloadState.isDownloading) {
        setLoading(false)
      }
    }
  }, [setLoading, downloadState.isDownloading])

  useEffect(() => {
    if (!isCloudMode) {
      loadModelsAndHardware()
    }
  }, [isCloudMode, loadModelsAndHardware])

  useEffect(() => {
    const path = getConfigValue<string>('MODEL_STORAGE_PATH')
    setModelStoragePath(path || '')
  }, [getConfigValue])

  /**
   * 处理激活模型
   */
  const handleActivateModel = async (modelId: string) => {
    const model = models.find(m => m.id === modelId)
    if (!model) return

    try {
      // 更新配置
      updateConfigValue('SELECTED_MODEL_ID', modelId)
      setModelName(model.name)

      // 通知AI服务模型已切换（懒加载机制）
      if (window.electronAPI?.aiService) {
        try {
          const result = await window.electronAPI.aiService.onModelChanged(modelId)
          if (result.success) {
            console.log(`模型切换通知成功: ${model.name}`)
          } else {
            console.warn(`模型切换通知失败: ${result.message}`)
          }
        } catch (error) {
          console.warn('发送模型切换通知失败:', error)
        }
      }

      console.log(`已激活模型: ${model.name}`)
    } catch (error) {
      console.error('激活模型失败:', error)
    }
  }

  /**
   * 处理模型下载
   */
  const handleDownloadModel = async (modelId: string) => {
    setActiveDownloadId(modelId)
    await startDownload(modelId, { autoRetry: true })
  }

  /**
   * 处理模型删除
   */
  const handleDeleteModel = async (modelId: string) => {
    const model = models.find(m => m.id === modelId)
    if (!model) return

    if (!window.electronAPI?.deleteModel) {
      alert(t('模型删除功能暂未实现'))
      return
    }

    try {
      const confirmed = await window.electronAPI?.utils?.showMessageBox({
        type: 'warning',
        title: t('删除确认'),
        message: t('确定要删除模型 "{model}" 吗？', { model: model.name }),
        detail: t('此操作不可逆。'),
        buttons: [t('删除'), t('取消')],
        defaultId: 1,
        cancelId: 1
      })

      if (confirmed && confirmed.response === 0) {
        await window.electronAPI.deleteModel(modelId)

        // 如果删除的是当前模型，自动激活其它已下载的模型
        const currentModelId = getConfigValue<string>('SELECTED_MODEL_ID')
        if (currentModelId === modelId) {
          const otherDownloadedModel = models.find(
            m => m.id !== modelId && modelDownloadStatus[m.id]
          )
          if (otherDownloadedModel) {
            await handleActivateModel(otherDownloadedModel.id)
          } else {
            updateConfigValue('SELECTED_MODEL_ID', undefined)
            setModelName(null)
          }
        }

        // 只更新特定模型的下载状态，而不是重新加载整个模型列表
        setModelDownloadStatus(prev => {
          const newStatus = { ...prev }
          delete newStatus[modelId]
          return newStatus
        })
      }
    } catch (error) {
      console.error('删除模型失败:', error)
    }
  }

  const handleBrowseModelStoragePath = async () => {
    try {
      const result = await window.electronAPI?.utils?.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
      })
      if (!result?.canceled && Array.isArray(result.filePaths) && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0]
        setModelStoragePath(selectedPath)
        updateConfigValue('MODEL_STORAGE_PATH', selectedPath)
      }
    } catch (error) {
      console.error('选择模型目录失败:', error)
    }
  }

  const handleSaveModelStoragePath = () => {
    const trimmed = modelStoragePath.trim()
    if (!trimmed) {
      return
    }
    updateConfigValue('MODEL_STORAGE_PATH', trimmed)
  }
  /**
   * 检查模型是否超出硬件限制
   */
  const isModelExceedsHardware = useCallback((model: any) => {
    if (!hardwareInfo) return false

    const minVram = model.minVramGB ?? model.performance?.minMemoryGB
    
    // 检查显存/内存限制
    if (
      hardwareInfo.vramGB !== undefined &&
      minVram !== undefined &&
      minVram > hardwareInfo.vramGB
    ) {
      return true
    }

    return false
  }, [hardwareInfo])

  /**
   * 检查模型大小是否超出硬盘空间
   */
  const isModelExceedsDiskSpace = (model: any) => {
    if (!hardwareInfo?.storageFreeGB || !model.totalSizeBytes) return false
    const modelSizeGB = model.totalSizeBytes / 1024 ** 3
    return modelSizeGB > hardwareInfo.storageFreeGB
  }

  /**
   * 格式化模型大小显示
   */
  const formatModelSize = (model: any): string => {
    if (model.totalSize) {
      return model.totalSize
    }
    if (model.totalSizeBytes) {
      const sizeGB = model.totalSizeBytes / 1024 ** 3
      return `${sizeGB.toFixed(2)}GB`
    }
    return t('未知')
  }
  // 获取手动下载信息
  const getManualDownloadInfo = (modelId: string) => {
    const selectedModel = allModels.find(model => model.id === modelId)
    if (!selectedModel) {
      return { files: [] }
    }

    return {
      files: selectedModel.files.map(file => ({ type: file.type, url: file.url }))
    }
  }

  // 对模型进行排序：将超出硬件限制的模型排到最后
  const sortedModels = useMemo(() => {
    if (models.length === 0) return [];
    
    const fits: any[] = [];
    const exceeds: any[] = [];

    models.forEach(model => {
      if (isModelExceedsHardware(model)) {
        exceeds.push(model);
      } else {
        fits.push(model);
      }
    });

    return [...fits, ...exceeds];
  }, [models, isModelExceedsHardware]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2 text-foreground dark:text-foreground">
          {t('AI模型设置')}
        </h3>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground">
          {t('选择本地或云端模式：2 选 1')}
        </p>
      </div>

      <div className="flex items-center space-x-2 bg-muted p-1 rounded-lg w-fit">
        <Button
          variant={isCloudMode ? 'ghost' : 'default'}
          size="sm"
          onClick={() => updateConfigValue('AI_SERVICE_MODE', 'local')}
          className="flex items-center gap-2"
        >
          <Server className="w-4 h-4" />
          {t('本地模式')}
        </Button>
        <Button
          variant={isCloudMode ? 'default' : 'ghost'}
          size="sm"
          onClick={() => updateConfigValue('AI_SERVICE_MODE', 'cloud')}
          className="flex items-center gap-2"
        >
          <Cloud className="w-4 h-4" />
          {t('云端模式')}
        </Button>
      </div>

      {isCloudMode ? (
        <CloudModelConfigSettings />
      ) : (
        <>
          {/* 硬件信息展示 */}
          {hardwareInfo && (
            <Card className="p-4 bg-muted/50 dark:bg-muted/30 border-border dark:border-border">
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary dark:text-primary" />
                  <div>
                    <div className="font-medium text-foreground">
                      <span className="text-muted-foreground">
                        GPU :{' '}
                        {hardwareInfo.hasGPU && hardwareInfo.gpuModel
                          ? hardwareInfo.gpuModel
                          : hardwareInfo.hasGPU
                            ? t('有')
                            : t('无')}
                      </span>{' '}
                      {t('显存')}：{' '}
                      <span className="text-foreground">
                        {hardwareInfo.hasGPU
                          ? hardwareInfo.vramGB
                            ? `${hardwareInfo.vramGB}GB`
                            : t('检测中...')
                          : t('无独立显卡')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-primary dark:text-primary" />
                  <div className="font-medium text-muted-foreground">
                    {t('硬盘剩余')} :{' '}
                    <span className="text-foreground">
                      {hardwareInfo.storageFreeGB ? `${hardwareInfo.storageFreeGB}GB` : t('未知')}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* 可用模型列表 */}
          <Card className="p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">{t('可用模型')}</Label>
                  <p className="text-sm text-muted-foreground mt-1">{t('下载和管理AI模型')}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // 添加防抖机制，避免频繁点击
                    if (!isLoading) {
                      loadModelsAndHardware()
                    }
                  }}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {t('刷新列表')}
                </Button>
              </div>

              <div className="space-y-3">
                {sortedModels.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="text-4xl mb-2">🤖</div>
                    <p>{t('暂无可用模型')}</p>
                    <p className="text-sm">{t('请检查网络连接或稍后重试')}</p>
                  </div>
                ) : (
                  sortedModels.map(model => {
                    const isDownloaded = modelDownloadStatus[model.id]
                    const isActive = getConfigValue<string>('SELECTED_MODEL_ID') === model.id
                    const isRecommended = recommendedModelIds.includes(model.id)
                    const exceedsHardware = isModelExceedsHardware(model)
                    const isCurrentlyDownloading =
                      downloadState.isDownloading && downloadState.modelId === model.id

                    return (
                      <div
                        key={model.id}
                        className={`border rounded-lg p-4 ${
                          exceedsHardware ? 'opacity-30' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              {isDownloaded ? (
                                <CheckCircle className="h-5 w-5 text-green-600" />
                              ) : (
                                <Download className="h-5 w-5 text-muted-foreground" />
                              )}
                              <span className="font-medium">{model.name || t('未知模型')}</span>

                              <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                                {model.parameterSize || t('未知')}
                              </span>
                              <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                                {model.performance?.quality || t('未知')}
                              </span>
                              {isRecommended && (
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                  {t('推荐')}
                                </span>
                              )}
                              {isActive && (
                                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded flex items-center gap-1">
                                  <Check className="h-3 w-3" />
                                  {t('已激活')}
                                </span>
                              )}
                              {exceedsHardware && (
                                <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                                  {t('硬件不足')}
                                </span>
                              )}
                            </div>

                            <p className="text-sm text-muted-foreground">
                              {model.description || t('暂无描述')}
                            </p>

                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                {/* 模型能力标签 */}
                                {model.capabilities && Array.isArray(model.capabilities) && (
                                  <>
                                    {t('支持：')}
                                    {model.capabilities.map((cap: any, index: number) => (
                                      <span key={index} className="pr-2">
                                        {typeof cap === 'string' ? cap : cap.type}
                                      </span>
                                    ))}
                                  </>
                                )}
                                <HardDrive className="h-3 w-3" />
                                <span
                                  className={
                                    isModelExceedsDiskSpace(model)
                                      ? 'text-red-600 font-medium'
                                      : 'text-green-600 font-medium'
                                  }
                                >
                                  {t('大小: ') + formatModelSize(model)}
                                </span>
                                <span>
                                   {t('需要显存: ') +
                                     (model.minVramGB || model.performance?.minMemoryGB ? `${model.minVramGB || model.performance?.minMemoryGB}GB` : 'N/A')}
                                 </span>
                               </div>
                             </div>
                           </div>

                          <div className="flex items-center gap-2 ml-4">
                            {isDownloaded ? (
                              <>
                                {!isActive && (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => handleActivateModel(model.id)}
                                  >
                                    {t('激活')}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                  onClick={() => handleDeleteModel(model.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            ) : !exceedsHardware && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownloadModel(model.id)}
                                disabled={isCurrentlyDownloading}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                {t('下载')}
                              </Button>
                            )}
                          </div>
                        </div>
                        {/* 下载进度 */}
                        {isCurrentlyDownloading && (
                          <ModelDownloadProgress
                            progress={downloadState.downloadProgress ?? null}
                            isDownloading={downloadState.isDownloading}
                            isPaused={downloadState.isPaused}
                            status={downloadState.status}
                            error={downloadState.error}
                            onCancel={cancelDownload}
                            onRetry={retryDownload}
                            showManualDownloadInfo={!!downloadState.error}
                            manualDownloadInfo={{
                              files: getManualDownloadInfo(model.id).files,
                              storagePath: modelStoragePath
                                ? `${modelStoragePath}\\${model.id}`
                                : 'Not configured'
                            }}
                            className="my-2"
                          />
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </Card>

          {!isOllama && (
            <Card className="p-4">
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-medium">{t('模型存储路径')}</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('请选择一个拥有充足磁盘空间的文件夹来保存 GGUF 模型文件。')}
                  </p>
                </div>
                <div className="flex flex-col gap-2 md:flex-row">
                  <Input
                    placeholder={t('例如: D:\\AI\\models')}
                    value={modelStoragePath}
                    onChange={e => setModelStoragePath(e.target.value)}
                    className="md:flex-1"
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleBrowseModelStoragePath}>
                      {t('浏览')}
                    </Button>
                    <Button onClick={handleSaveModelStoragePath} disabled={!modelStoragePath.trim()}>
                      {t('保存')}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* 提示信息 */}
          <Card className="p-4 bg-amber-50 border-amber-200">
            <div className="flex items-start gap-2">
              <div className="text-amber-600 mt-0.5">⚠️</div>
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">{t('注意事项')}</p>
                <ul className="space-y-1 text-amber-700">
                  <li>{t('• 模型文件较大，下载可能需要较长时间')}</li>
                  <li>{t('• 确保有足够的磁盘空间存储模型文件')}</li>
                  <li>{t('• 不能删除当前激活的模型，请先激活其他模型')}</li>
                  <li>{t('• 硬件不足的模型已置灰，无法下载')}</li>
                  <li>{t('• 显存大小是模型运行的关键因素')}</li>
                </ul>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
