import { t } from '@app/languages'
import { EventEmitter } from 'events'
import { AIClassificationResult } from '@yonuc/types'
import { configService } from '../config/config-service'
import { modelService } from '../llama/model-service'
import { llamaServerService } from '@yonuc/electron-llamaIndex-service'
import { LlamaModelManager } from '../llama/llama-model-manager'
import { ModelCapabilityDetector } from '../llama/model-capability-detector'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { logger, LogCategory } from '@yonuc/shared'
import { AIServiceStatus } from '@yonuc/types'

/**
 * AI服务内部分类状态映射建议：
 * INITIALIZED -> IDLE
 * INITIALIZING -> INITIALIZING
 * ERROR -> ERROR
 * NOT_INITIALIZED -> UNINITIALIZED
 */

/**
 * AI模型服务类
 */
export class AIService extends EventEmitter {
  private currentModelId: string | null = null
  private serviceStatus: AIServiceStatus = AIServiceStatus.UNINITIALIZED
  private resolveInitialization: (() => void) | null = null;
  private rejectInitialization: ((error: Error) => void) | null = null;
  public initializationPromise: Promise<void>
  private initializationError: Error | null = null

  // AI请求配置
  private readonly aiRequestConfig = {
    defaultTimeout: 0,      // 将在constructor中从配置加载
    maxTimeout: 0,          // 将在constructor中从配置加载
    retryAttempts: 0,       // 将在constructor中从配置加载
    retryDelay: 0,          // 将在constructor中从配置加载
  }

  constructor() {
    super()
    
    if (logger) {
      logger.log(LogCategory.AI_SERVICE, '使用llama-server进行AI分析')
    }

    // 初始化初始化Promise
    this.initializationPromise = new Promise<void>((resolve, reject) => {
      this.resolveInitialization = resolve
      this.rejectInitialization = reject
    })

    // 从配置加载AI请求配置
    this.aiRequestConfig.defaultTimeout = configService.getValue<number>('AI_REQUEST_TIMEOUT') || 60000
    this.aiRequestConfig.maxTimeout = this.aiRequestConfig.defaultTimeout * 5 // 最大超时是默认的5倍
    this.aiRequestConfig.retryAttempts = 0 // AI 分析三阶段不进行重试
    this.aiRequestConfig.retryDelay = configService.getValue<number>('ERROR_RETRY_DELAY') || 1000
  }

