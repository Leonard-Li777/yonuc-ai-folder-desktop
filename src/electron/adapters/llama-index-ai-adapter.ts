/**
 * LlamaIndex AI适配器
 * 实现Core Engine与AI服务的解耦，提供依赖注入机制
 * 确保Core Engine的纯净性，不直接依赖具体的AI服务实现
 */

import { nativeImage } from 'electron'
import * as fs from 'fs/promises'
import type {
  IAIAdapter,
  IAIInferenceRequest,
  IAIInferenceResponse,
  AIChatMessage,
  ILlamaIndexAIService
} from '@yonuc/types'
import type { ICoreEngine } from '@yonuc/core-engine'
import { LlamaIndexAIService } from '@yonuc/electron-llamaIndex-service'
import { AIServiceAdapter, type IAIServiceAdapter, type IUnifiedAIServiceManager } from '../runtime-services/ai/ai-service-adapter'
import { logger, LogCategory } from '@yonuc/shared'

/**
 * LlamaIndex AI适配器接口
 * 提供Core Engine的依赖注入机制
 */
export interface ILlamaIndexAIAdapter {
  /**
   * 向Core Engine注入AI服务
   */
  injectAIService(coreEngine: ICoreEngine): void

  /**
   * 从Core Engine移除AI服务
   */
  removeAIService(coreEngine: ICoreEngine): void
}

/**
 * LlamaIndex AI适配器实现类
 * 实现IAIAdapter接口，用于Core Engine的AI推理
 */
export class LlamaIndexAIAdapter implements IAIAdapter {
  private llamaIndexService: ILlamaIndexAIService

  constructor(llamaIndexService?: ILlamaIndexAIService) {
    // 如果没有提供服务实例，获取单例实例
    this.llamaIndexService = llamaIndexService || LlamaIndexAIService.getInstance()

    if (logger) {
      logger.debug(LogCategory.AI_SERVICE, '[LlamaIndexAIAdapter] LlamaIndex AI适配器已创建')
    }
  }

