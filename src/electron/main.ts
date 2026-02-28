// 首先初始化日志系统（在所有其他导入之前）
import { logger, LogCategory } from '@yonuc/shared'
import { app, BrowserWindow, ipcMain, net, dialog, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { databaseService } from './runtime-services/database/database-service'
import { configService } from './runtime-services/config/config-service'
// 移除旧的AI服务导入，统一使用新的统一AI服务
import type { AppConfig, DirectoryItem, FileInfo, FileItem, LanguageCode, WorkspaceDirectory } from '@yonuc/types'
import { AIServiceStatus } from '@yonuc/types'
import type { ConfigKey } from '@yonuc/types/config-types'
import { modelService } from './runtime-services/llama/model-service'
import { cloudAnalysisService } from '@yonuc/server'
import { analysisQueueService } from './runtime-services/analysis-queue-service'
import { systemHealthService } from './runtime-services/system/system-health-service'
import { loggingService } from './runtime-services/system/logging-service'
// 导入统一AI服务 - 作为统一AI入口
import { llamaServerService, LlamaIndexAIService } from '@yonuc/electron-llamaIndex-service'
import { ConfigOrchestrator } from './config/config-orchestrator'
import { VirtualDirectoryService } from './runtime-services/filesystem/virtual-directory-service'
import { DirectoryContextService } from './runtime-services/filesystem/directory-context-service'
import { OrganizeRealDirectoryService } from './runtime-services/filesystem/organize-real-directory-service'
import { FileCleanupService } from './runtime-services/filesystem/file-cleanup-service'
import { fileWatcherService } from './runtime-services/filesystem/file-watcher-service'
import { createCoreEngine, type ICoreEngine, fileAnalysisService, type QuickOrganizeOptions } from '@yonuc/core-engine'
import { createCoreEngineAdapters } from './adapters'
import {
  registerSettingsIPCHandlers,
  registerCloudModelConfigIPCHandlers,
  registerLocalModelConfigIPCHandlers,
  ModelDownloadManagerIPCHandler
} from './runtime-services/ipc'
import { ModelConfigService } from './runtime-services/analysis/model-config-service'
import { libreOfficeDetector } from './runtime-services/system/libreoffice-detector'
import { loadIgnoreRules, shouldIgnoreFile } from './runtime-services/analysis/analysis-ignore-service'
import { SystemIdentityService } from './runtime-services/system/system-identity-service'
import { cloudSyncWorker } from './runtime-services/ai/cloud-sync-worker'
import { remoteConfigService } from './runtime-services/system/remote-config-service'
import { registerOllamaIPCHandlers } from './runtime-services/ipc/ollama-ipc-handler'
import { invitationService } from './runtime-services/invitation/invitation-service'
import { getCurrentPlatform } from './runtime-services/ai/ai-platform'

// 全局 LlamaIndexAIService 实例
let globalLlamaIndexService: LlamaIndexAIService | null = null

/**
 * 增强 AI 状态信息，将 ID 转换为友好名称
 */
const enrichAIStatus = (info: any) => {
  if (!info) return info;

  const enriched = { ...info };

  // 检查是否包含 API 密钥缺失相关的错误
  const isApiKeyError = enriched.error && (
    enriched.error.includes('API密钥不能为空') ||
    enriched.error.includes('API key is missing')
  );

  // 语言代码归一化处理
  const rawLanguage = configService.getValue<string>('DEFAULT_LANGUAGE') || 'zh-CN';
  const language = rawLanguage.startsWith('zh') ? 'zh-CN' : rawLanguage;

  // 推断 modelMode (针对 AICapabilities 等不包含 modelMode 的对象)
  if (!enriched.modelMode) {
    if (enriched.provider === 'local') {
      enriched.modelMode = 'local';
    } else if (enriched.provider) {
      enriched.modelMode = 'cloud';
    } else {
      // 最后的兜底：从配置中读取当前模式
      enriched.modelMode = configService.getValue<string>('AI_SERVICE_MODE') || 'local';
    }
  }

  logger.debug(LogCategory.MAIN, `[enrichAIStatus] 原始信息: mode=${enriched.modelMode}, name=${enriched.modelName}, provider=${enriched.provider}`);

  // 核心逻辑：如果处于云端模式且存在 API 密钥错误，
  // 说明尚未成功激活任何云端模型，此时应清除可能残留的本地模型名称。
  if (enriched.modelMode === 'cloud' && isApiKeyError) {
    enriched.modelName = null;
    if (!enriched.provider) enriched.provider = null;
  }

  try {
    if (enriched.modelMode === 'local' && enriched.modelName) {
      const models = modelService.listModels();
      const model = models.find(m => m.id === enriched.modelName);
      if (model) {
        enriched.modelName = model.name;
      }
    } else if (enriched.modelMode === 'cloud') {
      // 在云端模式下，provider 名称也需要友好化
      const providerId = String(enriched.provider || '').toLowerCase().trim();
      if (providerId) {
        const providers = ModelConfigService.getInstance().loadCloudProvidersConfig(language);
        const providerPreset = providers.find((p: any) => p.id.toLowerCase() === providerId);
        if (providerPreset) {
          enriched.provider = providerPreset.name;

          // 如果 modelName 是 ID，尝试从预设中找友好名称
          if (enriched.modelName && providerPreset.models) {
            const modelPreset = providerPreset.models.find((m: any) => m.id === enriched.modelName);
            if (modelPreset) {
              enriched.modelName = modelPreset.name;
            }
          }
        }
      }
    }
  } catch (err) {
    logger.error(LogCategory.MAIN, '增强 AI 状态失败:', err);
  }

  logger.debug(LogCategory.MAIN, `[enrichAIStatus] 增强后: mode=${enriched.modelMode}, name=${enriched.modelName}, provider=${enriched.provider}`);
  return enriched;
};

const forceConfigStage =
  process.argv.includes('--force-config-stage') ||
  process.env.FORCE_CONFIG_STAGE === '1' ||
  process.env.FORCE_CONFIG_STAGE?.toLowerCase() === 'true'

// 为 Node.js 环境提供 DOMMatrix 全局变量
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    m11 = 1;
    m12 = 0;
    m13 = 0;
    m14 = 0;
    m21 = 0;
    m22 = 1;
    m23 = 0;
    m24 = 0;
    m31 = 0;
    m32 = 0;
    m33 = 1;
    m34 = 0;
    m41 = 0;
    m42 = 0;
    m43 = 0;
    m44 = 1;

    constructor(init?: string | number[]) {
      // 简化的构造函数实现
    }

    static fromMatrix(other?: DOMMatrix | DOMMatrixInit): DOMMatrix {
      return new DOMMatrix();
    }

    static fromFloat32Array(array32: Float32Array): DOMMatrix {
      return new DOMMatrix();
    }

    static fromFloat64Array(array64: Float64Array): DOMMatrix {
      return new DOMMatrix();
    }

    multiply(other: DOMMatrix): DOMMatrix {
      return this;
    }

    multiplySelf(other: DOMMatrix): DOMMatrix {
      return this;
    }

    preMultiplySelf(other: DOMMatrix): DOMMatrix {
      return this;
    }

    translate(tx: number, ty: number, tz?: number): DOMMatrix {
      return this;
    }

    translateSelf(tx: number, ty: number, tz?: number): DOMMatrix {
      return this;
    }

    scale(scale: number, originX?: number, originY?: number): DOMMatrix {
      return this;
    }

    scaleSelf(scale: number, originX?: number, originY?: number): DOMMatrix {
      return this;
    }

    rotate(angle: number, originX?: number, originY?: number): DOMMatrix {
      return this;
    }

    rotateSelf(angle: number, originX?: number, originY?: number): DOMMatrix {
      return this;
    }

    rotateFromVector(x: number, y: number): DOMMatrix {
      return this;
    }

    rotateFromVectorSelf(x: number, y: number): DOMMatrix {
      return this;
    }

    skewX(sx: number): DOMMatrix {
      return this;
    }

    skewXSelf(sx: number): DOMMatrix {
      return this;
    }

    skewY(sy: number): DOMMatrix {
      return this;
    }

    skewYSelf(sy: number): DOMMatrix {
      return this;
    }

    invertSelf(): DOMMatrix {
      return this;
    }

    inverse(): DOMMatrix {
      return this;
    }

    transformPoint(point?: DOMPointInit): any {
      return { x: 0, y: 0, z: 0, w: 1 };
    }

    toFloat32Array(): Float32Array {
      return new Float32Array(16);
    }

    toFloat64Array(): Float64Array {
      return new Float64Array(16);
    }

    toString(): string {
      return '';
    }
  };
}


// 监听证书错误事件
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  logger.error(LogCategory.ERROR, `证书错误: ${error} URL: ${url}`);
  // 记录详细错误信息
  loggingService.error(LogCategory.ERROR, '证书验证失败', {
    url,
    error,
    certificateIssuer: certificate.issuer,
    certificateSubject: certificate.subject
  });

  // 阻止默认行为并发送错误信息到渲染进程
  event.preventDefault();
  callback(false);

  // 通知所有窗口发生了证书错误
  const allWindows = BrowserWindow.getAllWindows();
  allWindows.forEach(win => {
    win.webContents.send('ssl-certificate-error', { url, error });
  });
});