  /**
   * 启动llama-server服务并加载指定模型
   */
  private async startLlamaServerWithModel(modelId: string): Promise<void> {
    try {
      // 使用llama模型管理器获取多模态模型配置
      const modelConfig = await LlamaModelManager.getInstance().getMultiModalModelConfig(modelId)
      if (!modelConfig) {
        throw new Error(`无法获取模型配置: ${modelId}`)
      }

      logger.log(LogCategory.AI_SERVICE, `启动llama-server，模型ID: ${modelId}`)
      logger.log(LogCategory.AI_SERVICE, `主模型路径: ${modelConfig.modelPath}`)
      if (modelConfig.mmprojPath) {
        logger.log(LogCategory.AI_SERVICE, `多模态投影路径: ${modelConfig.mmprojPath}`)
      }

      // 验证主模型文件是否存在
      try {
        const stats = await fs.promises.stat(modelConfig.modelPath)
        if (!stats.isFile()) {
          throw new Error(`模型路径不是文件: ${modelConfig.modelPath}`)
        }
        logger.log(LogCategory.AI_SERVICE, `主模型文件验证成功，大小: ${Math.round(stats.size / 1024 / 1024)}MB`)
      } catch (statError) {
        const errorMessage = `主模型文件不存在或无法访问: ${modelConfig.modelPath}`
        logger.error(LogCategory.AI_SERVICE, errorMessage)

        // 发送模型未下载事件到渲染进程，跳转到欢迎向导
        const { BrowserWindow } = await import('electron')
        const windows = BrowserWindow.getAllWindows()
        windows.forEach(win => {
          win.webContents.send('model-not-downloaded', { modelId })
        })

        throw new Error(errorMessage)
      }

      // 验证多模态投影文件（如果存在）
      if (modelConfig.mmprojPath) {
        try {
          const mmprojStats = await fs.promises.stat(modelConfig.mmprojPath)
          if (!mmprojStats.isFile()) {
            throw new Error(`多模态投影文件路径不是文件: ${modelConfig.mmprojPath}`)
          }
          logger.log(LogCategory.AI_SERVICE, `多模态投影文件验证成功，大小: ${Math.round(mmprojStats.size / 1024 / 1024)}MB`)
        } catch (statError) {
          const errorMessage = `多模态投影文件不存在或无法访问: ${modelConfig.mmprojPath}`
          logger.error(LogCategory.AI_SERVICE, errorMessage)

          // 发送模型未下载事件到渲染进程，跳转到欢迎向导
          const { BrowserWindow } = await import('electron')
          const windows = BrowserWindow.getAllWindows()
          windows.forEach(win => {
            win.webContents.send('model-not-downloaded', { modelId })
          })

          throw new Error(errorMessage)
        }
      }

      // 配置llama-server
      const threads = Math.max(2, Math.min(8, os.cpus().length)); // 根据CPU核心数调整线程数
      // 确保端口始终为8080，避免配置冲突
      const serverPort = 8172;
      const contextSize = configService.getValue<number>('CONTEXT_SIZE') || 4096
      const startupTimeout = configService.getValue<number>('MODEL_LOAD_TIMEOUT') || 60000
      const requestTimeout = configService.getValue<number>('AI_REQUEST_TIMEOUT') || 60000
      const serverConfig = {
        port: serverPort,
        modelPath: modelConfig.modelPath,
        mmprojPath: modelConfig.mmprojPath, // 添加多模态投影路径
        threads: threads,
        contextSize: contextSize, // 从配置读取上下文大小
        batchSize: 512, // 默认批处理大小
        gpuLayers: -1, // 自动检测GPU层数
        startupTimeout,
        requestTimeout,
      }

      logger.log(LogCategory.AI_SERVICE, '\n======== 服务器配置详情 ========')
      logger.log(LogCategory.AI_SERVICE, `端口: ${serverConfig.port} (固定使用端口${serverPort}，确保与健康检查一致)`)
      logger.log(LogCategory.AI_SERVICE, `模型路径: ${serverConfig.modelPath}`)
      if (serverConfig.mmprojPath) {
        logger.log(LogCategory.AI_SERVICE, `多模态投影路径: ${serverConfig.mmprojPath}`)
      }
      logger.log(LogCategory.AI_SERVICE, `线程数: ${serverConfig.threads}`)
      logger.log(LogCategory.AI_SERVICE, `上下文大小: ${serverConfig.contextSize}`)
      logger.log(LogCategory.AI_SERVICE, `批处理大小: ${serverConfig.batchSize}`)
      logger.log(LogCategory.AI_SERVICE, `GPU层数: ${serverConfig.gpuLayers}`)
      logger.log(LogCategory.AI_SERVICE, '==========================================\n')

      // 输出系统信息
      const cpuCount = os.cpus().length
      const totalMemoryMB = Math.round(os.totalmem() / 1024 / 1024)
      const freeMemoryMB = Math.round(os.freemem() / 1024 / 1024)
      logger.log(LogCategory.AI_SERVICE, '======== 系统信息 ========')
      logger.log(LogCategory.AI_SERVICE, `CPU: ${cpuCount} 核心`)
      logger.log(LogCategory.AI_SERVICE, `总内存: ${totalMemoryMB}MB`)
      logger.log(LogCategory.AI_SERVICE, `可用内存: ${freeMemoryMB}MB`)
      logger.log(LogCategory.AI_SERVICE, `操作系统: ${os.platform()} ${os.arch()}`)
      logger.log(LogCategory.AI_SERVICE, '====================================\n')

      // 启动服务器
      logger.log(LogCategory.AI_SERVICE, '正在启动 llama-server...')
      const serverProcess = await llamaServerService.startServer(serverConfig)

      // 等待服务器就绪（增加超时时间）
      const startupTimeoutValue = configService.getValue<number>('MODEL_LOAD_TIMEOUT') || 60000
      const retryInterval = 2000 
      let retries = Math.ceil(startupTimeoutValue / retryInterval) 

      while (retries > 0) {
        try {
          const health = await llamaServerService.checkHealth()
          if (health.healthy) {
            logger.log(LogCategory.AI_SERVICE, 'llama-server启动成功')
            // 清除模型能力缓存，以便重新检测运行时能力
            ModelCapabilityDetector.getInstance().clearCache()
            logger.log(LogCategory.AI_SERVICE, '已清除模型能力缓存')
            return
          }

          logger.log(LogCategory.AI_SERVICE, `等待llama-server启动... 剩余重试次数: ${retries}，健康状态: ${health.error || '未知'}`)
        } catch (healthError) {
          const errorMessage = healthError instanceof Error ? healthError : new Error(String(healthError))
          logger.log(LogCategory.AI_SERVICE, `健康检查失败: ${errorMessage.message}，剩余重试次数: ${retries}`)
        }

        // 检查进程是否还在运行
        const processInfo = llamaServerService.getProcessInfo()
        if (processInfo && processInfo.status === 'error') {
          // 获取进程日志来诊断问题
          const logs = llamaServerService.getProcessLogs(10)
          const errorLogs = logs.filter(log => log.level === 'error' || log.message.includes('error'))

          if (errorLogs.length > 0) {
            const lastError = errorLogs[errorLogs.length - 1]
            if (lastError.message.includes('unknown model architecture')) {
              throw new Error(`模型架构不兼容: ${modelId}。当前llama-server版本不支持此模型类型，请尝试使用其他模型或更新llama-server版本。`)
            } else if (lastError.message.includes('failed to load model')) {
              throw new Error(`模型加载失败: ${lastError.message}。请检查模型文件是否完整或尝试重新下载。`)
            }
          }

          throw new Error(`llama-server进程异常退出，请检查模型兼容性和系统资源`)
        }

        await new Promise(resolve => setTimeout(resolve, retryInterval))
        retries--
      }

      throw new Error('llama-server启动超时，请检查模型文件和系统资源')
    } catch (error) {
      logger.error(LogCategory.AI_SERVICE, '启动llama-server失败:', error)
      throw error
    }
  }