  /**
   * AI推理接口实现
   * 将Core Engine的推理请求适配到LlamaIndexAIService
   */
  async inference(request: IAIInferenceRequest): Promise<IAIInferenceResponse> {
    try {
      const startTime = Date.now()

      logger.debug(LogCategory.AI_SERVICE, '[LlamaIndexAIAdapter] 执行AI推理:', {
        promptLength: request.prompt.length,
        hasFilePath: !!request.filePath,
        hasMessages: !!request.messages
      })

      let messages: AIChatMessage[] = []

      // 1. 初始化消息列表
      if (request.messages && request.messages.length > 0) {
        // 创建副本以避免修改原始引用
        messages = [...request.messages]
      } else if (request.prompt) {
        // 如果没有消息但有prompt，创建默认用户消息
        messages = [{ role: 'user', content: request.prompt }]
      }

      // 2. 如果提供了文件路径，注入文件内容
      if (request.filePath) {
        const ext = request.filePath.split('.').pop()?.toLowerCase() || ''
        const mimeType = this.getMimeType(ext)
        let mediaPart: any = null

        try {
          if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
            const image = nativeImage.createFromPath(request.filePath)
            const { width, height } = image.getSize()
            let buffer: Buffer

            if (width > 800 || height > 800) {
              const resizedImage = await nativeImage.createThumbnailFromPath(request.filePath, { width: 800, height: 800 })
              buffer = resizedImage.toJPEG(80) // createThumbnailFromPath 可能会改变格式，所以我们使用 jpg 格式
            } else {
              buffer = await fs.readFile(request.filePath)
            }
            mediaPart = {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}` }
            }
          } else if (['mp4', 'mov', 'avi'].includes(ext)) {
            const buffer = await fs.readFile(request.filePath)
            mediaPart = {
              type: 'video_url',
              video_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}` }
            }
          } else if (['mp3', 'wav'].includes(ext)) {
            const buffer = await fs.readFile(request.filePath)
            mediaPart = {
              type: 'input_audio',
              input_audio: { data: `data:${mimeType};base64,${buffer.toString('base64')}`, format: ext }
            }
          }

          if (mediaPart) {
            // 找到最后一条用户消息
            let lastUserMsgIndex = -1
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i].role === 'user') {
                lastUserMsgIndex = i
                break
              }
            }
            
            if (lastUserMsgIndex !== -1) {
              const lastMsg = messages[lastUserMsgIndex]
              let newContent: any[] = []

              if (typeof lastMsg.content === 'string') {
                newContent = [{ type: 'text', text: lastMsg.content }]
              } else if (Array.isArray(lastMsg.content)) {
                newContent = [...lastMsg.content]
              }

              newContent.push(mediaPart)
              
              // 更新消息
              messages[lastUserMsgIndex] = {
                ...lastMsg,
                content: newContent
              }
            } else {
              // 如果没有用户消息，创建一个新的
              messages.push({
                role: 'user',
                content: [mediaPart]
              })
            }
          }
        } catch (fileError) {
          logger.warn(LogCategory.AI_SERVICE, '[LlamaIndexAIAdapter] 读取或处理文件失败，忽略文件内容:', fileError)
        }
      }

      // 调用LlamaIndexAIService进行推理
      const response = await this.llamaIndexService.chat(messages, false, {
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        response_format: request.response_format
      })
      const processingTime = Date.now() - startTime

      // 提取响应文本
      let responseText = ""
      if (typeof response.message === 'string') {
        responseText = response.message
      } else if (response.message && typeof response.message === 'object' && 'content' in response.message) {
        const content = (response.message as { content: string | Array<{ text?: string }> }).content
        if (typeof content === 'string') {
          responseText = content
        } else if (Array.isArray(content)) {
          responseText = content.map(c => c.text || "").join(" ")
        }
      }

      // 处理DeepSeek R1等推理模型的<think>标签
      // 需求: 系统应剥离<think>标签并处理reasoning字段
      responseText = this.cleanResponseText(responseText)

      logger.debug(LogCategory.AI_SERVICE, '[LlamaIndexAIAdapter] AI推理完成:', responseText)

      return {
        success: response.success,
        response: responseText,
        processingTime,
        error: response.error
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(LogCategory.AI_SERVICE, '[LlamaIndexAIAdapter] AI推理失败:', errorMessage)

      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * 清理响应文本
   * 1. 移除 <think> 标签及其内容
   * 2. 尝试移除意外的 nextAction 字段（如果是 JSON 响应）
   */
  private cleanResponseText(text: string): string {
    if (!text) return text

    // 1. 移除 <think> 标签及其内容
    // 支持跨行匹配
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

    // 2. 尝试移除 nextAction 字段
    // 仅当看起来像 JSON 时尝试
    if (cleaned.trim().startsWith('{') && cleaned.includes('"nextAction"')) {
      try {
        // 尝试解析 JSON
        // 注意：这里只处理简单的 JSON 对象，不处理 Markdown 代码块包裹的 JSON
        // 因为 QualityScoringService 会自己处理 Markdown 提取
        
        // 如果包含 Markdown 代码块，先不处理 nextAction，依靠 Prompt 约束
        // 或者我们可以尝试提取 JSON 部分
        
        // 简单尝试：如果是纯 JSON
        const parsed = JSON.parse(cleaned)
        if (parsed.nextAction) {
          delete parsed.nextAction
          // 如果删除后还有内容，重新序列化
          if (Object.keys(parsed).length > 0) {
            return JSON.stringify(parsed)
          }
          // 如果只有 nextAction，删除后为空，这可能导致后续解析失败
          // 但既然用户明确不想要 nextAction，返回空对象或保持原样可能更好
          // 这里选择返回不包含 nextAction 的 JSON 字符串（即 "{}"），
          // 这会导致 QualityScoringService 使用默认值，而不是错误地处理 nextAction
          return JSON.stringify(parsed)
        }
      } catch (e) {
        // JSON 解析失败，忽略，返回清理了 <think> 的文本
      }
    }

    return cleaned
  }

  private getMimeType(ext: string): string {
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg'
      case 'png':
        return 'image/png'
      case 'webp':
        return 'image/webp'
      case 'mp3':
        return 'audio/mpeg'
      case 'wav':
        return 'audio/wav'
      case 'mp4':
        return 'video/mp4'
      case 'mov':
        return 'video/quicktime'
      case 'avi':
        return 'video/x-msvideo'
      case 'txt':
        return 'text/plain'
      case 'md':
        return 'text/markdown'
      case 'json':
        return 'application/json'
      case 'pdf':
        return 'application/pdf'
      case 'doc':
        return 'application/msword'
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      case 'csv':
        return 'text/csv'
      case 'xml':
        return 'text/xml'
      default:
        return 'application/octet-stream'
    }
  }

  /**
   * 健康检查接口实现
   */
  async checkHealth(): Promise<{ healthy: boolean; error?: string }> {
    try {
      logger.debug(LogCategory.AI_SERVICE, '[LlamaIndexAIAdapter] 执行健康检查')

      const healthy = await this.llamaIndexService.healthCheck()

      logger.debug(LogCategory.AI_SERVICE, '[LlamaIndexAIAdapter] 健康检查完成:', { healthy })

      return { healthy }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(LogCategory.AI_SERVICE, '[LlamaIndexAIAdapter] 健康检查失败:', errorMessage)

      return {
        healthy: false,
        error: errorMessage
      }
    }
  }
}

