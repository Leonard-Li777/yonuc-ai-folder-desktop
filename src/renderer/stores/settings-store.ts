import { create } from 'zustand'
import { AppConfig } from '@yonuc/types'
import type { ConfigKey } from '@yonuc/types/config-types'
import {
  SettingsCategory,
  ISettingsCategoryInfo,
  IIgnoreRule,
  ISettingsValidationResult
} from '@yonuc/types'
import { t } from '@app/languages'
import { SUPPORTED_LANGUAGES_KEY } from '@yonuc/shared'

/**
 * ConfigKey 到 AppConfig 字段的映射
 */
const configKeyToRendererFieldMap: Record<ConfigKey, keyof AppConfig | null> = {
  APP_NAME: null,
  VERSION: null,
  MACHINE_ID: null,
  DEFAULT_LANGUAGE: 'language',
  LANGUAGE_CONFIRMED: 'languageConfirmed',
  THEME_MODE: 'theme',
  COLOR_SCHEME: null,
  WINDOW_WIDTH: null,
  WINDOW_HEIGHT: null,
  IS_MAXIMIZED: null,
  DEFAULT_VIEW: 'defaultView',
  SHOW_EMPTY_TAGS: 'showEmptyTags',
  FILE_LIST_EXTRA_FIELDS: 'fileListExtraFields',
  SELECTED_MODEL_ID: 'selectedModelId',
  MODEL_CONFIG_URL: 'modelConfigUrl',
  AI_CLOUD_SELECTED_MODEL_ID: 'aiCloudSelectedModelId',
  LOCAL_MODEL_CONFIGS: null,
  AUTO_CLASSIFICATION: 'autoClassification',
  AUTO_ANALYZE_NEW_FILES: 'autoAnalyzeNewFiles',
  UNIT_RECOGNITION_PROMPT: 'unitRecognitionPrompt',
  QUALITY_SCORE_PROMPT: 'qualityScorePrompt',
  TAG_GENERATION_PROMPT: 'tagGenerationPrompt',
  SUPPLEMENTAL_PROMPT: 'supplementalPrompt',
  LATEST_NEWS: 'LATEST_NEWS',
  PAN_DIMENSION_IDS: 'PAN_DIMENSION_IDS',
  ENABLE_HARDWARE_MONITORING: null,
  CPU_USAGE_THRESHOLD: null,
  MEMORY_USAGE_THRESHOLD: null,
  GPU_USAGE_THRESHOLD: null,
  HARDWARE_CHECK_INTERVAL: null,
  BATCH_PROCESS_SIZE: null,
  ENABLE_MONITOR: null,
  MAX_FILE_SIZE: null,
  ENABLE_AUTO_ANALYSIS: null,
  AUTO_ANALYSIS_DELAY: null,
  DATABASE_PATH: 'databasePath',
  MODEL_STORAGE_PATH: 'modelPath',
  LOG_PATH: null,
  TEMP_PATH: null,
  LIBREOFFICE_PATH: 'libreOfficePath',
  AI_SERVICE_MODE: 'aiServiceMode', // 新增AI服务模式配置
  AI_CLOUD_PROVIDER: 'aiCloudProvider', // 新增云端供应商配置
  AI_CLOUD_API_KEY: 'aiCloudApiKey', // 新增云端API密钥配置
  AI_CLOUD_BASE_URL: 'aiCloudBaseUrl', // 新增云端基础URL配置
  AI_CLOUD_API_VERSION: 'aiCloudApiVersion', // 新增云端API版本配置
  CLOUD_MODEL_CONFIGS: null, // 云端模型配置列表
  SELECTED_CLOUD_CONFIG_INDEX: null, // 选中的云端配置索引
  CONTEXT_SIZE: null,
  MODEL_TEMPERATURE: null,
  MODEL_MAX_TOKENS: null,
  CPU_WARNING_THRESHOLD: null,
  CPU_CRITICAL_THRESHOLD: null,
  MEMORY_WARNING_THRESHOLD: null,
  MEMORY_CRITICAL_THRESHOLD: null,
  FILE_HANDLE_WARNING_THRESHOLD: null,
  FILE_HANDLE_CRITICAL_THRESHOLD: null,
  AI_REQUEST_TIMEOUT: null,
  AI_MAX_RETRIES: null,
  HEALTH_CHECK_INTERVAL: null,
  CONNECTION_IDLE_TIMEOUT: null,
  ERROR_MAX_RETRIES: null,
  ERROR_RETRY_DELAY: null,
  MAX_CONCURRENT_OPERATIONS: null,
  MEMORY_CHECK_INTERVAL: null,
  MEMORY_THRESHOLD: null,
  CHUNK_SIZE: null,
  QUEUE_MAX_CONCURRENCY: null,
  QUEUE_BATCH_SIZE: null,
  IS_FIRST_RUN: 'isFirstRun',
  MIGRATION_COMPLETED: null,
  MIGRATION_COMPLETED_AT: null,
  MIGRATION_VERSION: null,
  MACHINE_REGISTERED: null,
  AI_LOCAL_PORT: null,
  MODEL_LOAD_MAX_RETRIES: null,
  MODEL_LOAD_TIMEOUT: null,
  HEALTH_CHECK_MAX_FAILURES: null,
  SUPPORTED_LANGUAGES: null,
  IGNORE_RULES: null,
  AI_PLATFORM: 'aiPlatform',
}