  /**
   * 重置初始化Promise
   */
  private resetInitializationPromise(): void {
    this.initializationPromise = new Promise<void>((resolve, reject) => {
      this.resolveInitialization = resolve;
      this.rejectInitialization = reject;
    });
  }

  /**
   * 初始化AI模型
   */
  async initialize(): Promise<void> {
    // 如果已经初始化完成，直接返回
    if (this.serviceStatus === AIServiceStatus.IDLE) {
      return this.initializationPromise
    }

    // 如果正在初始化，等待完成
    if (this.serviceStatus === AIServiceStatus.INITIALIZING) {
      return this.initializationPromise
    }

    // 如果之前初始化失败，重新开始
    if (this.serviceStatus === AIServiceStatus.ERROR) {
      this.resetInitializationPromise()
    }

    this.serviceStatus = AIServiceStatus.INITIALIZING
    this.initializationError = null

    let statusPayload: { modelName: string | null, status: string } = { modelName: null, status: 'not-loaded' };

    try {
      logger.info(LogCategory.AI_SERVICE, '[AI Service] 开始初始化AI服务...')

      const selectedModelId = configService.getValue<string>('SELECTED_MODEL_ID')
      logger.info(LogCategory.AI_SERVICE, `[AI Service] 读取到已选择的模型ID: ${selectedModelId}`);

      if (selectedModelId) {
        logger.info(LogCategory.AI_SERVICE, `用户已选择模型: ${selectedModelId}`)

        const status = await modelService.checkModelDownloadStatus(selectedModelId)
        if (status.isDownloaded) {
          logger.info(LogCategory.AI_SERVICE, `模型 ${selectedModelId} 已下载`)

          // 尝试启动llama-server服务，如果失败则使用备用方案
          try {
            logger.info(LogCategory.AI_SERVICE, '[AI Service] 尝试启动llama-server服务')
            await this.startLlamaServerWithModel(selectedModelId)
            logger.info(LogCategory.AI_SERVICE, '[AI Service] llama-server启动成功')
          } catch (llamaError) {
            const errorMessage = llamaError instanceof Error ? llamaError : new Error(String(llamaError))
            logger.warn(LogCategory.AI_SERVICE, '[AI Service] llama-server启动失败，将使用备用分类逻辑:', errorMessage.message)
            // 不抛出错误，继续使用备用分类逻辑
          }

          const model = modelService.listModels().find(m => m.id === selectedModelId);
          statusPayload = { modelName: model?.name || null, status: 'loaded' };
          this.currentModelId = selectedModelId
          this.serviceStatus = AIServiceStatus.IDLE
        } else {
          logger.warn(LogCategory.AI_SERVICE, `模型 ${selectedModelId} 尚未下载，无法加载`)
          statusPayload = { modelName: null, status: 'not-downloaded' };
          // 模型未下载不算初始化失败，只是功能不可用
          this.serviceStatus = AIServiceStatus.IDLE
        }
      } else {
        // 如果没有选择的模型，尝试加载已下载的模型
        logger.info(LogCategory.AI_SERVICE, '[AI Service] 未选择模型，尝试查找已下载的模型...')
        const models = modelService.listModels()
        let downloadedModel = null

        // 按推荐顺序查找已下载的模型
        const recommendedOrder = [
          "qwen3-0.6b-mlx-4bit",  // 超轻量苹果优化
          "gemma-3-1b-q4_0",      // 轻量高效
          "qwen3-4b",             // Qwen最新一代
          "qwen2.5-vl-7b-q2_k",   // 轻量视觉理解
          "gemma-3-4b-q4_0-mmproj", // 多语言视觉理解
          "Qwen3VL-4B-Instruct-Q8_0", // 高性能视觉+视频理解
          "qwen2.5-omni-7b-q4_k_m", // 平衡的多模态
          "gemma-3-12b-q4_0-mmproj", // 高性能视觉理解
          "qwen2.5-omni-7b-q8_0"  // 最高质量多模态
        ];

        for (const modelId of recommendedOrder) {
          const status = await modelService.checkModelDownloadStatus(modelId)
          if (status.isDownloaded) {
            downloadedModel = models.find(m => m.id === modelId);
            break;
          }
        }

        // 如果推荐顺序中没有找到，查找任何已下载的模型
        if (!downloadedModel) {
          for (const model of models) {
            const status = await modelService.checkModelDownloadStatus(model.id)
            if (status.isDownloaded) {
              downloadedModel = model;
              break;
            }
          }
        }

        if (downloadedModel) {
          logger.info(LogCategory.AI_SERVICE, `[AI Service] 找到已下载模型: ${downloadedModel.name}，AI功能可用`)
          configService.updateValue('SELECTED_MODEL_ID', downloadedModel.id)
          statusPayload = { modelName: downloadedModel.name, status: 'loaded' };
          this.currentModelId = downloadedModel.id
          this.serviceStatus = AIServiceStatus.IDLE
        } else {
          logger.warn(LogCategory.AI_SERVICE, '[AI Service] 未找到已下载的模型，AI功能将不可用')
          statusPayload = { modelName: null, status: 'not-downloaded' };
          // 没有可用模型不算初始化失败，只是功能不可用
          this.serviceStatus = AIServiceStatus.IDLE
        }
      }

      logger.info(LogCategory.AI_SERVICE, '[AI Service] AI服务初始化完成，状态:', statusPayload)

      // 初始化成功，解析Promise
      if (this.resolveInitialization) {
        this.resolveInitialization();
      }

    } catch (error) {
      logger.error(LogCategory.AI_SERVICE, '[AI Service] AI模型初始化失败:', error)
      this.serviceStatus = AIServiceStatus.ERROR
      this.initializationError = error as Error
      statusPayload = { modelName: null, status: 'error' };

      // 初始化失败，拒绝Promise
      if (this.rejectInitialization) {
        this.rejectInitialization(error as Error);
      }

      throw error
    }

    this.emit('status-changed', statusPayload);
  }

