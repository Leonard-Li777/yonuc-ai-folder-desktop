/**
 * 分析队列服务 - 主服务类
 * 整合所有模块,实现完整的文件分析队列处理
 * 使用 @yonuc/core-engine 的服务
 */

import type { AnalysisQueueItem, AnalysisQueueSnapshot } from '@yonuc/types'
import {
  DimensionAnalyzer,
  FileDimensionService,
  FileInfoInput,
  QualityScoringService,
  UnitRecognitionService,
  fileAnalysisService,
  getMimeType
} from '@yonuc/core-engine'
import type { DimensionExpansion, DirectoryContextAnalysis } from '@yonuc/types'
import type { EnqueueInput, IErrorRecoveryConfig } from './types'
import { FileProcessorService, LanguageConfigService } from '@yonuc/core-engine'
import { LogCategory, logger } from '@yonuc/shared'
import { loadIgnoreRules, shouldIgnoreFile } from '../analysis/analysis-ignore-service'

import { AIServiceAdapter } from '../ai/ai-service-adapter'
import { BrowserWindow } from 'electron'
import { DirectoryContextService } from '../filesystem/directory-context-service'
import { DocumentFileProcessor } from '@yonuc/core-engine/services/analysis/document-file-processor'
import { ErrorHandler } from './error-handler'
import type { IIgnoreRule } from '@yonuc/types'
import type { LanguageCode } from '@yonuc/types'
import { QueueManager } from './queue-manager'
import { TextFileProcessor } from '@yonuc/core-engine/services/analysis/text-file-processor'
import { cloudAnalysisService } from '@yonuc/server'
import { configService } from '../config'
import { createCoreEngineAdapters } from '../../adapters'
import { createHash } from 'node:crypto'
import { databaseService } from '../database/database-service'
import fs from 'node:fs'
import path from 'node:path'
import { thumbnailService } from '../filesystem/thumbnail-service'

/**
 * 计算文件路径哈希 (用于唯一标识文件记录)
 */
function calculatePathHash(filePath: string): string {
  const normalizedPath = path.resolve(filePath).toLowerCase()
  return createHash('sha256').update(normalizedPath).digest('hex')
}

/**
 * 计算文件SHA-256哈希 (内容哈希)
 */
