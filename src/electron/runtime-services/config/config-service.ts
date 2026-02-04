import type { AppConfig } from '@yonuc/types'
import type { ConfigKey, UnifiedAppConfig, UnifiedConfigUpdate } from '@yonuc/types/config-types'
import type { AIServiceConfig } from '@yonuc/types/ai-config-types'
import { ConfigOrchestrator } from '../../config/config-orchestrator'
import { logger, LogCategory } from '@yonuc/shared'

export class ConfigService {
  private readonly orchestrator = ConfigOrchestrator.getInstance()

  getConfig(): AppConfig {
    const config = this.orchestrator.getRendererConfig()

    // 将 unified-config 中的关键配置项注入到 AppConfig（用于前端回显与兼容）
    const aiServiceMode = this.orchestrator.getValue('AI_SERVICE_MODE') as string
    const modelConfigUrl = this.orchestrator.getValue('MODEL_CONFIG_URL') as string | undefined
    const modelPath = this.orchestrator.getValue('MODEL_STORAGE_PATH') as string
    const databasePath = this.orchestrator.getValue('DATABASE_PATH') as string

    // 注入更多 UI 相关的配置项，确保 ConfigKey 系统与旧的 AppConfig 兼容
    const languageConfirmed = this.orchestrator.getValue('LANGUAGE_CONFIRMED') as boolean
    const isFirstRun = this.orchestrator.getValue('IS_FIRST_RUN') as boolean
    const selectedModelId = this.orchestrator.getValue('SELECTED_MODEL_ID') as string | undefined
    const language = this.orchestrator.getValue('DEFAULT_LANGUAGE') as any
    const theme = this.orchestrator.getValue('THEME_MODE') as any
    const defaultView = this.orchestrator.getValue('DEFAULT_VIEW') as any
    const showEmptyTags = this.orchestrator.getValue('SHOW_EMPTY_TAGS') as boolean
    const fileListExtraFields = this.orchestrator.getValue('FILE_LIST_EXTRA_FIELDS') as any
    const latestNews = this.orchestrator.getValue('LATEST_NEWS') as any
    const panDimensionIds = this.orchestrator.getValue('PAN_DIMENSION_IDS') as any

    // 构建兼容的 AppConfig 对象
    return {
      ...config,
      // 覆盖旧值
      language,
      theme,
      defaultView,
      showEmptyTags, // 注入到顶层
      fileListExtraFields: fileListExtraFields || config.fileListExtraFields,
      LATEST_NEWS: latestNews,
      PAN_DIMENSION_IDS: panDimensionIds,
      // 注入新值
      aiServiceMode,
      modelConfigUrl,
      modelPath,
      databasePath,
      languageConfirmed,
      isFirstRun,
      selectedModelId,
      // 特殊处理嵌套对象
      ui: {
        ...(config.ui || {}),
        showEmptyTags
      }
    }
  }

  getUnifiedConfig(): UnifiedAppConfig {
    return this.orchestrator.getConfigSnapshot()
  }

  getValue<T = unknown>(key: ConfigKey): T {
    return this.orchestrator.getValue(key)
  }

  updateConfig(updates: Partial<AppConfig>): void {
    this.orchestrator.updateRendererConfig(updates)
  }

  updateUnifiedConfig(partial: UnifiedConfigUpdate): void {
    this.orchestrator.updateUnifiedConfig(partial)
  }

  updateValue(key: ConfigKey, value: unknown): void {
    this.orchestrator.updateValue(key, value)
  }

  onConfigChange(callback: (newConfig: AppConfig, oldConfig: AppConfig) => void): () => void {
    // 监听 renderer 配置变更
    const cleanupRenderer = this.orchestrator.onRendererConfigChange(callback)

    // 使用简单的防抖函数处理统一配置变更，避免批量更新时频繁触发广播
    let timeout: NodeJS.Timeout | null = null
    const debouncedBroadcast = (key: string) => {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => {
        logger.debug(LogCategory.CONFIG, `ConfigService: Debounced broadcasting config change to renderer (Last trigger: ${key})`)
        callback(this.getConfig(), {} as AppConfig)
        timeout = null
      }, 100)
    }