  /**
   * 通用AI推理接口
   * 供其他服务调用，执行自定义提示词推理
   * 支持多模态文件分析（图片、音频）
   */
  async inference(options: {
    prompt: string
    temperature?: number
    maxTokens?: number
    filePath?: string  // 用于多模态文件分析
  }): Promise<{
    success: boolean
    response?: string
    error?: string
  }> {
    // 检查服务状态
    if (this.serviceStatus !== AIServiceStatus.IDLE) {
      return {
        success: false,
        error: t('AI服务未初始化')
      }
    }

    // 如果没有加载模型，返回失败但不抛出异常
    if (!this.currentModelId) {
      return {
        success: false,
        error: t('未加载AI模型')
      }
    }

    return (llamaServerService as any).inference(options)
  }


  /**
   * 验证和优化分类结果
   */
  private validateAndOptimizeResult(result: any, filename: string): AIClassificationResult {
    const defaultResult: AIClassificationResult = {
      fileId: filename,
      timestamp: new Date(),
      category: t('未知'),
      confidence: 0.3,
      tags: [t('未分类')],
      summary: t('无法自动分类此文件'),
    }

    if (!result || typeof result !== 'object') {
      logger.warn(LogCategory.AI_SERVICE, `[AI Service] 无效的分类结果对象: ${filename}`)
      return defaultResult
    }

    // 验证和清理分类结果
    const validatedResult: AIClassificationResult = {
      fileId: filename,
      timestamp: new Date(),
      category: this.validateCategory(result.category, filename),
      confidence: this.validateConfidence(result.confidence),
      tags: this.validateTags(result.tags, filename),
      summary: this.validateSummary(result.summary, filename),
    }

    // 基于文件扩展名进行结果优化
    this.optimizeResultByFileType(validatedResult, filename)

    // 确保置信度合理
    this.adjustConfidenceBasedOnContent(validatedResult, filename)

    return validatedResult
  }