/**
 * 设置管理状态接口
 */
interface ISettingsState {
  // 界面状态
  isOpen: boolean
  currentCategory: SettingsCategory
  isLoading: boolean
  error: string | null

  // 配置数据
  config: AppConfig
  lastConfigUpdate?: number // 用于强制触发重新渲染

  // 保存状态
  hasUnsavedChanges: boolean
  originalConfig: AppConfig | null

  // 忽略规则
  ignoreRules: IIgnoreRule[]

  // 验证结果
  validationResult: ISettingsValidationResult | null

  // 界面操作
  openSettings: (category?: SettingsCategory) => Promise<void>
  closeSettings: () => void
  setCurrentCategory: (category: SettingsCategory) => void

  // 配置操作
  updateConfig: (updates: Partial<AppConfig>, options?: { internal?: boolean }) => void
  saveSettings: () => Promise<void>
  cancelSettings: () => void

  // 忽略规则操作
  addIgnoreRule: (rule: Omit<IIgnoreRule, 'id'>) => void
  updateIgnoreRule: (id: string, updates: Partial<IIgnoreRule>) => void
  removeIgnoreRule: (id: string) => void
  loadIgnoreRules: () => Promise<void>
  saveIgnoreRules: () => Promise<void>

  // 模型管理
  updateModelList: () => Promise<void>

  // 工作目录管理
  deleteWorkspaceDirectory: (workspaceId: number) => Promise<void>
  resetWorkspaceDirectory: (workspaceId: number) => Promise<void>

  // 验证
  validateSettings: () => ISettingsValidationResult

  // ConfigKey 访问方法
  getConfigValue: <T = unknown>(key: ConfigKey) => T | undefined
  updateConfigValue: (key: ConfigKey, value: unknown) => Promise<void>

  // 工具方法
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

/**
 * 设置分类信息
 */
export const settingsCategories: () => ISettingsCategoryInfo[] = () => ([
  {
    id: SettingsCategory.INTERFACE,
    name: t('界面设置'),
    icon: 'palette',
    description: t('主题、语言、视图模式')
  },
  {
    id: SettingsCategory.FILE_DISPLAY,
    name: t('文件显示'),
    icon: 'view_list',
    description: t('文件列表显示字段和布局设置')
  },
  {
    id: SettingsCategory.AI_MODEL,
    name: t('AI模型'),
    icon: 'psychology',
    description: t('AI模型下载、管理和更新设置')
  },
  {
    id: SettingsCategory.ANALYSIS,
    name: t('分析设置'),
    icon: 'analytics',
    description: t('AI分析行为、提示词和忽略规则')
  },
  {
    id: SettingsCategory.MONITORING,
    name: t('工作目录'),
    icon: 'folder_open',
    description: t('工作目录管理和数据重置')
  }
])

/**
 * 设置管理状态store
 */
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: NodeJS.Timeout