/**
 * Core Engine AI适配器实现类
 * 提供依赖注入机制，确保Core Engine与AI服务的解耦
 */
export class CoreEngineAIAdapter implements ILlamaIndexAIAdapter {
  private serviceAdapter: IAIServiceAdapter
  private unifiedManager: IUnifiedAIServiceManager | null = null

  constructor() {
    // 创建AI服务适配器（需求10.1: 通过AIServiceAdapter提供统一的服务接口）
    this.serviceAdapter = new AIServiceAdapter()

    if (logger) {
      logger.debug(LogCategory.AI_SERVICE, '[CoreEngineAIAdapter] Core Engine AI适配器已创建')
    }
  }

  /**
   * 向Core Engine注入AI服务
   * 实现依赖注入机制，保持Core Engine的纯净性
   */
  injectAIService(coreEngine: ICoreEngine): void {
    try {
      logger.info(LogCategory.AI_SERVICE, '[CoreEngineAIAdapter] 开始向Core Engine注入AI服务')

      // 创建统一服务管理器（需求10.3: 通过适配器模式提供一致的接口）
      this.unifiedManager = this.serviceAdapter.createUnifiedAIServiceManager()

      // 创建LlamaIndex AI适配器
      const aiService = this.serviceAdapter.getAIService()
      const llamaAdapter = new LlamaIndexAIAdapter(aiService)

      // 注入到Core Engine（需求10.2: 通过LlamaIndexAIAdapter注入AI服务，保持core-engine的纯净性）
      if ('setAIAdapter' in coreEngine && typeof (coreEngine as { setAIAdapter?: (adapter: LlamaIndexAIAdapter) => void }).setAIAdapter === 'function') {
        (coreEngine as { setAIAdapter: (adapter: LlamaIndexAIAdapter) => void }).setAIAdapter(llamaAdapter)
      } else if ('injectAIService' in coreEngine && typeof (coreEngine as { injectAIService?: (service: IUnifiedAIServiceManager) => void }).injectAIService === 'function') {
        (coreEngine as { injectAIService: (service: IUnifiedAIServiceManager) => void }).injectAIService(this.unifiedManager)
      } else {
        logger.warn(LogCategory.AI_SERVICE, '[CoreEngineAIAdapter] Core Engine不支持AI服务注入，可能需要更新接口')
      }

      logger.info(LogCategory.AI_SERVICE, '[CoreEngineAIAdapter] AI服务注入完成')
    } catch (error) {
      logger.error(LogCategory.AI_SERVICE, '[CoreEngineAIAdapter] AI服务注入失败:', error)
      throw error
    }
  }

  /**
   * 从Core Engine移除AI服务
   */
  removeAIService(coreEngine: ICoreEngine): void {
    try {
      logger.info(LogCategory.AI_SERVICE, '[CoreEngineAIAdapter] 开始从Core Engine移除AI服务')

      // 移除AI服务
      if ('setAIAdapter' in coreEngine && typeof (coreEngine as { setAIAdapter?: (adapter: LlamaIndexAIAdapter | null) => void }).setAIAdapter === 'function') {
        (coreEngine as { setAIAdapter: (adapter: LlamaIndexAIAdapter | null) => void }).setAIAdapter(null)
      } else if ('removeAIService' in coreEngine && typeof (coreEngine as { removeAIService?: () => void }).removeAIService === 'function') {
        (coreEngine as { removeAIService: () => void }).removeAIService()
      }

      // 清理统一服务管理器
      this.unifiedManager = null

      logger.info(LogCategory.AI_SERVICE, '[CoreEngineAIAdapter] AI服务移除完成')
    } catch (error) {
      logger.error(LogCategory.AI_SERVICE, '[CoreEngineAIAdapter] AI服务移除失败:', error)
      throw error
    }
  }

  /**
   * 获取统一服务管理器
   */
  getUnifiedManager(): IUnifiedAIServiceManager | null {
    return this.unifiedManager
  }

  /**
   * 获取AI服务适配器
   */
  getServiceAdapter(): IAIServiceAdapter {
    return this.serviceAdapter
  }
}