  /**
   * 验证分类类别
   */
  private validateCategory(category: any, filename: string): string {
    if (typeof category !== 'string' || !category.trim()) {
      // 基于文件扩展名推断默认分类
      const ext = path.extname(filename).toLowerCase()
      const defaultTags: Record<string, string> = {
        '.jpg': t('图片'), '.jpeg': t('图片'), '.png': t('图片'), '.gif': t('图片'), '.svg': t('图片'),
        '.mp4': t('视频'), '.mkv': t('视频'), '.avi': t('视频'), '.mov': t('视频'),
        '.mp3': t('音频'), '.wav': t('音频'), '.flac': t('音频'), '.m4a': t('音频'),
        '.pdf': t('文档'), '.doc': t('文档'), '.docx': t('文档'), '.txt': t('文档'), '.md': t('文档'),
        '.zip': t('压缩包'), '.rar': t('压缩包'), '.7z': t('压缩包'),
        '.exe': t('程序'), '.msi': t('程序'), '.app': t('程序')
      }
      return defaultTags[ext] || t('文件')
    }

    // 清理和标准化分类名称
    return category.trim().substring(0, 50) // 限制长度
  }

  /**
   * 验证置信度
   */
  private validateConfidence(confidence: unknown): number {
    if (typeof confidence !== 'number' || isNaN(confidence)) {
      return 0.5 // 默认中等置信度
    }

    // 确保置信度在0-1范围内
    return Math.min(Math.max(confidence, 0), 1)
  }