// 初始化 llama-server 服务
async function initializeLlamaServer(): Promise<void> {
  try {
    logger.log(LogCategory.STARTUP, '正在初始化 llama-server 服务...')

    // 使用统一AI服务进行健康检查
    const health = await llamaServerService.checkHealth()
    logger.log(LogCategory.STARTUP, '健康检查结果:', health)

    if (health.healthy) {
      logger.log(LogCategory.STARTUP, '✅ llama-server 服务已就绪')
    } else {
      logger.log(LogCategory.STARTUP, '⚠️ llama-server 服务未启动，将在需要时启动')
    }

  } catch (error) {
    logger.error(LogCategory.STARTUP, 'llama-server 初始化失败:', error)
    logger.error(LogCategory.MAIN, '错误详情:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    // 不抛出错误，允许应用继续运行
  }
}

// 标记初始化阶段是否已启动
let initializationPhaseStarted = false

// 初始化配置阶段所需的最小服务集合
async function initializeMinimalServices(): Promise<void> {
  try {
    logger.info(LogCategory.MAIN, '正在初始化配置阶段所需的最小服务...')
    logger.info(LogCategory.MAIN, '日志服务初始化成功')
    logger.info(LogCategory.MAIN, '错误处理服务初始化成功')
    logger.info(LogCategory.MAIN, '自动恢复服务初始化成功')
    logger.info(LogCategory.MAIN, '系统健康检查服务初始化成功')

    logger.info(LogCategory.MAIN, '正在初始化系统身份服务...')
    await SystemIdentityService.getInstance().initialize()
    logger.info(LogCategory.MAIN, '系统身份服务初始化成功')
    logger.info(LogCategory.MAIN, '正在初始化数据库服务...')
    const language = ConfigOrchestrator.getInstance().getValue<string>('DEFAULT_LANGUAGE')
    await initDatabaseAndDependentServices(language)
    logger.info(LogCategory.MAIN, '数据库服务初始化成功')
    logger.info(LogCategory.MAIN, '正在初始化配置服务...')
    logger.info(LogCategory.MAIN, '配置服务初始化成功')

    logger.info(LogCategory.MAIN, '正在初始化邀请服务...')
    try {
      // 确保 RemoteConfigService 已准备就绪
      // RemoteConfigService 在上方初始化依赖数据库服务时应该已经实例化，但可能没有显式调用 initialize
      // 这里确保 invitationService 能正常工作
      await invitationService.initialize()
      logger.info(LogCategory.MAIN, '邀请服务初始化成功')
    } catch (error) {
      logger.error(LogCategory.MAIN, '邀请服务初始化失败:', error)
    }

    logger.info(LogCategory.MAIN, '配置阶段最小服务初始化完成')
  } catch (error) {
    logger.error(LogCategory.MAIN, '最小服务初始化失败:', error)
    throw error
  }
}

// 初始化服务（应在用户完成配置阶段后调用）
async function initializeFullServices(): Promise<void> {
  if (initializationPhaseStarted) {
    logger.warn(LogCategory.MAIN, '完整初始化已启动，忽略重复调用')
    return
  }
  initializationPhaseStarted = true

  try {
    logger.info(LogCategory.MAIN, '进入初始化阶段，开始完整服务初始化...')

    logger.info(LogCategory.MAIN, '正在初始化统一AI服务...')

    // 设置身份提供者
    cloudAnalysisService.setIdentityProvider(SystemIdentityService.getInstance())

    // 初始化云端分析服务 (非阻塞)
    cloudAnalysisService.initialize().then(async () => {
      // 启动加载: 从云端拉取最新的维度定义
      try {
        const language = configService.getValue<string>('DEFAULT_LANGUAGE') || 'zh-CN';
        logger.info(LogCategory.MAIN, `正在从云端拉取维度定义 (语言: ${language})...`);
        const cloudDims = await cloudAnalysisService.fetchDimensions(language);

        if (cloudDims && cloudDims.length > 0 && databaseService.db) {
          const db = databaseService.db;
          db.transaction(() => {
            for (const dim of cloudDims) {
              // 修正：从云端拉取时，包含云端的自增 ID，确保两端主键对齐
              const tags = typeof dim.tags === 'string' ? dim.tags : JSON.stringify(dim.tags || [])
              const trigger_conditions = typeof dim.trigger_conditions === 'string' ? dim.trigger_conditions : (dim.trigger_conditions ? JSON.stringify(dim.trigger_conditions) : null)
              const applicable_file_types = typeof dim.applicable_file_types === 'string' ? dim.applicable_file_types : (dim.applicable_file_types ? JSON.stringify(dim.applicable_file_types) : null)
              const context_hints = typeof dim.context_hints === 'string' ? dim.context_hints : (dim.context_hints ? JSON.stringify(dim.context_hints) : null)

              // 使用 name 作为冲突检查，同时同步 id
              db.prepare(`
                INSERT INTO file_dimensions (
                  id, name, level, tags, trigger_conditions, is_ai_generated, description, 
                  applicable_file_types, context_hints, sync_status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?)
                ON CONFLICT(name) DO UPDATE SET
                  id = excluded.id,
                  level = excluded.level,
                  tags = CASE WHEN excluded.tags IS NOT NULL AND excluded.tags != '[]' THEN excluded.tags ELSE file_dimensions.tags END,
                  trigger_conditions = CASE WHEN excluded.trigger_conditions IS NOT NULL AND excluded.trigger_conditions != '[]' THEN excluded.trigger_conditions ELSE file_dimensions.trigger_conditions END,
                  is_ai_generated = excluded.is_ai_generated,
                  description = COALESCE(excluded.description, file_dimensions.description),
                  applicable_file_types = CASE WHEN excluded.applicable_file_types IS NOT NULL AND excluded.applicable_file_types != '[]' THEN excluded.applicable_file_types ELSE file_dimensions.applicable_file_types END,
                  context_hints = CASE WHEN excluded.context_hints IS NOT NULL AND excluded.context_hints != '[]' THEN excluded.context_hints ELSE file_dimensions.context_hints END,
                  sync_status = 2
              `).run(
                dim.id, dim.name, dim.level, tags, trigger_conditions,
                dim.is_ai_generated ? 1 : 0,
                dim.description, applicable_file_types,
                context_hints,
                dim.created_at || new Date().toISOString()
              );
            }
          })();
          logger.info(LogCategory.MAIN, `已同步 ${cloudDims.length} 个云端维度(含ID)到本地`);
        }
      } catch (err) {
        logger.warn(LogCategory.MAIN, '从云端拉取维度失败，使用本地缓存:', err);
      }
    }).catch(err => {
      logger.error(LogCategory.MAIN, '云端分析服务初始化失败:', err)
    })

    // 使用 LlamaIndexAIService 单例模式
    if (!globalLlamaIndexService) {
      globalLlamaIndexService = LlamaIndexAIService.getInstance(configService, llamaServerService, ConfigOrchestrator.getInstance())

      // 监听AI服务状态变更并广播给渲染进程
      globalLlamaIndexService.onStatusChange((info) => {
        const enrichedInfo = enrichAIStatus(info);
        logger.debug(LogCategory.MAIN, 'AI服务状态变更，广播给渲染进程:', enrichedInfo);
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('ai-model-status-changed', enrichedInfo);
        });
      });

      // 监听模型未下载事件并通知前端跳转到模型选择页面
      globalLlamaIndexService.onModelNotDownloaded((modelId) => {
        logger.info(LogCategory.MAIN, '检测到模型未下载，通知前端跳转到模型选择页面', { modelId });

        const windows = BrowserWindow.getAllWindows();
        logger.info(LogCategory.MAIN, `当前有 ${windows.length} 个窗口`);

        windows.forEach((win, index) => {
          logger.info(LogCategory.MAIN, `向窗口 ${index} 发送 model-not-downloaded 事件`, {
            id: win.id,
            isDestroyed: win.isDestroyed(),
            webContentsReady: !win.webContents.isDestroyed()
          });

          if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send('model-not-downloaded', { modelId });
            logger.info(LogCategory.MAIN, `已发送 model-not-downloaded 事件到窗口 ${index}`);
          } else {
            logger.warn(LogCategory.MAIN, `窗口 ${index} 已销毁，跳过发送事件`);
          }
        });
      });
    }
    try {
      await globalLlamaIndexService.initialize()
      logger.info(LogCategory.MAIN, '统一AI服务初始化成功')

      // AI 服务就绪后，初始化或更新 DirectoryContextService
      if (databaseService.db) {
        directoryContextService = new DirectoryContextService(databaseService.db, globalLlamaIndexService)
        logger.info(LogCategory.MAIN, '目录上下文服务已初始化 (AI 已就绪)')
      }
    } catch (error) {
      logger.error(LogCategory.MAIN, '统一AI服务初始化失败，将在后续使用时重试:', error)
      // 不阻塞其他服务的初始化
    }

    logger.info(LogCategory.MAIN, '正在初始化核心引擎...')
    try {
      // 使用适配器工厂创建适配器
      const adapters = await createCoreEngineAdapters()
      const resourcesPath = app.isPackaged
        ? process.resourcesPath
        : path.join(__dirname, '../../build/extraResources')

      const rendererConfig = configService.getConfig()
      const defaultLanguage = (rendererConfig.language || configService.getValue<LanguageCode>('DEFAULT_LANGUAGE') || 'zh-CN') as LanguageCode
      const queueConcurrency = configService.getValue<number>('QUEUE_MAX_CONCURRENCY') ?? 3
      const queueBatchSize = configService.getValue<number>('QUEUE_BATCH_SIZE') ?? 10
      const aiTemperature = configService.getValue<number>('MODEL_TEMPERATURE') ?? 0.7
      const aiMaxTokens = configService.getValue<number>('MODEL_MAX_TOKENS') ?? 2048
      const aiTimeout = configService.getValue<number>('AI_REQUEST_TIMEOUT') ?? 300000 // 默认5分钟
      const errorMaxRetries = configService.getValue<number>('ERROR_MAX_RETRIES') ?? 3
      const errorRetryDelay = configService.getValue<number>('ERROR_RETRY_DELAY') ?? 1000

      coreEngine = createCoreEngine(adapters, {
        language: defaultLanguage,
        resourcesPath,
        errorRecovery: {
          maxRetries: errorMaxRetries,
          retryDelay: errorRetryDelay,
          fileProcessingTimeout: aiTimeout,
          aiRequestTimeout: aiTimeout,
          unitRecognitionTimeout: 5000,
        },
        queue: {
          maxConcurrency: queueConcurrency,
          batchSize: queueBatchSize,
          enableAutoRetry: true,
        },
        ai: {
          temperature: aiTemperature,
          maxTokens: aiMaxTokens,
          timeout: aiTimeout,
          enableMultimodal: true,
        },
      })

      await coreEngine.initialize()

      coreEngine.on('event', (event: unknown) => {
        const allWindows = BrowserWindow.getAllWindows()
        allWindows.forEach(win => {
          win.webContents.send('core-engine-event', event)
        })
      })

      logger.info(LogCategory.MAIN, '核心引擎初始化成功')
    } catch (error) {
      logger.error(LogCategory.MAIN, '核心引擎初始化失败:', error)
    }

    logger.info(LogCategory.MAIN, '正在初始化文件监听服务...')
    try {
      await fileWatcherService.initialize()
      logger.info(LogCategory.MAIN, '文件监听服务初始化成功')
    } catch (error) {
      logger.error(LogCategory.MAIN, '文件监听服务初始化失败:', error)
    }

    logger.info(LogCategory.MAIN, '正在初始化分析队列服务...')
    try {
      await analysisQueueService.initialize()
      logger.info(LogCategory.MAIN, '分析队列服务初始化成功')
      // 启动队列处理循环 (非阻塞)
      void analysisQueueService.start()
    } catch (error) {
      logger.error(LogCategory.MAIN, '[analysis-queue] 分析队列服务初始化失败:', error)
    }

    registerServiceHealthChecks()

    // 启动云端同步 Worker
    cloudSyncWorker.start()

    logger.info(LogCategory.MAIN, '初始化阶段完成，所有服务已初始化')

    // 4. 同步云端配置 (不再每 5 分钟同步一次，仅启动时同步一次)
    logger.info(LogCategory.MAIN, '开始同步云端配置...')
    remoteConfigService.syncConfig().then(updatedKeys => {
      logger.info(LogCategory.MAIN, `云端配置同步返回结果: ${updatedKeys.length} 个更新项`, {
        updatedKeys,
        hasUpdates: updatedKeys.length > 0
      })

      if (updatedKeys && updatedKeys.length > 0) {
        logger.info(LogCategory.MAIN, `云端配置同步完成，更新了 ${updatedKeys.length} 个项目: ${updatedKeys.join(', ')}`)

        // 映射为用户友好的名称
        const categoryMap: Record<string, string> = {
          'PAN_DIMENSION_IDS': '维度系统',
          'CLOUD_MODEL_CONFIGS': '服务商列表',
          'LOCAL_MODEL_CONFIGS': '模型列表',
          'LOCAL_MODEL_CONFIGS_OLLAMA': 'Ollama模型列表',
          'LATEST_NEWS': '消息通知'
        }

        const updatedCategories = Array.from(new Set(
          updatedKeys.map(key => categoryMap[key] || key)
        ))

        logger.info(LogCategory.MAIN, `准备发送通知到渲染进程: ${updatedCategories.join(', ')}`)

        // 发送通知到渲染进程
        BrowserWindow.getAllWindows().forEach(window => {
          logger.debug(LogCategory.MAIN, `发送 remote-config:updated 事件到窗口`)
          window.webContents.send('remote-config:updated', updatedCategories)
        })
      } else {
        logger.info(LogCategory.MAIN, '云端配置同步完成，没有需要更新的项目')
      }
    }).catch(err => {
      logger.error(LogCategory.MAIN, '同步云端配置失败:', err)
    })
    logger.info(LogCategory.MAIN, '完整服务初始化完成')
  } catch (error) {
    logger.error(LogCategory.MAIN, '服务初始化失败:', error)
    loggingService.error(LogCategory.MAIN, '服务初始化失败', { error })
  }
}