    // 监听统一配置变更或单个值变更（云端同步触发这里）
    const unifiedHandler = (event?: any) => {
      const key = event?.key || 'unknown'
      debouncedBroadcast(key)
    }

    this.orchestrator.on('unified-change', unifiedHandler)
    this.orchestrator.on('value-change', unifiedHandler)

    return () => {
      cleanupRenderer()
      if (timeout) clearTimeout(timeout)
      this.orchestrator.off('unified-change', unifiedHandler)
      this.orchestrator.off('value-change', unifiedHandler)
    }
  }

  onValueChange<T = unknown>(key: ConfigKey, handler: (value: T, previous: T | undefined) => void): () => void {
    return this.orchestrator.onValueChange(key, handler)
  }

  /**
   * 获取AI服务配置
   */
  async getAIConfig(): Promise<AIServiceConfig> {
    const mode = this.getValue<string>('AI_SERVICE_MODE') || 'local'

    if (mode === 'cloud') {
      return {
        mode: 'cloud',
        local: {
          modelPath: '',
          contextSize: 4096,
          gpuLayers: 0,
          port: 8172
        },
        cloud: {
          provider: (this.getValue<string>('AI_CLOUD_PROVIDER') || 'openai') as 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'alibaba' | 'custom',
          apiKey: this.getValue<string>('AI_CLOUD_API_KEY') || '',
          baseUrl: this.getValue<string>('AI_CLOUD_BASE_URL'),
          model: this.getValue<string>('AI_CLOUD_SELECTED_MODEL_ID') || 'gpt-4o',
          apiVersion: this.getValue<string>('AI_CLOUD_API_VERSION')
        }
      }
    } else {
      // 本地模式
      const selectedModelId = this.getValue<string>('SELECTED_MODEL_ID')
      const contextSize = this.getValue<number>('CONTEXT_SIZE') || 4096
      const gpuLayers = 0 // 从模型配置中获取，暂时使用默认值
      const port = this.getValue<number>('AI_LOCAL_PORT') || 8172

      // 获取具体的模型文件路径和多模态配置
      let actualModelPath = ''
      let mmprojPath: string | undefined = undefined
      let isModelDownloaded = false

      if (selectedModelId) {
        try {
          // 动态导入 llamaModelManager 以避免循环依赖
          const { llamaModelManager } = await import('../llama/llama-model-manager')
          const { modelDownloadManager } = await import('../ai/model-download-manager')

          // 获取主模型文件路径
          const modelFilePath = await llamaModelManager.getModelPath(selectedModelId)
          actualModelPath = modelFilePath || ''

          // 获取多模态模型配置（包括投影文件路径）
          const multiModalConfig = await llamaModelManager.getMultiModalModelConfig(selectedModelId)
          if (multiModalConfig && multiModalConfig.isMultiModal && multiModalConfig.mmprojPath) {
            mmprojPath = multiModalConfig.mmprojPath
            console.log(`[ConfigService] 检测到多模态模型，投影文件路径: ${mmprojPath}`)
          }

          // 检查模型下载状态（包含文件大小校验）
          try {
            const status = await modelDownloadManager.checkModelDownloadStatus(selectedModelId)
            isModelDownloaded = status.isDownloaded
          } catch (e) {
            console.warn(`[ConfigService] 检查模型下载状态失败: ${selectedModelId}`, e)
            isModelDownloaded = false
          }

        } catch (error) {
          console.error('获取模型路径失败:', error)
          // 如果获取失败，回退到目录路径
          const modelStoragePath = this.getValue<string>('MODEL_STORAGE_PATH') || ''
          actualModelPath = `${modelStoragePath}/${selectedModelId}`
        }
      }

      return {
        mode: 'local',
        local: {
          modelId: selectedModelId,
          modelPath: actualModelPath,
          mmprojPath,
          contextSize,
          gpuLayers,
          port,
          isModelDownloaded
        },
        cloud: {
          provider: 'openai',
          apiKey: '',
          model: ''
        }
      }
    }
  }
}

export const configService = new ConfigService()