  /**
   * 验证标签数组
   */
  private validateTags(tags: unknown, filename: string): string[] {
    if (!Array.isArray(tags)) {
      // 基于文件名和扩展名生成基础标签
      const ext = path.extname(filename).toLowerCase()
      const baseName = path.basename(filename, ext).toLowerCase()

      const generatedTags: string[] = []

      // 添加文件类型标签
      if (ext) {
        generatedTags.push(ext.substring(1)) // 去掉点号
      }

      // 基于文件名关键词添加标签
      if (baseName.includes('screenshot') || baseName.includes('屏幕截图')) {
        generatedTags.push(t('截图'))
      }
      if (baseName.includes('photo') || baseName.includes('照片')) {
        generatedTags.push(t('照片'))
      }
      if (baseName.includes('document') || baseName.includes('文档')) {
        generatedTags.push(t('文档'))
      }

      return generatedTags.length > 0 ? generatedTags : [t('未分类')]
    }

    // 清理和验证现有标签
    return tags
      .filter((tag: unknown) => typeof tag === 'string' && tag.trim())
      .map((tag: string) => tag.trim().substring(0, 20)) // 限制标签长度
      .slice(0, 10) // 限制标签数量
  }

  /**
   * 验证摘要
   */
  private validateSummary(summary: unknown, filename: string): string {
    if (typeof summary !== 'string' || !summary.trim()) {
      return t('文件：', {filename: path.basename(filename)})
    }

    // 限制摘要长度并清理
    return summary.trim().substring(0, 200)
  }

  /**
   * 基于文件类型优化结果
   */
  private optimizeResultByFileType(result: AIClassificationResult, filename: string): void {
    const ext = path.extname(filename).toLowerCase()

    // 图片文件优化
    if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp'].includes(ext)) {
      if (!result.tags.includes(t('图片'))) {
        result.tags.unshift(t('图片'))
      }
      if (result.category === t('未知')) {
        result.category = t('图片')
        result.confidence = Math.max(result.confidence, 0.7)
      }
    }

    // 视频文件优化
    else if (['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv'].includes(ext)) {
      if (!result.tags.includes(t('视频'))) {
        result.tags.unshift(t('视频'))
      }
      if (result.category === t('未知')) {
        result.category = t('视频')
        result.confidence = Math.max(result.confidence, 0.7)
      }
    }

    // 音频文件优化
    else if (['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg'].includes(ext)) {
      if (!result.tags.includes(t('音频'))) {
        result.tags.unshift(t('音频'))
      }
      if (result.category === t('未知')) {
        result.category = t('音频')
        result.confidence = Math.max(result.confidence, 0.7)
      }
    }