// 核心引擎实例
let coreEngine: ICoreEngine | null = null

// 声明文件系统相关服务实例
let virtualDirectoryService: VirtualDirectoryService | null = null
let directoryContextService: DirectoryContextService | null = null
let organizeRealDirectoryService: OrganizeRealDirectoryService | null = null
let fileCleanupService: FileCleanupService | null = null

/**
 * 初始化数据库及依赖于数据库的服务
 * @param language 语言代码，用于隔离数据库
 */
async function initDatabaseAndDependentServices(language?: string): Promise<void> {
  try {
    logger.info(LogCategory.MAIN, `正在初始化数据库服务 (语言: ${language || '默认'})...`)
    await databaseService.initialize(language)

    if (databaseService.db) {
      // 重新实例化依赖于数据库连接的服务
      virtualDirectoryService = new VirtualDirectoryService(databaseService.db)

      // 注意：DirectoryContextService 需要 AI 服务实例，
      // 如果 globalLlamaIndexService 尚未初始化，这里可能需要特殊处理
      // 但在 initDatabaseAndDependentServices 中通常是在启动第一阶段
      // AI 服务在第二阶段初始化，所以这里我们延迟实例化或检查实例
      if (globalLlamaIndexService) {
        directoryContextService = new DirectoryContextService(globalLlamaIndexService)
      }

      organizeRealDirectoryService = new OrganizeRealDirectoryService(databaseService.db)
      fileCleanupService = new FileCleanupService(databaseService.db)
      logger.info(LogCategory.MAIN, '依赖数据库的业务服务初始化成功')
    } else {
      logger.error(LogCategory.MAIN, '数据库初始化失败，未获得有效的数据库实例')
    }
  } catch (error) {
    logger.error(LogCategory.MAIN, '初始化数据库及其依赖服务失败:', error)
    throw error
  }
}

configService.onConfigChange(async (newConfig) => {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('config:change', newConfig)
  })
})

// 监听语言切换，自动重新初始化数据库
configService.onValueChange<string>('DEFAULT_LANGUAGE', async (newLanguage, oldLanguage) => {
  if (newLanguage !== oldLanguage) {
    logger.info(LogCategory.MAIN, `语言由 ${oldLanguage} 切换为 ${newLanguage}，正在切换数据库...`)
    try {
      await initDatabaseAndDependentServices(newLanguage)

      // 重新加载分析队列服务的数据库依赖
      await analysisQueueService.reloadDatabase()

      // 强制同步云端配置以获取新语言的内容（如最新消息）
      logger.info(LogCategory.MAIN, '语言切换后强制同步云端配置...')
      remoteConfigService.syncConfig(true).then(updatedKeys => {
        logger.info(LogCategory.MAIN, `语言切换后配置同步返回结果: ${updatedKeys.length} 个更新项`, {
          updatedKeys,
          hasUpdates: updatedKeys.length > 0
        })

        if (updatedKeys && updatedKeys.length > 0) {
          logger.info(LogCategory.MAIN, `语言切换后配置同步完成，更新了: ${updatedKeys.join(', ')}`)
          // 映射并通知渲染进程... (逻辑同初始化)
          const categoryMap: Record<string, string> = {
            'PAN_DIMENSION_IDS': '维度系统',
          'CLOUD_MODEL_CONFIGS': '服务商列表',
          'LOCAL_MODEL_CONFIGS': '模型列表',
          'LOCAL_MODEL_CONFIGS_OLLAMA': 'Ollama模型列表',
          'LATEST_NEWS': '消息通知'
        }
          const updatedCategories = Array.from(new Set(
            updatedKeys.map(key => categoryMap[key] || key)
          ))

          logger.info(LogCategory.MAIN, `准备发送语言切换通知到渲染进程: ${updatedCategories.join(', ')}`)

          BrowserWindow.getAllWindows().forEach(window => {
            logger.debug(LogCategory.MAIN, `发送语言切换后的 remote-config:updated 事件到窗口`)
            window.webContents.send('remote-config:updated', updatedCategories)
          })
        } else {
          logger.info(LogCategory.MAIN, '语言切换后配置同步完成，没有需要更新的项目')
        }
      }).catch(err => {
        logger.error(LogCategory.MAIN, '语言切换后同步配置失败:', err)
      })

      // 通知渲染进程数据库已切换（可选，UI可能需要刷新）
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('database-switched', { language: newLanguage })
      })
    } catch (error) {
      logger.error(LogCategory.MAIN, '切换数据库失败:', error)
    }
  }
})

// 监听模型存储路径变更，刷新模型管理器和 AI 服务
configService.onValueChange<string>('MODEL_STORAGE_PATH', async (newPath, oldPath) => {
  if (newPath !== oldPath) {
    logger.info(LogCategory.MAIN, `模型存储路径由 ${oldPath} 切换为 ${newPath}，正在刷新模型管理器...`)
    try {
      // 1. 刷新模型管理器路径和缓存
      const { llamaModelManager } = await import('./runtime-services/llama/llama-model-manager')
      llamaModelManager.refreshBaseDirectory()

      // 2. 如果 AI 服务已初始化，触发重新加载以检测新路径下的模型状态
      if (globalLlamaIndexService) {
        logger.info(LogCategory.MAIN, '路径变更，触发 AI 服务重新加载配置以检测模型状态')
        // reloadConfig 内部如果检测到模型不存在，会抛出 ModelNotDownloadedError
        // 该错误会被 globalLlamaIndexService 的初始化逻辑捕获并触发 model-not-downloaded 事件
        await globalLlamaIndexService.reloadConfig().catch(err => {
          logger.warn(LogCategory.MAIN, 'AI 服务重新加载配置失败（可能是模型缺失）:', err.message)
        })
      }
    } catch (error) {
      logger.error(LogCategory.MAIN, '刷新模型路径相关服务失败:', error)
    }
  }
})