async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', err => {
      // 容错：如果读取失败（如锁定或系统文件），返回空内容哈希
      resolve('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * 判断提取的文本内容是否为人类可读
 */
function isHumanReadable(text: string | null | undefined): boolean {
  if (!text || text.length < 50) {
    return true;
  }

  const totalChars = text.length;
  let controlChars = 0;
  let spaceChars = 0;
  let cjkChars = 0;

  for (let i = 0; i < totalChars; i++) {
    const charCode = text.charCodeAt(i);
    if (charCode < 32 && charCode !== 10 && charCode !== 13 && charCode !== 9) {
      controlChars++;
    }
    if (charCode === 32) {
      spaceChars++;
    }
    if (charCode >= 0x4E00 && charCode <= 0x9FFF) {
      cjkChars++;
    }
  }

  const controlCharRatio = controlChars / totalChars;
  if (controlCharRatio > 0.1) {
    return false;
  }

  const cjkRatio = cjkChars / totalChars;
  if (cjkRatio > 0.05) {
    return true;
  }

  const spaceRatio = spaceChars / totalChars;
  if (spaceRatio < 0.07) {
    return false;
  }

  const words = text.trim().split(/\s+/);
  if (words.length < 10) {
    return true;
  }
  const totalWordLength = words.reduce((acc, word) => acc + word.length, 0);
  const avgWordLength = totalWordLength / words.length;

  if (avgWordLength > 20 || avgWordLength < 2.5) {
    return false;
  }

  return true;
}


/**
 * 分析队列服务类
 */
export class AnalysisQueueService {
  private queueManager!: QueueManager
  private errorHandler!: ErrorHandler
  private fileProcessor!: FileProcessorService

  private dimensionAnalyzer!: DimensionAnalyzer
  private qualityScoringService!: QualityScoringService
  private unitRecognitionService!: UnitRecognitionService
  private fileDimensionService?: FileDimensionService
  private directoryContextService?: DirectoryContextService
  private aiServiceAdapter?: AIServiceAdapter

  private running = false
  private current?: AnalysisQueueItem
  private isInitialized = false

  private ignoreRules: IIgnoreRule[] = []
  private errorRecoveryConfig: IErrorRecoveryConfig = {
    maxRetries: 0,
    retryDelay: 0,
    fileProcessingTimeout: 0,
    aiRequestTimeout: 0,
    unitRecognitionTimeout: 0,
  }

  private directoryContextCache: Map<string, DirectoryContextAnalysis> = new Map()

  private wakeUpResolver?: () => void
  private wakeUpPromise?: Promise<void>

  constructor() {
    logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 服务实例已创建')
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 开始初始化服务...')

    this.errorRecoveryConfig.maxRetries = configService.getValue<number>('ERROR_MAX_RETRIES') ?? 0
    this.errorRecoveryConfig.retryDelay = configService.getValue<number>('ERROR_RETRY_DELAY') ?? 1000
    this.errorRecoveryConfig.fileProcessingTimeout = 60000
    this.errorRecoveryConfig.aiRequestTimeout = configService.getValue<number>('AI_REQUEST_TIMEOUT') ?? 60000
    this.errorRecoveryConfig.unitRecognitionTimeout = 10000

    this.errorRecoveryConfig.enableFallbackProcessing = false
    this.errorRecoveryConfig.fallbackToBasicAnalysis = false

    let adapters
    try {
      adapters = await createCoreEngineAdapters()
    } catch (error) {
      logger.error(LogCategory.ANALYSIS_QUEUE, '[分析队列] 适配器创建失败:', error)
      adapters = null
    }

    this.errorHandler = new ErrorHandler(this.errorRecoveryConfig)

    if (adapters) {
      this.qualityScoringService = new QualityScoringService(
        adapters.logger,
        adapters.llamaRuntime,
        adapters.database,
        adapters.config,
        {
          qualityScorePrompt: configService.getValue('QUALITY_SCORE_PROMPT'),
          defaultScore: 3,
          defaultConfidence: 0.6
        },
        adapters.modelCapability
      )

      this.dimensionAnalyzer = new DimensionAnalyzer(
        adapters.logger,
        adapters.llamaRuntime,
        adapters.database,
        adapters.config,
        adapters.modelCapability
      )

      this.unitRecognitionService = new UnitRecognitionService(
        adapters.fileSystem,
        adapters.logger
      )

      this.fileProcessor = new FileProcessorService(
        adapters.logger,
        adapters.config,
        adapters.fileSystem,
        this.qualityScoringService,
        this.errorRecoveryConfig,
      )
    }

    if (adapters) {
      try {
        const db = databaseService.db
        if (!db) throw new Error('数据库连接不可用')

        this.aiServiceAdapter = new AIServiceAdapter()
        const languageConfigService = new LanguageConfigService(adapters.logger,
          adapters.fileSystem,
          adapters.llamaRuntime,
          adapters.config
        )

        this.fileDimensionService = new FileDimensionService(
          db, 
          this.aiServiceAdapter, 
          languageConfigService,
          adapters.modelCapability
        )
        const llamaIndexService = this.aiServiceAdapter.getAIService()
        this.directoryContextService = new DirectoryContextService(llamaIndexService)

        const userLanguage = (configService.getValue<LanguageCode>('DEFAULT_LANGUAGE') || 'zh-CN') as LanguageCode
        this.fileDimensionService.setCurrentLanguage(userLanguage)

        await this.fileDimensionService.initializeDimensionsForLanguage(userLanguage)
      } catch (error) {
        logger.error(LogCategory.ANALYSIS_QUEUE, '[分析队列] 维度系统初始化失败:', error)
      }
    }

    try {
      this.ignoreRules = loadIgnoreRules()
    } catch (error) {
      this.ignoreRules = []
    }

    this.queueManager = new QueueManager(this.ignoreRules, {
      onUpdate: () => this.emitUpdate(),
      onPersist: () => this.persist(),
      onWakeUp: () => this.wakeUp()
    })

    await this.queueManager.loadFromDB()
    await this.queueManager.validateQueueConsistency()

    this.isInitialized = true
    logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 服务初始化完成')
  }

  async reloadDatabase(): Promise<void> {
    if (!this.isInitialized || !this.aiServiceAdapter) return

    logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 正在重新加载数据库依赖...')

    const db = databaseService.db
    if (!db) {
      logger.error(LogCategory.ANALYSIS_QUEUE, '[分析队列] 无法重新加载：数据库未连接')
      return
    }

    try {
      // 重新创建依赖于 DB 实例的服务
      // 注意：QualityScoringService 等使用 DatabaseAdapter，而 DatabaseAdapter 已修改为动态获取 DB，所以无需重建

      // LanguageConfigService 依赖 adapters，adapters 应该没问题
      // 但 FileDimensionService 直接接收 db 实例，必须重建

      // 我们需要重新获取 adapter 中的 languageConfigService
      // 由于这里没有保存 languageConfigService 的引用，我们重新创建一个
      // 注意：这假设 LanguageConfigService 构造函数比较轻量
      const adapters = await createCoreEngineAdapters()
      const languageConfigService = new LanguageConfigService(
        adapters.logger,
        adapters.fileSystem,
        adapters.llamaRuntime,
        adapters.config
      )

      this.fileDimensionService = new FileDimensionService(
        db, 
        this.aiServiceAdapter, 
        languageConfigService,
        adapters.modelCapability
      )

      // DirectoryContextService 也重建一下，尽管它已改为动态获取 DB
      const llamaIndexService = this.aiServiceAdapter.getAIService()
      this.directoryContextService = new DirectoryContextService(llamaIndexService)

      const userLanguage = (configService.getValue<LanguageCode>('DEFAULT_LANGUAGE') || 'zh-CN') as LanguageCode
      this.fileDimensionService.setCurrentLanguage(userLanguage)

      await this.fileDimensionService.initializeDimensionsForLanguage(userLanguage)

      logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 数据库依赖重新加载完成')
    } catch (error) {
      logger.error(LogCategory.ANALYSIS_QUEUE, '[分析队列] 重新加载数据库依赖失败:', error)
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.emitUpdate();

    while (this.running) {
      const snapshot = this.queueManager.getSnapshot()
      const next = snapshot.items.find(i => i.status === 'pending')

      if (!next) {
        this.current = undefined
        this.emitUpdate()
        await this.createWakeUpPromise(1000)
        continue
      }

      this.current = next
      this.updateItemStatus(next.id, 'analyzing', 0)

      if (next.type === 'folder') {
        await this.processDirectory(next)
      } else {
        await this.processFile(next)
      }

      this.current = undefined
      this.emitUpdate()

      const updatedSnapshot = this.queueManager.getSnapshot()
      if (updatedSnapshot.items.filter(item => item.status === 'pending').length === 0) {
        await this.updateVirtualDirectoriesAfterQueueCompletion()
      }
    }
  }

  pause(): void {
    this.running = false
  }

  addItems(inputs: EnqueueInput[], forceReanalyze = false): void {
    if (!this.queueManager) throw new Error('分析队列服务未初始化')
    this.queueManager.addItems(inputs, forceReanalyze)
  }

  async addItemsResolved(inputs: EnqueueInput[], forceReanalyze = false): Promise<void> {
    if (!this.queueManager) throw new Error('分析队列服务未初始化')
    await this.queueManager.addItemsResolved(inputs, forceReanalyze)
  }

  deleteItem(id: string): void {
    if (!this.queueManager) throw new Error('分析队列服务未初始化')
    this.queueManager.deleteItem(id)
  }

  clearPending(): void {
    if (!this.queueManager) throw new Error('分析队列服务未初始化')
    this.queueManager.clearPending()
  }

  retryFailed(): void {
    if (!this.queueManager) throw new Error('分析队列服务未初始化')
    this.queueManager.retryFailed()
  }

  getSnapshot(): AnalysisQueueSnapshot {
    if (!this.queueManager) return { items: [], running: this.running, currentItemId: undefined };
    const snapshot = this.queueManager.getSnapshot(this.current?.id);
    return { ...snapshot, running: this.running };
  }

  private emitUpdate(): void {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(win => {
      if (!win.webContents.isDestroyed()) {
        try {
          win.webContents.send('analysis-queue-updated', this.getSnapshot())
        } catch (e) {
          logger.warn(LogCategory.ANALYSIS_QUEUE, '[分析队列] 发送更新失败，可能是窗口已销毁', e)
        }
      }
    })
  }

  private persist(): void { }

  private wakeUp(): void {
    if (this.wakeUpResolver) {
      this.wakeUpResolver()
      this.wakeUpResolver = undefined
      this.wakeUpPromise = undefined
    }
  }

  private createWakeUpPromise(timeout: number): Promise<void> {
    const timeoutPromise = new Promise<void>(resolve => setTimeout(resolve, timeout))
    this.wakeUpPromise = new Promise<void>(resolve => { this.wakeUpResolver = resolve })
    return Promise.race([timeoutPromise, this.wakeUpPromise])
  }

  private updateItemStatus(itemId: string, status: 'pending' | 'analyzing' | 'completed' | 'failed', progress: number, error?: string): void {
    const item = this.queueManager.getQueue().find(i => i.id === itemId)
    if (!item) return
    item.status = status
    item.progress = progress
    item.updatedAt = Date.now()
    if (error !== undefined) item.error = error

    try {
      databaseService.updateAnalysisQueue({ id: itemId, status, progress, error: error || null })
    } catch (e) { }
    this.emitUpdate()
  }

  private async processDirectory(item: AnalysisQueueItem): Promise<void> {
    try {
      await this.analyzeDirectoryContext(item.path)
      const unitResult = await this.fileProcessor.processUnitRecognitionWithTimeout(item.path)

      if (unitResult.isUnit) {
        const workspaceId = await databaseService.ensureWorkspaceId(path.dirname(item.path), path.basename(path.dirname(item.path)))
        await databaseService.createUnit({
          name: path.basename(item.path),
          type: unitResult.unitType || 'unit',
          path: item.path,
          groupingReason: unitResult.reason,
          groupingConfidence: unitResult.confidence,
          workspaceId: workspaceId,
        })
        this.updateItemStatus(item.id, 'completed', 100)
      } else {
        await this.expandDirectoryToQueue(item.path)
        this.updateItemStatus(item.id, 'completed', 100)
      }
    } catch (error) {
      this.updateItemStatus(item.id, 'failed', 100, error instanceof Error ? error.message : String(error))
    }
  }

  private async analyzeDirectoryContext(directoryPath: string): Promise<DirectoryContextAnalysis | null> {
    if (this.directoryContextCache.has(directoryPath)) return this.directoryContextCache.get(directoryPath)!
    if (!this.directoryContextService) return null
    const userLanguage = configService.getValue<LanguageCode>('DEFAULT_LANGUAGE') || 'zh-CN'
    const contextAnalysis = await this.directoryContextService.analyzeDirectoryContext(directoryPath, userLanguage as LanguageCode)
    this.directoryContextCache.set(directoryPath, contextAnalysis)
    return contextAnalysis
  }

  private async expandDirectoryToQueue(directoryPath: string): Promise<void> {
    const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
    const newItems: EnqueueInput[] = []
    for (const entry of entries) {
      const fullPath = path.join(directoryPath, entry.name)
      if (shouldIgnoreFile(fullPath, entry.name, this.ignoreRules)) continue
      if (entry.isDirectory()) {
        newItems.push({ path: fullPath, name: entry.name, size: 0, type: 'folder' })
      } else {
        const stat = fs.statSync(fullPath)
        newItems.push({ path: fullPath, name: entry.name, size: stat.size, type: path.extname(entry.name).slice(1) || 'file' })
      }
    }
    if (newItems.length > 0) this.addItems(newItems, false)
  }

  private async processFile(item: AnalysisQueueItem): Promise<void> {
    try {
      const workspaceId = await databaseService.ensureWorkspaceId(path.dirname(item.path), path.basename(path.dirname(item.path)))
      const directory = await databaseService.getWorkspaceDirectoryById(workspaceId)
      const isSpeedy = directory?.type !== 'PRIVATE'
      const language = configService.getValue<string>('DEFAULT_LANGUAGE') || 'zh-CN'

      let fileHash = ''
      let cloudCachedData: any = null

      if (isSpeedy) {
        this.updateItemStatus(item.id, 'analyzing', 5)
        const contentHash = await calculateFileHash(item.path)
        logger.info(LogCategory.ANALYSIS_QUEUE, `[分析队列] 开始检查云端缓存: ${item.name}, ContentHash: ${contentHash}`)

        // 检查文件是否已在本地分析过
        const existingFileInfo = await databaseService.getFileByPath(item.path)
        if (existingFileInfo?.isAnalyzed) {
          logger.info(LogCategory.ANALYSIS_QUEUE, `[分析队列] 文件已分析过，强制本地重分析，跳过缓存: ${item.path}`)
        } else {
          // 1. 尝试本地缓存 (具有相同内容哈希的其他文件)
          try {
            const localCachedFile = await databaseService.getAnalyzedFileByContentHash(contentHash)
            if (localCachedFile) {
              logger.info(LogCategory.ANALYSIS_QUEUE, `[分析队列] 命中本地内容缓存: ${item.name}, 来源: ${localCachedFile.path}`)
              const tags = await databaseService.getFileTagsByFileId(localCachedFile.id)
              cloudCachedData = { ...localCachedFile, tags }
            }
          } catch (localError) {
            logger.error(LogCategory.ANALYSIS_QUEUE, `[分析队列] 本地缓存检查失败: ${item.name}`, localError)
          }

          // 2. 如果本地未命中，尝试云端缓存
          if (!cloudCachedData) {
            try {
              cloudCachedData = await cloudAnalysisService.checkCloudCache(contentHash, language)
              if (cloudCachedData) {
                logger.info(LogCategory.ANALYSIS_QUEUE, `[分析队列] 命中云端缓存: ${item.name}`)
              }
            } catch (cloudError) {
              logger.error(LogCategory.ANALYSIS_QUEUE, `[分析队列] 云端缓存检查失败: ${item.name}`, cloudError)
            }
          }
        }
        fileHash = contentHash
      }

      if (cloudCachedData) {
        await this.saveCloudResultToDB(item, workspaceId, fileHash, cloudCachedData)
        this.updateItemStatus(item.id, 'completed', 100)
        return
      }

      const contentResult = await fileAnalysisService.process(item.path, item.type)
      const fileInfo: FileInfoInput = { path: item.path, name: item.name, type: item.type, size: contentResult.metadata?.fileSize || 0, content: contentResult.content, metadata: contentResult.metadata }

      this.updateItemStatus(item.id, 'analyzing', 10)
      if (!fileHash) fileHash = await calculateFileHash(item.path)
      const fileId = calculatePathHash(item.path)

      const db = databaseService.db
      if (!db) throw new Error('数据库连接不可用')

      const existingFile = db.prepare('SELECT id FROM files WHERE path = ?').get(item.path) as { id: string } | undefined
      if (!existingFile || existingFile.id !== fileId) {
        const stats = fs.statSync(item.path)
        db.prepare(`INSERT OR REPLACE INTO files (id, content_hash, path, name, size, type, mime_type, content, metadata, sync_status, created_at, modified_at, accessed_at, updated_at, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`).run(
          fileId, fileHash, item.path, item.name, stats.size, item.type, getMimeType(item.type), null, JSON.stringify(fileInfo.metadata),
          new Date(stats.birthtime).toISOString(), new Date(stats.mtime).toISOString(), new Date(stats.atime).toISOString(), new Date().toISOString(), workspaceId
        )
      }

      const rootWorkspaceDir = await databaseService.findRootWorkspaceDirectory(item.path)
      let thumbnailRelativePath: string | undefined = undefined
      if (rootWorkspaceDir) {
        const thumbResult = await thumbnailService.generateThumbnail({ fileId: fileHash, filePath: item.path, smartName: item.name, workspaceDirectoryPath: rootWorkspaceDir.path })
        if (thumbResult.success) thumbnailRelativePath = thumbResult.relativePath
      }

      const processResult = this.fileProcessor 
        ? await this.fileProcessor.processFileWithTimeout(
            fileId, 
            fileInfo, 
            thumbnailRelativePath ? path.join(rootWorkspaceDir!.path, thumbnailRelativePath) : undefined, 
            this.errorRecoveryConfig.fileProcessingTimeout
          ) 
        : { content: contentResult.content, metadata: contentResult.metadata, qualityScore: 3, qualityConfidence: 0.5, multimodalContent: undefined }

      this.updateItemStatus(item.id, 'analyzing', 30)
      const extractedContent = processResult.content || null
      const isReadable = isHumanReadable(extractedContent)

      db.prepare(`UPDATE files SET content = ?, thumbnail_path = ?, multimodal_content = ?, mime_type = ?, metadata = ?, sync_status = 0 WHERE id = ?`).run(
        (new TextFileProcessor().canProcess(item.name, item.type) || new DocumentFileProcessor().canProcess(item.name, item.type)) && isReadable ? extractedContent : null,
        thumbnailRelativePath || null, processResult.multimodalContent || null, processResult.metadata?.mimeType || getMimeType(item.type), JSON.stringify(processResult.metadata), fileId
      )

      if (!this.aiServiceAdapter || !this.fileDimensionService) throw new Error('AI服务未就绪')
      const directoryContext = await this.analyzeDirectoryContext(path.dirname(item.path))
      const existingDimensions = await this.fileDimensionService.getDimensionsByLanguage(language as LanguageCode)

      const dimResult = await this.dimensionAnalyzer.analyzeFileWithDimensions(item.path, item.name, item.type, fileInfo.size, extractedContent || '', processResult.multimodalContent, processResult.qualityScore || 3, processResult.metadata, existingDimensions, directoryContext)
      if (!dimResult) throw new Error('维度分析失败')

      await this.dimensionAnalyzer.saveDimensionAnalysisResults(fileId, item.path, dimResult)
      if (dimResult.newDimensions) await this.processNewDimensionSuggestions(dimResult.newDimensions, fileId)

      this.updateItemStatus(item.id, 'completed', 100)
    } catch (error) {
      this.updateItemStatus(item.id, 'failed', 100, error instanceof Error ? error.message : String(error))
    }
  }

  private async saveCloudResultToDB(item: AnalysisQueueItem, workspaceId: number, fileHash: string, data: any): Promise<void> {
    try {
      const db = databaseService.db
      if (!db) throw new Error('数据库未初始化')
      const stats = fs.statSync(item.path)
      // 增加 workspace_id 过滤
      const existingFile = db.prepare('SELECT id FROM files WHERE path = ? AND workspace_id = ?').get(item.path, workspaceId) as { id: string } | undefined

      const fileId = calculatePathHash(item.path)
      const fileData = {
        id: fileId,
        path: item.path,
        name: item.name,
        smart_name: data.smart_name || item.name,
        size: stats.size,
        type: item.type,
        mime_type: data.mime_type || 'application/octet-stream',
        content_hash: fileHash,
        content: data.content || '',
        description: data.description,
        multimodal_content: data.multimodal_content,
        quality_score: data.quality_score,
        quality_confidence: data.quality_confidence,
        quality_reasoning: data.quality_reasoning,
        quality_criteria: typeof data.quality_criteria === 'string' ? data.quality_criteria : JSON.stringify(data.quality_criteria || {}),
        grouping_reason: data.grouping_reason,
        grouping_confidence: data.grouping_confidence,
        author: data.author,
        language: data.language,
        is_analyzed: 1,
        last_analyzed_at: new Date().toISOString(),
        metadata: typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata || {}),
        workspace_id: workspaceId,
        sync_status: 2,
        created_at: new Date(stats.birthtime).toISOString(),
        modified_at: new Date(stats.mtime).toISOString(),
        accessed_at: new Date(stats.atime).toISOString(),
        updated_at: new Date().toISOString()
      }

      const runTransaction = db.transaction(() => {
        // 使用 INSERT OR REPLACE 自动处理旧 ID 到新 ID 的迁移（通过 Path+WorkspaceId 唯一约束）
        // 这样即使原有记录的 ID 是内容 Hash，现在也会被改为路径 Hash
        db.prepare(`INSERT OR REPLACE INTO files (id, content_hash, path, name, smart_name, size, type, mime_type, content, description, multimodal_content, quality_score, quality_confidence, quality_reasoning, quality_criteria, grouping_reason, grouping_confidence, author, language, is_analyzed, last_analyzed_at, metadata, workspace_id, sync_status, created_at, modified_at, accessed_at, updated_at) VALUES (@id, @content_hash, @path, @name, @smart_name, @size, @type, @mime_type, @content, @description, @multimodal_content, @quality_score, @quality_confidence, @quality_reasoning, @quality_criteria, @grouping_reason, @grouping_confidence, @author, @language, @is_analyzed, @last_analyzed_at, @metadata, @workspace_id, @sync_status, @created_at, @modified_at, @accessed_at, @updated_at)`).run(fileData)

        if (data.tags && Array.isArray(data.tags)) {
          // 在插入新关系前，先根据最新的 fileId 清理旧的关系
          db.prepare('DELETE FROM file_tag_relations WHERE file_id = ?').run(fileId)

          const insertTag = db.prepare(`INSERT OR REPLACE INTO file_tags (id, name, dimension_id, sync_status, created_at) VALUES (?, ?, ?, 2, CURRENT_TIMESTAMP)`)
          const insertRel = db.prepare(`INSERT OR REPLACE INTO file_tag_relations (file_id, tag_id, sync_status) VALUES (?, ?, 2)`)

          for (const tag of data.tags) {
            if (tag.id && tag.name) {
              insertTag.run(tag.id, tag.name, tag.dimension_id || 'unknown')
              insertRel.run(fileId, tag.id)
            }
          }
        }
      })

      runTransaction()
    } catch (error) {
      logger.error(LogCategory.ANALYSIS_QUEUE, '[AI分析] 保存云端结果失败:', error)
      throw error
    }
  }

  private async processNewDimensionSuggestions(suggestions: DimensionExpansion[], fileId: string): Promise<void> {
    if (!this.fileDimensionService) return
    for (const suggestion of suggestions) {
      try {
        const expansionId = await this.fileDimensionService.saveDimensionExpansion({ ...suggestion, triggerFileId: fileId as any })
        await this.fileDimensionService.approveDimensionExpansion(expansionId)
      } catch (error) { }
    }
  }

  private async updateVirtualDirectoriesAfterQueueCompletion(): Promise<void> {
    try {
      const db = databaseService.db
      if (!db) return
      const directoriesWithVirtualDirs = db.prepare(`SELECT DISTINCT md.path FROM workspace_directories md INNER JOIN virtual_directories vd ON vd.workspace_id = md.id`).all() as Array<{ path: string }>
      if (!directoriesWithVirtualDirs || directoriesWithVirtualDirs.length === 0) return
      const { VirtualDirectoryService } = await import('../filesystem/virtual-directory-service')
      for (const directory of directoriesWithVirtualDirs) {
        try {
          await new VirtualDirectoryService(db).updateAllVirtualDirectories(directory.path)
        } catch (error) { }
      }
    } catch (error) { }
  }
}

export const analysisQueueService = new AnalysisQueueService()
export default analysisQueueService