    // 文档文件优化
    else if (['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf'].includes(ext)) {
      if (!result.tags.includes(t('文档'))) {
        result.tags.unshift(t('文档'))
      }
      if (result.category === t('未知')) {
        result.category = t('文档')
        result.confidence = Math.max(result.confidence, 0.6)
      }
    }
  }

  /**
   * 基于内容调整置信度
   */
  private adjustConfidenceBasedOnContent(result: AIClassificationResult, filename: string): void {
    // 如果分类结果与文件扩展名匹配，提高置信度
    const ext = path.extname(filename).toLowerCase()
    const category = result.category.toLowerCase()

    const typeMatches: Record<string, string[]> = {
      [t('图片')]: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp'],
      [t('视频')]: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv'],
      [t('音频')]: ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg'],
      [t('文档')]: ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf'],
      [t('压缩包')]: ['.zip', '.rar', '.7z', '.tar', '.gz'],
      [t('程序')]: ['.exe', '.msi', '.app', '.deb', '.rpm']
    }

    for (const [type, extensions] of Object.entries(typeMatches)) {
      if (category.includes(type.toLowerCase()) && extensions.includes(ext)) {
        result.confidence = Math.min(result.confidence + 0.2, 1.0)
        break
      }
    }

    // 如果标签数量较多且相关，提高置信度
    if (result.tags.length >= 3) {
      result.confidence = Math.min(result.confidence + 0.1, 1.0)
    }

    // 如果摘要内容丰富，提高置信度
    if (result.summary && result.summary.length > 50) {
      result.confidence = Math.min(result.confidence + 0.05, 1.0)
    }
  }

  /**
   * 释放资源
   */
  async dispose(): Promise<void> {
    // 释放 llama-server 资源
    if (this.currentModelId) {
      try {
        logger.info(LogCategory.AI_SERVICE, '[AI Service] 释放模型资源:', this.currentModelId)
        // 这里可以添加模型资源的释放逻辑
      } catch (error) {
        logger.error(LogCategory.AI_SERVICE, '[AI Service] 释放模型资源失败:', error)
      }
    }

    this.currentModelId = null
    this.serviceStatus = AIServiceStatus.UNINITIALIZED
  }

  /**
   * 检查模型是否已加载
   */
  isModelLoaded(): boolean {
    return this.serviceStatus === AIServiceStatus.IDLE && !!this.currentModelId
  }

  /**
   * 获取模型状态
   */
  getModelStatus(): string {
    switch (this.serviceStatus) {
      case AIServiceStatus.UNINITIALIZED:
        return 'not-initialized'
      case AIServiceStatus.INITIALIZING:
        return 'initializing'
      case AIServiceStatus.IDLE:
        return this.currentModelId ? 'loaded' : 'no-model'
      case AIServiceStatus.ERROR:
        return 'error'
      default:
        return 'unknown'
    }
  }

  /**
   * 通过IPC调用AI分类（带重试机制）
   */
  async classifyFileWithAI(
    id: string,
    modelId: string,
    prompt: string,
    filename: string,
    timeoutMs: number = this.aiRequestConfig.defaultTimeout
  ): Promise<AIClassificationResult> {
    // 等待初始化完成
    await this.initializationPromise

    if (this.serviceStatus !== AIServiceStatus.IDLE) {
      throw new Error(`AI服务未正确初始化，当前状态: ${this.serviceStatus}`)
    }

    if (!this.currentModelId) {
      throw new Error(t('没有可用的AI模型'))
    }

    // 限制超时时间范围
    const actualTimeout = Math.min(Math.max(timeoutMs, 30000), this.aiRequestConfig.maxTimeout)

    try {
      const result = await this.performAIClassification(id, prompt, filename, actualTimeout)

      // 验证和优化结果
      const validatedResult = this.validateAndOptimizeResult(result, filename)

      logger.info(LogCategory.AI_SERVICE, `[AI Service] AI分类成功: ${filename}`, {
        category: validatedResult.category,
        confidence: validatedResult.confidence,
        tagsCount: validatedResult.tags.length
      })

      return validatedResult
    } catch (error) {
      logger.error(LogCategory.AI_SERVICE, `[AI Service] AI分类失败: ${filename}`, error)
      throw error // AI 分析失败不再触发重试，直接抛出
    }
  }

  /**
   * 执行单次AI分类请求
   */
  private async performAIClassification(
    id: string,
    prompt: string,
    filename: string,
    timeoutMs: number
  ): Promise<AIClassificationResult> {
    // 检查是否有可用的渲染进程
    const windows = BrowserWindow.getAllWindows()
    if (windows.length === 0) {
      throw new Error(t('没有可用的渲染进程窗口'))
    }

    const mainWindow = windows[0]

    return new Promise<AIClassificationResult>((resolve, reject) => {
      let isResolved = false

      // 设置超时
      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true
          logger.error(LogCategory.AI_SERVICE, `[AI Service] 分类请求超时: ${id} (${timeoutMs}ms)`)
          ipcMain.removeAllListeners(id)
          reject(new Error(t('AI分类请求超时 {timeoutMs}ms', {timeoutMs: timeoutMs})))
        }
      }, timeoutMs)

      // 监听分类结果
      const resultHandler = (_event: unknown, result: AIClassificationResult | { error?: string; message?: string }) => {
        if (isResolved) return

        isResolved = true
        clearTimeout(timeout)
        ipcMain.removeAllListeners(id)

        try {
          // 检查结果是否为错误
          if (result && ('error' in result || 'message' in result)) {
            const errorResult = result as { error?: string; message?: string }
            const errorMsg = errorResult.error || errorResult.message || t('分类失败')
            reject(new Error(errorMsg))
            return
          }

          // 验证结果格式
          if (!result || !this.isValidClassificationResult(result)) {
            reject(new Error(t('收到无效的分类结果格式')))
            return
          }

          resolve(result as AIClassificationResult)

        } catch (handlerError) {
          const errorMessage = handlerError instanceof Error ? handlerError : new Error(String(handlerError))
          reject(new Error(`处理分类结果时出错: ${errorMessage.message}`))
        }
      }

      // 添加监听器
      ipcMain.once(id, resultHandler)

      // 发送分类请求到渲染进程
      try {
        logger.info(LogCategory.AI_SERVICE, `[AI Service] 发送分类请求:`, {
          id,
          modelId: this.currentModelId,
          promptLength: prompt.length,
          filename,
          timeout: timeoutMs
        })

        mainWindow.webContents.send('ai-classification-request', {
          id,
          modelId: this.currentModelId,
          prompt,
          filename
        })
      } catch (sendError) {
        if (!isResolved) {
          isResolved = true
          clearTimeout(timeout)
          ipcMain.removeAllListeners(id)
          const errorMessage = sendError instanceof Error ? sendError : new Error(String(sendError))
          reject(new Error(`发送分类请求失败: ${errorMessage.message}`))
        }
      }
    })
  }


  /**
   * 检查分类结果是否有效
   */
  private isValidClassificationResult(result: unknown): result is AIClassificationResult {
    if (!result || typeof result !== 'object') {
      return false
    }

    const obj = result as Record<string, unknown>
    return typeof obj.category === 'string' &&
      typeof obj.confidence === 'number' &&
      Array.isArray(obj.tags) &&
      typeof obj.summary === 'string'
  }

  /**
   * 重新初始化AI服务
   */
  async reinitialize(): Promise<void> {
    logger.info(LogCategory.AI_SERVICE, '[AI Service] 重新初始化AI服务...')

    // 重置状态
    this.serviceStatus = AIServiceStatus.UNINITIALIZED
    this.currentModelId = null
    this.initializationError = null
    this.resetInitializationPromise()

    // 重新初始化
    await this.initialize()
  }

  /**
   * 检查AI服务健康状态
   */
  async checkHealth(): Promise<{ healthy: boolean; message: string; modelId?: string; status?: string }> {
    try {
      if (this.serviceStatus === AIServiceStatus.INITIALIZING) {
        // 如果正在初始化，检查是否超时（例如5分钟）
        return {
          healthy: false,
          message: t('AI服务正在初始化中...'),
          status: this.serviceStatus
        }
      }

      if (this.serviceStatus === AIServiceStatus.ERROR) {
        return {
          healthy: false,
          message: t('AI服务初始化失败：{message}', {message: this.initializationError?.message || t('未知错误')}),
          status: this.serviceStatus
        }
      }

      if (this.serviceStatus !== AIServiceStatus.IDLE) {
        return {
          healthy: false,
          message: t('AI服务未正确初始化，当前状态：{serviceStatus}', {serviceStatus: this.serviceStatus}),
          status: this.serviceStatus
        }
      }

      if (!this.currentModelId) {
        return {
          healthy: false,
          message: t('没有可用的AI模型'),
          status: this.serviceStatus
        }
      }

      // 检查渲染进程是否可用
      const windows = BrowserWindow.getAllWindows()
      if (windows.length === 0) {
        return {
          healthy: false,
          message: t('没有可用的渲染进程窗口'),
          status: this.serviceStatus
        }
      }

      return {
        healthy: true,
        message: t('AI服务运行正常'),
        modelId: this.currentModelId,
        status: this.serviceStatus
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error : new Error(String(error))
      return {
        healthy: false,
        message: t('AI服务健康检查失败：{message}', {message: errorMessage.message}),
        status: this.serviceStatus
      }
    }
  }

  /**
   * 获取AI服务详细状态
   */
  getServiceStatus(): {
    status: AIServiceStatus
    modelId: string | null
    error: Error | null
    isHealthy: boolean
  } {
    return {
      status: this.serviceStatus,
      modelId: this.currentModelId,
      error: this.initializationError,
      isHealthy: this.serviceStatus === AIServiceStatus.IDLE && !!this.currentModelId
    }
  }

}

// 导出单例实例
export const aiService = new AIService()