// 注册服务健康检查
function registerServiceHealthChecks(): void {
  // 注册数据库服务健康检查
  systemHealthService.registerServiceHealthCheck('database', async () => {
    try {
      const isConnected = await databaseService.isConnected()
      return {
        name: 'database',
        status: isConnected ? 'healthy' : 'critical',
        responseTime: 10,
        lastCheck: new Date(),
        details: { connected: isConnected }
      }
    } catch (error) {
      return {
        name: 'database',
        status: 'critical',
        responseTime: 0,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 注册AI服务健康检查
  systemHealthService.registerServiceHealthCheck('ai', async () => {
    try {
      if (!globalLlamaIndexService) {
        return {
          name: 'ai',
          status: 'warning',
          responseTime: 0,
          lastCheck: new Date(),
          details: { initialized: false, message: 'AI服务未创建' }
        }
      }

      const isInitialized = globalLlamaIndexService.isInitialized()
      return {
        name: 'ai',
        status: isInitialized ? 'healthy' : 'warning',
        responseTime: 5,
        lastCheck: new Date(),
        details: { initialized: isInitialized }
      }
    } catch (error) {
      return {
        name: 'ai',
        status: 'critical',
        responseTime: 0,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 注册配置服务健康检查
  systemHealthService.registerServiceHealthCheck('config', async () => {
    try {
      const config = configService.getConfig()
      return {
        name: 'config',
        status: 'healthy',
        responseTime: 1,
        lastCheck: new Date(),
        details: { configLoaded: true }
      }
    } catch (error) {
      return {
        name: 'config',
        status: 'critical',
        responseTime: 0,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 注册核心引擎健康检查
  systemHealthService.registerServiceHealthCheck('core-engine', async () => {
    try {
      if (!coreEngine) {
        return {
          name: 'core-engine',
          status: 'warning',
          responseTime: 0,
          lastCheck: new Date(),
          details: { initialized: false, message: '引擎未初始化' }
        }
      }

      const isInitialized = coreEngine.isInitialized()
      const snapshot = coreEngine.getQueueSnapshot()

      return {
        name: 'core-engine',
        status: isInitialized ? 'healthy' : 'warning',
        responseTime: 2,
        lastCheck: new Date(),
        details: {
          initialized: isInitialized,
          queueStatus: snapshot
        }
      }
    } catch (error) {
      return {
        name: 'core-engine',
        status: 'critical',
        responseTime: 0,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  logger.info(LogCategory.MAIN, '服务健康检查注册完成')
}

// IPC通信处理
async function setupIPCHandlers(): Promise<void> {
  // 文件操作相关
  ipcMain.handle('get-all-files', async () => {
    return await databaseService.getAllFiles()
  })

  ipcMain.handle('add-file', async (event, file: FileInfo) => {
    await databaseService.addFile(file)
  })


  // AI分类（通过LLM）- 已废弃，避免循环调用
  ipcMain.handle(
    'classify-file-with-llm',
    async (event, modelId: string, prompt: string, filename: string) => {
      logger.warn(LogCategory.MAIN, '[Main] classify-file-with-llm IPC处理器已废弃，请使用渲染进程中的本地AI分类')
      throw new Error('此IPC处理器已废弃，请使用渲染进程中的本地AI分类')
    }
  )

  // 配置相关
  ipcMain.handle('get-config', async () => {
    return configService.getConfig()
  })

  ipcMain.handle('update-config', async (event, updates: Partial<AppConfig>) => {
    configService.updateConfig(updates)

    // 广播配置变更到所有渲染进程
    const newConfig = configService.getConfig()
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('config:change', newConfig)
    })
  })

  ipcMain.handle('startup/get-flags', async () => {
    return {
      forceConfigStage,
    }
  })

  ipcMain.handle('startup/initialize-phase', async () => {
    // initializeFullServices 内部已经处理了重复调用的逻辑
    await initializeFullServices()
  })

  ipcMain.handle('config/update-value', async (_event, key: ConfigKey, value: unknown) => {
    configService.updateValue(key, value)

    // 广播配置变更到所有渲染进程
    const newConfig = configService.getConfig()
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('config:change', newConfig)
    })
  })

  // AI服务管理
  ipcMain.handle('ai-service/initialize', async () => {
    try {
      if (!globalLlamaIndexService) {
        globalLlamaIndexService = LlamaIndexAIService.getInstance(configService, llamaServerService, ConfigOrchestrator.getInstance())
      }

      // 仅当服务未初始化时记录日志
      const isInitialized = globalLlamaIndexService.isInitialized()
      if (!isInitialized) {
        logger.info(LogCategory.MAIN, '[IPC] 收到AI服务初始化请求，开始初始化...')
      }

      await globalLlamaIndexService.initialize()

      if (!isInitialized) {
        logger.info(LogCategory.MAIN, '[IPC] AI服务初始化完成')
      }

      return {
        success: true,
        message: 'LlamaIndex AI服务初始化成功'
      }
    } catch (error) {
      logger.error(LogCategory.MAIN, '[IPC] AI服务初始化失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '初始化失败'
      }
    }
  })

  ipcMain.handle('ai-service/is-initialized', async () => {
    try {
      if (!globalLlamaIndexService) {
        return false
      }
      const isInitialized = globalLlamaIndexService.isInitialized()
      logger.debug(LogCategory.MAIN, `[IPC] AI服务初始化状态查询: ${isInitialized}`)
      return isInitialized
    } catch (error) {
      logger.error(LogCategory.MAIN, '[IPC] 查询AI服务状态失败:', error)
      return false
    }
  })

  ipcMain.handle('ai-service/get-initialization-info', async () => {
    try {
      if (!globalLlamaIndexService) {
        return {
          isInitialized: false,
          isInitializing: false,
          attempts: 0,
          lastError: 'AI服务未创建'
        }
      }
      return globalLlamaIndexService.getInitializationInfo()
    } catch (error) {
      logger.error(LogCategory.MAIN, '[IPC] 获取AI服务初始化信息失败:', error)
      return {
        isInitialized: false,
        isInitializing: false,
        attempts: 0,
        lastError: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('ai-service/get-status', async () => {
    try {
      if (!globalLlamaIndexService) {
        return AIServiceStatus.UNINITIALIZED
      }
      return globalLlamaIndexService.getServiceStatus()
    } catch (error) {
      logger.error(LogCategory.MAIN, '[IPC] 获取AI服务状态失败:', error)
      return AIServiceStatus.ERROR
    }
  })

  ipcMain.handle('ai-service/get-capabilities', async () => {
    try {
      if (!globalLlamaIndexService) {
        return null
      }
      const capabilities = await globalLlamaIndexService.getCapabilities()
      return enrichAIStatus(capabilities)
    } catch (error) {
      logger.error(LogCategory.MAIN, '[IPC] 获取AI能力失败:', error)
      return null
    }
  })

  ipcMain.handle('ai-service/get-current-phase', async () => {
    try {
      if (!globalLlamaIndexService) {
        return 'configuration'
      }
      return globalLlamaIndexService.getCurrentPhaseState().currentPhase
    } catch (error) {
      logger.error(LogCategory.MAIN, '[IPC] 获取AI启动阶段失败:', error)
      return 'configuration'
    }
  })

  ipcMain.handle('ai-service/on-model-changed', async (_event, modelId: string) => {
    try {
      logger.info(LogCategory.MAIN, `[IPC] 收到模型切换通知: ${modelId}`)

      if (!globalLlamaIndexService) {
        logger.warn(LogCategory.MAIN, '[IPC] AI服务未创建，无法处理模型切换')
        return { success: false, message: 'AI服务未创建' }
      }

      // 内部会处理初始化
      await globalLlamaIndexService.onModelChanged(modelId)
      logger.info(LogCategory.MAIN, `[IPC] 模型切换通知处理完成: ${modelId}`)
      return { success: true, message: '模型切换通知已处理' }
    } catch (error) {
      logger.error(LogCategory.MAIN, '[IPC] 处理模型切换失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '处理失败'
      }
    }
  })

  // AI状态查询
  ipcMain.handle('get-ai-status', async () => {
    try {
      if (!globalLlamaIndexService) {
        return {
          modelName: null,
          modelMode: null,
          provider: null,
          loading: false,
          status: AIServiceStatus.UNINITIALIZED,
        };
      }
      const info = await globalLlamaIndexService.getCurrentModelInfo();
      return enrichAIStatus(info);
    } catch (error) {
      logger.error(LogCategory.MAIN, '[IPC] 获取AI状态失败:', error);
      return {
        modelName: null,
        modelMode: null,
        provider: null,
        loading: false,
        status: AIServiceStatus.ERROR,
      };
    }
  })

  // AI服务初始化（兼容性接口）
  ipcMain.handle('initialize-ai-service', async () => {
    try {
      if (!globalLlamaIndexService) {
        globalLlamaIndexService = LlamaIndexAIService.getInstance(configService, llamaServerService, ConfigOrchestrator.getInstance())
      }
      await globalLlamaIndexService.initialize()
      return {
        success: true,
        status: 'loaded',
        message: 'AI服务初始化成功'
      }
    } catch (error) {
      logger.error(LogCategory.MAIN, '[Main] AI服务初始化失败:', error)
      return {
        success: false,
        status: 'error',
        message: error instanceof Error ? error.message : '初始化失败'
      }
    }
  })

  // llama-server API 处理器
  ipcMain.handle('llama-server-chat', async (event, options: {
    model: string
    messages: Array<{ role: string; content: string }>
    temperature?: number
    maxTokens?: number
  }) => {
    try {
      logger.info(LogCategory.MAIN, '[Main] llama-server聊天请求:', { model: options.model, messageCount: options.messages.length })

      const chatRequest = {
        model: options.model,
        messages: options.messages,
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 500
      }

      const response = await llamaServerService.chatCompletion(chatRequest as any)
      logger.info(LogCategory.MAIN, '[Main] llama-server聊天完成')

      return response
    } catch (error) {
      logger.error(LogCategory.MAIN, '[Main] llama-server聊天失败:', error)
      throw error
    }
  })

  ipcMain.handle('llama-server-health', async (event) => {
    try {
      return await llamaServerService.checkHealth()
    } catch (error) {
      logger.error(LogCategory.MAIN, '[Main] 本地AI服务健康检查失败:', error)
      throw error
    }
  })

  // AI聊天接口
  ipcMain.handle('ai-chat', async (event, options: {
    model: string
    messages: Array<{ role: string; content: string }>
    temperature?: number
    max_tokens?: number
  }) => {
    try {
      logger.info(LogCategory.MAIN, '[Main] 收到AI聊天请求:', { model: options.model, messageCount: options.messages.length })

      const chatRequest = {
        model: options.model,
        messages: options.messages,
        temperature: options.temperature || 0.7,
        maxTokens: options.max_tokens || 4096
      }

      const response = await llamaServerService.chatCompletion(chatRequest as any)
      logger.debug(LogCategory.MAIN, 'message: ', JSON.stringify(response, null, 2))
      return response

    } catch (error) {
      logger.error(LogCategory.MAIN, '[Main] AI聊天请求失败:', error)
      throw error
    }
  })

  // 最小单元与单元查询
  ipcMain.handle('units/get-by-file', async (event, fileId: string) => {
    return await databaseService.getUnitsForFile(fileId)
  })
  ipcMain.handle('units/get-by-path', async (event, filePath: string) => {
    return await databaseService.getUnitsForPath(filePath)
  })

  // 获取文件和目录的AI分析结果
  ipcMain.handle('get-file-analysis-result', async (event, filePath: string) => {
    return await databaseService.getFileAnalysisResult(filePath)
  })
  ipcMain.handle('get-directory-analysis-result', async (event, dirPath: string) => {
    return await databaseService.getDirectoryAnalysisResult(dirPath)
  })

  // 模型与硬件
  ipcMain.handle('list-models', async () => {
    return modelService.listModels()
  })

  ipcMain.handle('get-hardware-info', async () => {
    return await modelService.getHardwareInfo()
  })

  ipcMain.handle('recommend-models-by-hardware', async (event, memoryGB: number, hasGPU: boolean, vramGB?: number) => {
    return modelService.recommendModelsByHardware(memoryGB, hasGPU, vramGB);
  })

  ipcMain.handle('get-model-path', async (event, modelId: string) => {
    return modelService.getModelPath(modelId);
  });

  ipcMain.handle('delete-model', async (event, modelId: string) => {
    return await modelService.deleteModel(modelId)
  })
  // 分析队列
  ipcMain.handle('analysis-queue/get', async () => {
    return analysisQueueService.getSnapshot()
  })
  ipcMain.handle('analysis-queue/add', async (event, items: { path: string; name: string; size: number; type: string }[], forceReanalyze?: boolean) => {
    try {
      analysisQueueService.addItems(items, !!forceReanalyze)
    } catch (error) {
      logger.error(LogCategory.MAIN, '[IPC] 添加分析队列项目失败:', error)
      throw error
    }
  })
  ipcMain.handle('analysis-queue/add-resolve', async (event, items: { path: string; name: string; size: number; type: string }[], forceReanalyze?: boolean) => {
    try {
      await analysisQueueService.addItemsResolved(items, !!forceReanalyze)
    } catch (error) {
      logger.error(LogCategory.MAIN, '[IPC] 添加解析分析队列项目失败:', error)
      throw error
    }
  })
  ipcMain.handle('analysis-queue/retry-failed', async () => {
    try {
      analysisQueueService.retryFailed()
    } catch (error) {
      logger.error(LogCategory.MAIN, '[IPC] 重试失败项目失败:', error)
      throw error
    }
  })
  ipcMain.handle('analysis-queue/clear-pending', async () => {
    try {
      analysisQueueService.clearPending()
    } catch (error) {
      logger.error(LogCategory.MAIN, '[IPC] 清理待处理项目失败:', error)
      throw error
    }
  })
  ipcMain.handle('analysis-queue/delete-item', async (event, id: string) => {
    try {
      analysisQueueService.deleteItem(id)
    } catch (error) {
      logger.error(LogCategory.MAIN, '[IPC] 删除队列项目失败:', error)
      throw error
    }
  })
  ipcMain.handle('analysis-queue/start', async () => {
    try {
      analysisQueueService.start()
    } catch (error) {
      logger.error(LogCategory.MAIN, '[IPC] 启动分析队列失败:', error)
      throw error
    }
  })
  ipcMain.handle('analysis-queue/pause', async () => {
    try {
      analysisQueueService.pause()
    } catch (error) {
      logger.error(LogCategory.MAIN, '[IPC] 暂停分析队列失败:', error)
      throw error
    }
  })

  // 对话框相关
  ipcMain.handle('show-open-dialog', async (event, options) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      return await dialog.showOpenDialog(window, options);
    }
    throw new Error('无法获取浏览器窗口');
  });

  ipcMain.handle('show-save-dialog', async (event, options) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      return await dialog.showSaveDialog(window, options);
    }
    throw new Error('无法获取浏览器窗口');
  });

  ipcMain.handle('show-message-box', async (event, options) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      return await dialog.showMessageBox(window, options);
    }
    throw new Error('无法获取浏览器窗口');
  });

  // 获取用户主目录路径
  ipcMain.handle('get-user-home-path', async () => {
    return os.homedir();
  });

  // 路径连接处理
  ipcMain.handle('join-path', async (event, basePath: string, relativePath: string) => {
    return path.join(basePath, relativePath);
  });

  // 写入文件
  ipcMain.handle('write-file', async (event, filePath: string, content: string) => {
    try {
      await fs.promises.writeFile(filePath, content, 'utf-8');
      return { success: true };
    } catch (error) {
      logger.error(LogCategory.MAIN, `写入文件失败: ${filePath}`, error);
      throw error;
    }
  });

  // 虚拟目录相关
  ipcMain.handle('virtual-directory/get-dimension-groups', async (event, workspaceDirectoryPath?: string, language?: string) => {
    if (!virtualDirectoryService) {
      throw new Error('虚拟目录服务未初始化')
    }
    // 如果没有传入语言，则使用当前配置的语言
    const currentLanguage = language || configService.getValue<string>('DEFAULT_LANGUAGE') || 'zh-CN'
    return await virtualDirectoryService.getDimensionGroups(workspaceDirectoryPath, currentLanguage)
  })

  ipcMain.handle('virtual-directory/get-filtered-files', async (event, params: {
    selectedTags: any[]
    sortBy: string
    sortOrder: string
    workspaceDirectoryPath?: string
    searchKeyword?: string
  }) => {
    if (!virtualDirectoryService) {
      throw new Error('虚拟目录服务未初始化')
    }
    return await virtualDirectoryService.getFilteredFiles(params as any)
  })

  ipcMain.handle('virtual-directory/save-directory', async (event, directory: any, workspaceDirectoryPath?: string) => {
    if (!virtualDirectoryService) {
      throw new Error('虚拟目录服务未初始化')
    }
    const virtualDirPath = await virtualDirectoryService.saveDirectory(directory, workspaceDirectoryPath)
    return virtualDirPath
  })

  ipcMain.handle('virtual-directory/batch-save-directories', async (event, directories: Array<{
    name: string
    filter: any
    path: string[]
  }>, workspaceDirectoryPath: string) => {
    if (!virtualDirectoryService) {
      throw new Error('虚拟目录服务未初始化')
    }
    return await virtualDirectoryService.batchSaveDirectories(directories, workspaceDirectoryPath)
  })

  ipcMain.handle('virtual-directory/get-saved-directories', async (event, workspaceDirectoryPath?: string) => {
    if (!virtualDirectoryService) {
      throw new Error('虚拟目录服务未初始化')
    }
    return await virtualDirectoryService.getSavedDirectories(workspaceDirectoryPath)
  })

  ipcMain.handle('virtual-directory/delete-directory', async (event, id: string, workspaceDirectoryPath?: string) => {
    if (!virtualDirectoryService) {
      throw new Error('虚拟目录服务未初始化')
    }
    return await virtualDirectoryService.deleteDirectory(id, workspaceDirectoryPath)
  })

  ipcMain.handle('virtual-directory/rename-directory', async (event, id: string, newName: string) => {
    if (!virtualDirectoryService) {
      throw new Error('虚拟目录服务未初始化')
    }
    return await virtualDirectoryService.renameDirectory(id, newName)
  })

  ipcMain.handle('virtual-directory/is-first', async (event, workspaceDirectoryPath?: string) => {
    if (!virtualDirectoryService) {
      throw new Error('虚拟目录服务未初始化')
    }
    return await virtualDirectoryService.isFirstVirtualDirectory(workspaceDirectoryPath)
  })

  ipcMain.handle('virtual-directory/cleanup', async (event, workspaceDirectoryPath: string) => {
    if (!virtualDirectoryService) {
      throw new Error('虚拟目录服务未初始化')
    }
    return await virtualDirectoryService.cleanupVirtualDirectory(workspaceDirectoryPath)
  })

  ipcMain.handle('virtual-directory/get-analyzed-files-count', async (event, workspaceDirectoryPath?: string) => {
    if (!virtualDirectoryService) {
      throw new Error('虚拟目录服务未初始化')
    }
    return await virtualDirectoryService.getAnalyzedFilesCount(workspaceDirectoryPath)
  })

  // 新增：直接根据预览树结构生成虚拟目录
  ipcMain.handle('virtual-directory/generate-from-preview-tree', async (event, params: {
    workspaceDirectoryPath: string
    directoryTree: any[]
    tagFileMap: any
    options: {
      flattenToRoot: boolean
      skipEmptyDirectories: boolean
      enableNestedClassification: boolean
    }
  }) => {
    if (!virtualDirectoryService) {
      throw new Error('虚拟目录服务未初始化')
    }
    // 将普通对象转换为Map，并确保类型正确
    const tagFileMapConverted = new Map<string, Array<{ name: string; smartName?: string; path?: string }>>(
      Object.entries(params.tagFileMap).map(([key, value]) => [
        key,
        Array.isArray(value) ? value : []
      ])
    )
    return await virtualDirectoryService.generateFromPreviewTree(
      params.workspaceDirectoryPath,
      params.directoryTree,
      tagFileMapConverted,
      params.options
    )
  })

  ipcMain.handle('reset-file-analysis', async (event, fileId: string) => {
    await databaseService.resetFileAnalysis(fileId)
    return { success: true }
  })

  // 文件清理相关
  ipcMain.handle('file-cleanup/delete-file', async (event, fileId: string) => {
    if (!fileCleanupService) {
      throw new Error('文件清理服务未初始化')
    }
    return await fileCleanupService.deleteFileAndCleanup(fileId)
  })

  ipcMain.handle('file-cleanup/batch-delete-files', async (event, fileIds: string[]) => {
    if (!fileCleanupService) {
      throw new Error('文件清理服务未初始化')
    }
    return await fileCleanupService.batchDeleteFiles(fileIds)
  })

  // 整理真实目录相关
  ipcMain.handle('organize-real-directory/by-virtual-directory', async (event, params: {
    workspaceDirectoryPath: string
    savedDirectories: any[]
  }) => {
    if (!organizeRealDirectoryService) {
      throw new Error('整理真实目录服务未初始化')
    }
    return await organizeRealDirectoryService.organizeByVirtualDirectory(
      params.workspaceDirectoryPath,
      params.savedDirectories
    )
  })

  ipcMain.handle('organize-real-directory/get-preview', async (event, params: {
    workspaceDirectoryPath: string
    savedDirectories: any[]
  }) => {
    if (!organizeRealDirectoryService) {
      throw new Error('整理真实目录服务未初始化')
    }
    return await organizeRealDirectoryService.getOrganizePreview(
      params.workspaceDirectoryPath,
      params.savedDirectories
    )
  })

  ipcMain.handle('organize-real-directory/open-directory', async (event, directoryPath: string) => {
    if (!organizeRealDirectoryService) {
      throw new Error('整理真实目录服务未初始化')
    }
    return await organizeRealDirectoryService.openOrganizedDirectory(directoryPath)
  })

  ipcMain.handle('organize-real-directory/delete-all-virtual-directories', async (event, workspaceDirectoryPath: string) => {
    if (!organizeRealDirectoryService) {
      throw new Error('整理真实目录服务未初始化')
    }
    return await organizeRealDirectoryService.deleteAllVirtualDirectories(workspaceDirectoryPath)
  })

  ipcMain.handle('organize-real-directory/get-saved-virtual-directories', async (event, workspaceDirectoryPath: string) => {
    if (!organizeRealDirectoryService) {
      throw new Error('整理真实目录服务未初始化')
    }
    return await organizeRealDirectoryService.getSavedVirtualDirectories(workspaceDirectoryPath)
  })

  ipcMain.handle('organize-real-directory/get-analyzed-files', async (event, workspaceDirectoryPath: string) => {
    if (!organizeRealDirectoryService) {
      throw new Error('整理真实目录服务未初始化')
    }
    return await organizeRealDirectoryService.getAnalyzedFiles(workspaceDirectoryPath)
  })

  ipcMain.handle('organize-real-directory/quick-organize', async (event, params: {
    workspaceDirectoryPath: string
    aiGeneratedStructure: unknown
  }) => {
    if (!organizeRealDirectoryService) {
      throw new Error('整理真实目录服务未初始化')
    }
    return await organizeRealDirectoryService.quickOrganize(
      params.workspaceDirectoryPath,
      params.aiGeneratedStructure as any
    )
  })

  // 一键整理 - 生成整理方案
  ipcMain.handle('organize-real-directory/generate-plan', async (event, params: {
    workspaceDirectoryPath: string
    options?: Omit<QuickOrganizeOptions, 'onProgress'>
  }) => {
    if (!organizeRealDirectoryService) {
      throw new Error('整理真实目录服务未初始化')
    }

    // 重置心跳计时器函数
    // 渲染进程（Electron IPC Client）可能存在默认的超时设置（如 90s）
    // 虽然 ipcMain.handle 本身不超时，但调用方可能会超时
    // 我们在这里尝试通过不断发送进度事件来维持连接活跃（如果客户端有相应机制）
    // 但更关键的是，我们希望本次IPC调用不要因为长时间运行而断开
    
    // 添加进度回调,通过IPC发送进度更新到前端
    const optionsWithProgress: QuickOrganizeOptions = {
      ...params.options,
      onProgress: (progress: unknown) => {
        // 发送进度更新事件到渲染进程
        event.sender.send('organize-plan-progress', progress)
      }
    }

    return await organizeRealDirectoryService.generateOrganizePlan(
      params.workspaceDirectoryPath,
      optionsWithProgress
    )
  })

  // 空文件夹扫描
  ipcMain.handle('empty-folder/scan', async (event, workspaceDirectoryPath: string) => {
    const { EmptyFolderScanner } = await import('@yonuc/core-engine')
    const { loadIgnoreRules } = await import('./runtime-services/analysis/analysis-ignore-service')

    const scanner = new EmptyFolderScanner()
    // 加载忽略规则并传递给扫描器
    const ignoreRules = loadIgnoreRules()
    return await scanner.scanEmptyFolders(workspaceDirectoryPath, ignoreRules)
  })

  // 空文件夹删除
  ipcMain.handle('empty-folder/delete', async (event, folderPaths: string[]) => {
    const { EmptyFolderScanner } = await import('@yonuc/core-engine')
    const scanner = new EmptyFolderScanner()
    return await scanner.deleteEmptyFolders(folderPaths)
  })

  // 注意：以下处理器已在 system-health-service.ts 中注册，避免重复注册

  // 注册设置相关的IPC处理器（包括工作目录管理）
  registerSettingsIPCHandlers()

  // 注册云端模型配置相关的IPC处理器
  registerCloudModelConfigIPCHandlers()

  // 注册本地模型配置相关的IPC处理器
  registerLocalModelConfigIPCHandlers()

  // 工作目录相关
  ipcMain.handle('add-workspace-directory', async (event, directory: WorkspaceDirectory) => {
    await databaseService.addWorkspaceDirectory(directory)
  })

  ipcMain.handle('get-current-workspace-directory', async () => {
    return await databaseService.getCurrentWorkspaceDirectory()
  })

  ipcMain.handle('set-current-workspace-directory', async (event, path: string) => {
    await databaseService.setCurrentWorkspaceDirectory(path)
  })

  // 目录上下文分析
  ipcMain.handle('analyze-directory-context', async (event, dirPath: string, force?: boolean) => {
    if (!directoryContextService) {
      throw new Error('目录上下文服务未初始化')
    }
    const currentLanguage = configService.getValue<string>('DEFAULT_LANGUAGE') || 'zh-CN'
    return await directoryContextService.analyzeDirectoryContext(dirPath, currentLanguage as LanguageCode, force)
  })

  ipcMain.handle('clear-directory-context', async (event, dirPath: string) => {
    if (!directoryContextService) {
      throw new Error('目录上下文服务未初始化')
    }
    return await directoryContextService.clearDirectoryContext(dirPath)
  })

  // 读取目录内容
  ipcMain.handle('read-directory', async (event, dirPath: string) => {
    try {
      // 即时对齐目录差异
      await fileWatcherService.syncDirectory(dirPath);

      const files: FileItem[] = []
      const directories: DirectoryItem[] = []

      // 加载忽略规则（用于真实目录浏览过滤显示）
      const ignoreRules = loadIgnoreRules()

      // 清理虚拟目录中的无效硬链接
      if (virtualDirectoryService) {
        try {
          await virtualDirectoryService.cleanupVirtualDirectory(dirPath)
        } catch (error) {
          logger.error(LogCategory.MAIN, '[Main] 清理虚拟目录失败:', error)
          // 不影响正常流程
        }
      }

      // 读取目录内容
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      
      logger.debug(LogCategory.MAIN, '读取到的目录项', { 
        dirPath,
        totalEntries: entries.length,
        entryNames: entries.map(e => `${e.name} ${e.isDirectory() ?'(dir)' : ''}`)
      })

      // 获取数据库连接以查询分析状态和缩略图路径
      const db = await databaseService.db
      if (!db) {
        throw new Error('数据库未初始化')
      }
      const getFileInfoStmt = db.prepare('SELECT id, smart_name, is_analyzed, last_analyzed_at, thumbnail_path, quality_score FROM files WHERE path = ?')

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        const shouldIgnore = shouldIgnoreFile(fullPath, entry.name, ignoreRules)
        if (shouldIgnore) {
          logger.debug(LogCategory.MAIN, '忽略项目', { 
            name: entry.name, 
            isDirectory: entry.isDirectory(),
            fullPath 
          })
          continue
        }

        const stats = fs.statSync(fullPath)
        const tempId = `${fullPath}:${stats.mtime.getTime()}` // 备用ID

        if (entry.isDirectory()) {
          directories.push({
            id: tempId,
            name: entry.name,
            path: fullPath,
            parentPath: dirPath,
            isDirectory: true,
            modifiedAt: stats.mtime,
            isExpanded: false
          })
        } else {
          // 查询文件的分析状态和缩略图路径
          const analysisInfo = getFileInfoStmt.get(fullPath) as any

          files.push({
            id: analysisInfo?.id || tempId, // 优先使用持久化ID
            name: entry.name,
            smartName: analysisInfo?.smart_name || undefined,
            path: fullPath,
            parentPath: dirPath,
            size: stats.size,
            extension: path.extname(entry.name).toLowerCase(),
            modifiedAt: stats.mtime,
            isSelected: false,
            isAnalyzed: analysisInfo?.is_analyzed === 1,
            lastAnalyzedAt: analysisInfo?.last_analyzed_at ? new Date(analysisInfo.last_analyzed_at) : undefined,
            thumbnailPath: analysisInfo?.thumbnail_path || undefined,
            qualityScore: analysisInfo?.quality_score || undefined
          })
        }
      }

      logger.debug(LogCategory.MAIN, '读取目录完成', { 
        dirPath, 
        filesCount: files.length, 
        directoriesCount: directories.length,
        directoryNames: directories.map(d => d.name)
      })

      return { files, directories }
    } catch (error) {
      logger.error(LogCategory.MAIN, '读取目录失败:', error)

      // 更详细的错误信息处理
      const errorMessage = error instanceof Error ? error : new Error(String(error))
      const errorCode = (errorMessage as any).code
      if (errorCode === 'EPERM' || errorCode === 'EACCES') {
        throw new Error(`权限不足，无法访问目录: ${dirPath}`)
      } else if (errorCode === 'ENOENT') {
        throw new Error(`目录不存在: ${dirPath}`)
      } else {
        throw new Error(`无法读取目录: ${dirPath} (${errorCode || errorMessage.message})`)
      }
    }
  })

  // 用系统默认程序打开文件
  ipcMain.handle('open-file-with-default-app', async (event, filePath: string) => {
    try {
      logger.info(LogCategory.MAIN, '[Main] 打开文件:', filePath)
      const result = await shell.openPath(filePath)
      if (result) {
        // openPath 返回空字符串表示成功，返回错误信息表示失败
        logger.error(LogCategory.MAIN, '[Main] 打开文件失败:', result)
        throw new Error(`无法打开文件: ${result}`)
      }
      logger.info(LogCategory.MAIN, '[Main] 文件已打开')
      return { success: true }
    } catch (error) {
      logger.error(LogCategory.MAIN, '[Main] 打开文件失败:', error)
      throw error
    }
  })

  // 用系统文件浏览器打开目录
  ipcMain.handle('open-path-in-explorer', async (event, dirPath: string) => {
    try {
      logger.info(LogCategory.MAIN, '[Main] 打开目录:', dirPath)
      const result = await shell.openPath(dirPath)
      if (result) {
        // openPath 返回空字符串表示成功，返回错误信息表示失败
        logger.error(LogCategory.MAIN, '[Main] 打开目录失败:', result)
        throw new Error(`无法打开目录: ${result}`)
      }
      logger.info(LogCategory.MAIN, '[Main] 目录已打开')
      return { success: true }
    } catch (error) {
      logger.error(LogCategory.MAIN, '[Main] 打开目录失败:', error)
      throw error
    }
  })

  // 检测LibreOffice是否已安装
  ipcMain.handle('detect-libreoffice', async () => {
    try {
      logger.info(LogCategory.MAIN, '[Main] 检测LibreOffice安装状态')
      const result = await libreOfficeDetector.detectLibreOffice()
      logger.info(LogCategory.MAIN, '[Main] LibreOffice检测结果:', result)
      return result
    } catch (error) {
      logger.error(LogCategory.MAIN, '[Main] LibreOffice检测失败:', error)
      return {
        installed: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 用系统浏览器打开外部链接
  ipcMain.handle('open-external', async (event, url: string) => {
    try {
      logger.info(LogCategory.MAIN, '[Main] 打开外部链接:', url)
      await shell.openExternal(url)
      logger.info(LogCategory.MAIN, '[Main] 外部链接已打开')
      return { success: true }
    } catch (error) {
      logger.error(LogCategory.MAIN, '[Main] 打开外部链接失败:', error)
      throw error
    }
  })

  // Window controls
  ipcMain.handle('window-minimize', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) {
      window.minimize()
    }
  })

  ipcMain.handle('window-maximize', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
    }
  })

  ipcMain.handle('window-is-maximized', () => {
    const window = BrowserWindow.getFocusedWindow()
    return window ? window.isMaximized() : false
  })

  ipcMain.handle('window-close', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) {
      window.close()
    }
  })

  // 核心引擎 IPC 处理器
  ipcMain.handle('core-engine-enqueue-file', async (event, input: {
    path: string
    name: string
    size: number
    type: string
    skipIfExists?: boolean
  }) => {
    try {
      if (!coreEngine) {
        throw new Error('核心引擎未初始化')
      }
      const fileId = await coreEngine.enqueueFile(input)
      logger.info(LogCategory.MAIN, `文件已入队: ${input.path}, ID: ${fileId}`)
      return fileId
    } catch (error) {
      logger.error(LogCategory.MAIN, '文件入队失败:', error)
      throw error
    }
  })

  ipcMain.handle('core-engine-enqueue-files', async (event, inputs: Array<{
    path: string
    name: string
    size: number
    type: string
    skipIfExists?: boolean
  }>) => {
    try {
      if (!coreEngine) {
        throw new Error('核心引擎未初始化')
      }
      const fileIds = await coreEngine.enqueueFiles(inputs)
      logger.info(LogCategory.MAIN, `批量文件已入队: ${inputs.length}个文件`)
      return fileIds
    } catch (error) {
      logger.error(LogCategory.MAIN, '批量文件入队失败:', error)
      throw error
    }
  })

  ipcMain.handle('core-engine-analyze-now', async (event, fileId: number) => {
    try {
      if (!coreEngine) {
        throw new Error('核心引擎未初始化')
      }
      const result = await coreEngine.analyzeNow(fileId)
      logger.info(LogCategory.MAIN, `文件分析完成: ${fileId}`)
      return result
    } catch (error) {
      logger.error(LogCategory.MAIN, '文件分析失败:', error)
      throw error
    }
  })

  ipcMain.handle('core-engine-start-queue', async () => {
    try {
      if (!coreEngine) {
        throw new Error('核心引擎未初始化')
      }
      await coreEngine.startQueue()
      logger.info(LogCategory.MAIN, '分析队列已启动')
    } catch (error) {
      logger.error(LogCategory.MAIN, '启动分析队列失败:', error)
      throw error
    }
  })

  ipcMain.handle('core-engine-stop-queue', async () => {
    try {
      if (!coreEngine) {
        throw new Error('核心引擎未初始化')
      }
      await coreEngine.stopQueue()
      logger.info(LogCategory.MAIN, '分析队列已停止')
    } catch (error) {
      logger.error(LogCategory.MAIN, '停止分析队列失败:', error)
      throw error
    }
  })

  ipcMain.handle('core-engine-get-queue-snapshot', () => {
    try {
      if (!coreEngine) {
        throw new Error('核心引擎未初始化')
      }
      return coreEngine.getQueueSnapshot()
    } catch (error) {
      logger.error(LogCategory.MAIN, '获取队列快照失败:', error)
      throw error
    }
  })

  ipcMain.handle('core-engine-get-dimensions', async (event, language: string) => {
    try {
      if (!coreEngine) {
        throw new Error('核心引擎未初始化')
      }
      const dimensions = await coreEngine.getDimensions(language as any)
      return dimensions
    } catch (error) {
      logger.error(LogCategory.MAIN, '获取维度列表失败:', error)
      throw error
    }
  })

  ipcMain.handle('core-engine-approve-dimension-expansion', async (event, expansionId: number) => {
    try {
      if (!coreEngine) {
        throw new Error('核心引擎未初始化')
      }
      await coreEngine.approveDimensionExpansion(expansionId)
      logger.info(LogCategory.MAIN, `维度扩展已批准: ${expansionId}`)
    } catch (error) {
      logger.error(LogCategory.MAIN, '批准维度扩展失败:', error)
      throw error
    }
  })

  ipcMain.handle('core-engine-reject-dimension-expansion', async (event, expansionId: number, reason: string) => {
    try {
      if (!coreEngine) {
        throw new Error('核心引擎未初始化')
      }
      await coreEngine.rejectDimensionExpansion(expansionId, reason)
      logger.info(LogCategory.MAIN, `维度扩展已拒绝: ${expansionId}`)
    } catch (error) {
      logger.error(LogCategory.MAIN, '拒绝维度扩展失败:', error)
      throw error
    }
  })

  ipcMain.handle('core-engine-get-pending-expansions', async () => {
    try {
      if (!coreEngine) {
        throw new Error('核心引擎未初始化')
      }
      return await coreEngine.getPendingDimensionExpansions()
    } catch (error) {
      logger.error(LogCategory.MAIN, '获取待审批维度扩展失败:', error)
      throw error
    }
  })

  ipcMain.handle('core-engine-is-initialized', () => {
    return coreEngine ? coreEngine.isInitialized() : false
  })

  ipcMain.on('renderer-error', (event, errorInfo) => {
    logger.error(LogCategory.RENDERER, '渲染进程出错:', errorInfo);
  });

  // 导入并注册 Ollama IPC 处理器
  // const { registerOllamaIPCHandlers } = require('./runtime-services/ipc/ollama-ipc-handler')
  // const { getCurrentPlatform } = require('./runtime-services/ai/ai-platform')
  
  // 根据平台类型注册相应的 IPC 处理器
  const currentPlatform = getCurrentPlatform()
  logger.info(LogCategory.MAIN, `[IPC] 当前 AI 平台: ${currentPlatform}`)
  
  // 注册模型下载管理 IPC 处理程序 (无论什么平台，UI 启动阶段都可能调用)
  try {
    ModelDownloadManagerIPCHandler.getInstance()
    logger.info(LogCategory.MAIN, '[IPC] 模型下载管理 IPC 处理程序注册完成')
  } catch (error: any) {
    logger.error(LogCategory.MAIN, '[IPC] 模型下载管理 IPC 处理程序注册失败:', error)
  }

  if (currentPlatform === 'ollama') {
    // Ollama 平台：注册 Ollama IPC 处理器
    try {
      registerOllamaIPCHandlers()
      logger.info(LogCategory.MAIN, '[IPC] Ollama IPC 处理程序注册完成')
    } catch (error: any) {
      logger.error(LogCategory.MAIN, '[IPC] Ollama IPC 处理程序注册失败:', error)
    }
  }
}

// 启动画面 HTML 模板，现在使用 boot.jpg
const getSplashHtml = (imagePath: string) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #09090b;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            overflow: hidden;
            -webkit-app-region: drag;
        }
        .bg-image {
            width: 100%;
            height: 100%;
            background-image: url('${imagePath}');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
        }
    </style>
</head>
<body>
    <div class="bg-image"></div>
</body>
</html>
`;

const createWindow = () => {
  logger.info(LogCategory.MAIN, '[createWindow] 开始创建主浏览器窗口...')

  // 创建 Splash Window
  const splashWindow = new BrowserWindow({
    width: 1024, // 增加宽度以适应图片
    height: 768,
    frame: false,
    resizable: false,
    center: true,
    show: true,
    skipTaskbar: true,
    backgroundColor: '#09090b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // 允许加载本地图片
    }
  })

  // 获取 boot.jpg 的绝对路径并转换为 file:// URL
  const bootImagePath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'boot.png')
    : path.join(app.getAppPath(), '../../assets', 'boot.png')

  const bootImageUrl = pathToFileURL(bootImagePath).toString()

  splashWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(getSplashHtml(bootImageUrl))}`)

  splashWindow.once('ready-to-show', () => {
    logger.info(LogCategory.MAIN, '[createWindow] 显示启动画面 (使用 boot.png)')
    splashWindow.show()
  })

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 1100,
    frame: false,
    show: false, // 窗口创建时隐藏
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 允许加载本地 file:// 资源，修复打包后 "Not allowed to load local resource" 问题
      webSecurity: false,
      sandbox: false, // 禁用sandbox以允许preload脚本访问Node.js API
    },
  })
  logger.info(LogCategory.MAIN, '[createWindow] 主浏览器窗口已创建，并设置为隐藏。')

  // 等待渲染进程内容加载完毕再显示窗口，防止白屏
  mainWindow.once('ready-to-show', () => {
    logger.info(LogCategory.MAIN, '[createWindow] 渲染进程内容已加载完毕，准备显示窗口。')
    if (!splashWindow.isDestroyed()) {
      splashWindow.destroy()
    }
    mainWindow.show()
    logger.info(LogCategory.MAIN, '[createWindow] 窗口已显示。')

    // Open the DevTools only in development mode.
    if (!app.isPackaged) {
      logger.info(LogCategory.MAIN, '[createWindow] 尝试打开开发者工具...')
      mainWindow.webContents.openDevTools()
      logger.info(LogCategory.MAIN, '[createWindow] 开发者工具已打开。')
    }
  })

  // 添加 F12 键监听器，用于切换开发者工具
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
        logger.info(LogCategory.MAIN, '[DevTools] 开发者工具已关闭 (F12)')
      } else {
        mainWindow.webContents.openDevTools()
        logger.info(LogCategory.MAIN, '[DevTools] 开发者工具已打开 (F12)')
      }
    }
  })

  // and load the index.html of the app.
  if (process.env['ELECTRON_RENDERER_URL']) {
    logger.info(LogCategory.MAIN, `[createWindow] 加载开发服务器URL: ${process.env['ELECTRON_RENDERER_URL']}`)
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    logger.info(LogCategory.MAIN, '[createWindow] 开发服务器URL加载完成。')
  } else {
    logger.info(LogCategory.MAIN, '[createWindow] 正在加载生产环境的index.html...')
    const indexHtml = path.join(__dirname, '../renderer/index.html')
    if (fs.existsSync(indexHtml)) {
      logger.info(LogCategory.MAIN, `[createWindow] 找到并加载生产环境index.html: ${indexHtml}`)
      mainWindow.loadURL(pathToFileURL(indexHtml).toString())
      logger.info(LogCategory.MAIN, '[createWindow] 生产环境index.html加载完成。')
    } else {
      logger.error(LogCategory.MAIN, `[createWindow] 生产环境index.html未找到: ${indexHtml}`)
    }
  }

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
// 全局异常兜底，避免未捕获异常导致进程退出
process.on('uncaughtException', (err) => {
  logger.error(LogCategory.MAIN, '[uncaughtException]', err)
})
process.on('unhandledRejection', (reason) => {
  logger.error(LogCategory.MAIN, '[unhandledRejection]', reason)
})