  return (...args: Parameters<F>): Promise<ReturnType<F>> =>
    new Promise(resolve => {
      if (timeout) {
        clearTimeout(timeout)
      }

      timeout = setTimeout(() => resolve(func(...args)), waitFor)
    })
}

/**
 * 设置管理状态store
 */
export const useSettingsStore = create<ISettingsState>((set, get) => {
  const debouncedUpdate = debounce(async (newConfig: AppConfig) => {
    try {
      if (window.electronAPI?.updateConfig) {
        await window.electronAPI.updateConfig(newConfig)
        console.log('✅ (Debounced) 配置已保存到后端')
      }
    } catch (error) {
      console.warn('防抖保存配置失败:', error)
      set({ error: t('保存设置失败') })
    }
  }, 500) // 500ms的防抖延迟

  return {
    // ... (其他状态和操作)
    isOpen: false,
    currentCategory: SettingsCategory.INTERFACE,
    isLoading: false,
    error: null,
    config: {} as AppConfig,
    hasUnsavedChanges: false,
    originalConfig: null,
    ignoreRules: [],
    validationResult: null,

    openSettings: async (category = SettingsCategory.INTERFACE) => {
      console.log('openSettings 被调用，分类:', category)
      try {
        if (window.electronAPI?.getConfig) {
          const latestConfig = await window.electronAPI.getConfig()
          set({
            config: latestConfig,
            originalConfig: { ...latestConfig },
            hasUnsavedChanges: false
          })
          console.log('✅ 已从后端加载最新配置')
        }
      } catch (error) {
        console.error('❌ 加载最新配置失败:', error)
      }
      set({
        isOpen: true,
        currentCategory: category,
        error: null
      })
      console.log('设置对话框状态已更新为打开')
    },

    closeSettings: () => {
      set({
        isOpen: false,
        error: null,
        validationResult: null
      })
    },

    setCurrentCategory: category => {
      set({ 
        currentCategory: category,
        error: null // 切换分类时清除错误
      })
    },

    // 配置操作（即时UI更新，防抖保存）
    updateConfig: (updates, options) => {
      const state = get()
      const newConfig = { ...state.config, ...updates }

      // 检查是否有变更
      const hasChanges = state.originalConfig
        ? JSON.stringify(newConfig) !== JSON.stringify(state.originalConfig)
        : true

      set({
        config: newConfig,
        hasUnsavedChanges: hasChanges
      })

      // 实时验证
      const validation = state.validateSettings()
      set({ validationResult: validation })

      // 如果不是内部同步（即来自 UI 操作），则防抖保存到后端
      if (!options?.internal) {
        debouncedUpdate(newConfig)
      }
    },

    saveSettings: async () => {
      const state = get()
      try {
        set({ isLoading: true, error: null })

        if (window.electronAPI?.updateConfig) {
          await window.electronAPI.updateConfig(state.config)
          set({
            hasUnsavedChanges: false,
            originalConfig: { ...state.config }
          })
          console.log('✅ 设置已保存')
        }
      } catch (error) {
        console.error('❌ 保存设置失败:', error)
        set({ error: error instanceof Error ? error.message : t('保存设置失败') })
      } finally {
        set({ isLoading: false })
      }
    },

    cancelSettings: () => {
      const state = get()
      if (state.originalConfig) {
        set({
          config: { ...state.originalConfig },
          hasUnsavedChanges: false,
          error: null,
          validationResult: null
        })
      }
    },
    addIgnoreRule: rule => {
      const state = get()
      const newRule: IIgnoreRule = {
        ...rule,
        id: Date.now().toString(),
        isSystem: false,
      }

      set({
        ignoreRules: [...state.ignoreRules, newRule]
      })
    },
    updateIgnoreRule: (id, updates) => {
      const state = get()
      const target = state.ignoreRules.find(r => r.id === id)

      if (target?.isSystem) {
        state.setError(t('无法修改系统预设的忽略规则'))
        return
      }

      const safeUpdates = { ...updates } as Partial<IIgnoreRule>
      // 防御性处理：禁止通过 updateIgnoreRule 修改 isSystem 标志
      if ('isSystem' in (safeUpdates as any)) {
        delete (safeUpdates as any).isSystem
      }

      set({
        ignoreRules: state.ignoreRules.map(rule =>
          rule.id === id ? { ...rule, ...safeUpdates } : rule
        )
      })
    },
    removeIgnoreRule: id => {
      const state = get()
      const rule = state.ignoreRules.find(r => r.id === id)

      if (rule?.isSystem) {
        state.setError(t('无法删除系统预设的忽略规则'))
        return
      }

      set({
        ignoreRules: state.ignoreRules.filter(rule => rule.id !== id)
      })
    },
    loadIgnoreRules: async () => {
      try {
        set({ isLoading: true })

        if (window.electronAPI?.getAnalysisIgnoreRules) {
          // 强制类型转换以兼容可能的旧API返回类型
          const rules = (await window.electronAPI.getAnalysisIgnoreRules()) as unknown as IIgnoreRule[]
          set({
            ignoreRules: Array.isArray(rules) ? rules : []
          })
          return
        }

        set({ ignoreRules: [] })
      } catch (error) {
        console.error('加载忽略规则失败:', error)
        set({ ignoreRules: [] })
      } finally {
        set({ isLoading: false })
      }
    },
    saveIgnoreRules: async () => {
      const state = get()
      try {
        if (window.electronAPI?.saveAnalysisIgnoreRules) {
          await window.electronAPI.saveAnalysisIgnoreRules(state.ignoreRules)
        }
      } catch (error) {
        console.error('保存忽略规则失败:', error)
        throw error
      }
    },
    updateModelList: async () => {
      try {
        set({ isLoading: true, error: null })

        // 暂时模拟成功
        const state = get()
        state.updateConfig({
          lastModelConfigUrlUpdate: new Date()
        })

        alert(t('模型列表更新成功'))
      } catch (error) {
        console.error('更新模型列表失败:', error)
        set({ error: error instanceof Error ? error.message : t('更新模型列表失败') })
      } finally {
        set({ isLoading: false })
      }
    },
    deleteWorkspaceDirectory: async workspaceId => {
      try {
        set({ isLoading: true, error: null })

        const confirmed = window.confirm(
          t('确认删除此工作目录？此操作将删除该目录的所有相关数据，此操作不可逆。')
        )

        if (confirmed) {
          // 暂时模拟删除成功
          alert(t('工作目录已删除'))
        }
      } catch (error) {
        console.error('删除工作目录失败:', error)
        set({ error: error instanceof Error ? error.message : t('删除工作目录失败') })
      } finally {
        set({ isLoading: false })
      }
    },
    resetWorkspaceDirectory: async workspaceId => {
      try {
        set({ isLoading: true, error: null })

        const confirmed = window.confirm(
          t('确认重置此工作目录？此操作将删除该目录的所有AI分析结果和标签，但保留原始文件。')
        )

        if (confirmed) {
          // 暂时模拟重置成功
          alert(t('工作目录已重置'))
        }
      } catch (error) {
        console.error('重置工作目录失败:', error)
        set({ error: error instanceof Error ? error.message : t('重置工作目录失败') })
      } finally {
        set({ isLoading: false })
      }
    },
    validateSettings: () => {
      const state = get()
      const errors: Array<{ field: string; message: string }> = []
      const warnings: Array<{ field: string; message: string }> = []

      const supportedLanguages = SUPPORTED_LANGUAGES_KEY
      if (state.config.language && !supportedLanguages.includes(state.config.language)) {
        errors.push({ field: 'language', message: t('不支持的语言设置') })
      }

      const supportedThemes = ['light', 'dark', 'auto']
      if (state.config.theme && !supportedThemes.includes(state.config.theme)) {
        errors.push({ field: 'theme', message: t('不支持的主题设置') })
      }

      const supportedViews = ['grid', 'list']
      if (state.config.defaultView && !supportedViews.includes(state.config.defaultView)) {
        errors.push({ field: 'defaultView', message: t('不支持的视图模式') })
      }

      const supportedFields = ['qualityScore', 'description', 'tags', 'author', 'language']
      const invalidFields = state.config.fileListExtraFields?.filter(
        field => !supportedFields.includes(field)
      )
      if (invalidFields && invalidFields.length > 0) {
        errors.push({
          field: 'fileListExtraFields',
          message: t('不支持的显示字段: {fieldList}', { fieldList: invalidFields.join(', ') })
        })
      }

      if (state.config.modelConfigUrl && !isValidUrl(state.config.modelConfigUrl)) {
        errors.push({ field: 'modelConfigUrl', message: t('无效的模型更新URL') })
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      }
    },
    getConfigValue: key => {
      const state = get()

      const rendererField = configKeyToRendererFieldMap[key]
      if (rendererField === null) {
        return undefined
      }
      return rendererField ? (state.config as any)[rendererField] : undefined
    },
    updateConfigValue: async (key, value) => {
      // 先同步到后端
      if (window.electronAPI?.updateConfigValue) {
        try {
          await window.electronAPI.updateConfigValue(key, value)
        } catch (error) {
          console.error('同步配置项失败:', error)
        }
      }

      // 然后更新本地状态
      const rendererField = configKeyToRendererFieldMap[key]
      if (rendererField) {
        get().updateConfig({ [rendererField]: value } as Partial<AppConfig>)
      }

      // 对于没有映射的配置项，强制触发重新渲染
      if (!rendererField) {
        const state = get()
        set({
          config: { ...state.config },
          // 添加一个时间戳来强制触发重新渲染
          lastConfigUpdate: Date.now()
        })
      }
    },
    setLoading: loading => set({ isLoading: loading }),
    setError: error => {
      set({ error })
      if (error) {
        setTimeout(() => {
          const currentState = get()
          if (currentState.error === error) {
            set({ error: null })
          }
        }, 3000)
      }
    }
  }
})

/**
 * 验证URL格式
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

// 在应用启动时加载配置和忽略规则
if (typeof window !== 'undefined' && window.electronAPI) {
  // 加载初始配置
  window.electronAPI
    .getConfig()
    .then(config => {
      useSettingsStore.getState().updateConfig(config)
    })
    .catch(error => {
      console.error('加载配置失败:', error)
      useSettingsStore.getState().setError('Failed to load configuration')
    })

  // 监听后端发出的配置变更广播
  if (window.electronAPI.onConfigChange) {
    window.electronAPI.onConfigChange((newConfig: AppConfig) => {
      const state = useSettingsStore.getState()
      
      // 深度比较，如果配置没有实际变化，忽略广播，防止渲染循环
      if (JSON.stringify(state.config) === JSON.stringify(newConfig)) {
        return
      }

      console.log('📡 [SettingsStore] 收到后端配置同步广播')
      // 使用 internal: true 标记，防止回传给后端
      state.updateConfig(newConfig, { internal: true })
    })
  }

  // 加载忽略规则
  useSettingsStore
    .getState()
    .loadIgnoreRules()
    .catch(error => {
      console.error('加载忽略规则失败:', error)
    })
}