app.on('ready', async () => {
  logger.info(LogCategory.MAIN, '[App] 应用启动，进入配置阶段...')

  try {
    // 配置阶段：只初始化最小化服务
    // 将 package.json 中的 AI 平台配置注入 ConfigOrchestrator
    const platform = getCurrentPlatform()
    const orchestrator = ConfigOrchestrator.getInstance()
    orchestrator.updateValue('AI_PLATFORM', platform, { source: 'runtime' })
    // Explicitly update renderer config to ensure frontend receives it
    orchestrator.updateRendererConfig({ aiPlatform: platform } as any)
    logger.info(LogCategory.MAIN, `[App] 已将 AI 平台配置注入 ConfigOrchestrator (Unified & Renderer): ${platform}`)

    await initializeMinimalServices()
  } catch (error) {
    logger.error(LogCategory.MAIN, '[App] 最小服务初始化失败:', error)
  }

  try {
    logger.info(LogCategory.MAIN, '[App] 开始初始化 llama-server...')
    await initializeLlamaServer()
    logger.info(LogCategory.MAIN, '[App] llama-server 初始化完成')
  } catch (error) {
    logger.error(LogCategory.MAIN, '[App] llama-server 初始化失败:', error)
  }

  logger.on('log', ({ category, level, args }) => {
    const message = args[0] !== undefined ? String(args[0]) : ''
    const data = args.length > 1 ? args.slice(1) : undefined

    switch (level) {
      case 'info':
        loggingService.info(category, message, data)
        break
      case 'warn':
        loggingService.warn(category, message, data)
        break
      case 'error': {
        if (category === LogCategory.ERROR) {
          return
        }
        const errorData = data && Array.isArray(data) ? data.find(item => item instanceof Error) : undefined
        loggingService.error(category, message, data, errorData?.stack)
        break
      }
      case 'debug':
        loggingService.debug(category, message, data)
        break
      default:
        loggingService.info(category, message, data)
    }
  })

  await setupIPCHandlers()

  logger.info(LogCategory.MAIN, '[App] 准备创建主窗口...')
  createWindow()
  logger.info(LogCategory.MAIN, '[App] 主窗口创建指令已发送。')

  // AI服务状态变更监听已移至统一AI服务中处理
})

// 当所有窗口关闭时退出应用，除了 macOS。在那里，应用程序及其菜单栏通常会保持活动状态，直到用户使用 Cmd + Q 显式退出。
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 清理资源
    databaseService.close()
    // AI服务清理已移至统一AI服务中处理
    app.quit()
  }
})

// 应用退出前的清理
app.on('before-quit', async () => {
  logger.info(LogCategory.MAIN, '应用正在退出，清理资源...')

  try {
    // 清理文件监听服务
    await fileWatcherService.cleanup()

    // 停止系统健康检查服务
    await systemHealthService.stop()

    // 关闭数据库服务
    databaseService.close()

    // 释放AI服务资源
    try {
      const { unifiedAIService } = await import('./runtime-services/ai/unified-ai-service')
      await unifiedAIService.dispose()
    } catch (error) {
      logger.error(LogCategory.MAIN, 'AI服务清理失败:', error)
    }

    logger.info(LogCategory.MAIN, '资源清理完成')
  } catch (error) {
    logger.error(LogCategory.MAIN, '资源清理失败:', error)
    loggingService.error(LogCategory.MAIN, '资源清理失败', { error })
  }
})

// 在 macOS 上，当单击 dock 图标且没有其他窗口打开时，通常会重新创建一个窗口。
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 在此文件中，你可以包含应用程序的其他特定主进程代码。你也可以将它们放在单独的文件中并在此处导入。
