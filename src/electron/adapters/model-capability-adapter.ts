/**
 * 模型能力适配器实现
 * 将模型能力检测 API 适配到核心引擎
 */

import * as path from 'path'

import { LogCategory, logger } from '@yonuc/shared'

import { IModelCapabilityAdapter } from '@yonuc/core-engine'
import { configService } from '../runtime-services/config/config-service'
import { getLlamaModelConfig } from '../model'
import { modelCapabilityDetector } from '../runtime-services/llama'

/**
 * 模型能力适配器
 */
export class ModelCapabilityAdapter implements IModelCapabilityAdapter {
  async checkFileTypeSupport(fileType: string, filePath?: string): Promise<boolean> {
    try {
      // 从文件路径中提取扩展名
      const extension = filePath ? path.extname(filePath).toLowerCase().slice(1) : fileType.toLowerCase()

      // 获取当前模型ID
      const currentModelId = configService.getValue<string>('SELECTED_MODEL_ID') as string

      if (!currentModelId) {
        logger.warn(LogCategory.MODEL_CAPABILITY_ADAPTER, '没有选中的模型，无法检查文件类型支持')
        return false
      }

      // 检查文件类型支持
      const result = await modelCapabilityDetector.checkFileTypeSupport(currentModelId, extension)
      return result.supported
    } catch (error) {
      logger.error(LogCategory.MODEL_CAPABILITY_ADAPTER, '检查文件类型支持失败:', error)
      return false
    }
  }

  isMultiModalModel(modelId?: string): boolean {
    // 获取当前模型ID
    const currentModelId = modelId || configService.getValue<string>('SELECTED_MODEL_ID') as string

    if (!currentModelId) {
      logger.warn(LogCategory.MODEL_CAPABILITY_ADAPTER, '没有选中的模型，无法检查文件类型支持')
      return false
    }
    const modelConfig = getLlamaModelConfig(currentModelId)
    if (modelConfig) {
      return modelCapabilityDetector.isMultiModalModel(modelConfig)
    } else {
      logger.error(LogCategory.MODEL_CAPABILITY_ADAPTER, '检查模型多模态支持失败:')
      return false
    }
  }

  async isMultimodalFileType(fileType: string): Promise<boolean> {
    try {
      const ext = fileType.toLowerCase().replace('.', '')
      const multimodalExtensions = [
        // 图片
        'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'svg',
        // 音频
        'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a',
        // 视频
        'mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv'
      ]
      if (!multimodalExtensions.includes(ext)) {
        return false
      }
      // 从文件路径中提取扩展名
      const extension = fileType.toLowerCase()
      // 回退到默认逻辑（兼容旧代码）

      // 获取当前模型ID
      const currentModelId = configService.getValue<string>('SELECTED_MODEL_ID') as string
      if (!currentModelId) {
        logger.warn(LogCategory.MODEL_CAPABILITY_ADAPTER, '没有选中的模型，无法检查文件类型支持')
        return false
      }

      // 检查文件类型支持
      const result = await modelCapabilityDetector.checkFileTypeSupport(currentModelId, extension)
      logger.info(LogCategory.MODEL_CAPABILITY_ADAPTER, '多模态文件类型支持检查结果:', result)
      return result.supported
    } catch (error) {
      logger.error(LogCategory.MODEL_CAPABILITY_ADAPTER, '检查文件类型支持失败:', error)
      return false
    }
  }

  async checkRuntimeCapabilities(): Promise<{ supportsVision: boolean; supportsAudio: boolean }> {
    const capabilities = await modelCapabilityDetector.checkRuntimeCapabilities()
    return {
      supportsVision: capabilities.vision,
      supportsAudio: capabilities.audio
    }
  }

  clearCache(): void {
    modelCapabilityDetector.clearCache()
  }

  async getContextLength(): Promise<number> {
    try {
      const aiServiceMode = configService.getValue<string>('AI_SERVICE_MODE')
      
      let serviceConfig: any
      if (aiServiceMode === 'cloud') {
        const provider = configService.getValue<string>('AI_CLOUD_PROVIDER')
        const model = configService.getValue<string>('AI_CLOUD_SELECTED_MODEL_ID') || configService.getValue<string>('AI_CLOUD_MODEL')
        serviceConfig = {
          mode: 'cloud',
          cloud: { provider, model },
          platform: 'cloud'
        }
      } else {
        const modelId = configService.getValue<string>('SELECTED_MODEL_ID')
        if (!modelId) return 4096
        serviceConfig = {
          mode: 'local',
          local: { modelId },
          platform: 'ollama' // Assuming local is ollama for now, or get from config
        }
      }

      const capabilities = await modelCapabilityDetector.detectCapabilities(serviceConfig)
      return capabilities.maxContextSize || 4096
    } catch (error) {
      logger.error(LogCategory.MODEL_CAPABILITY_ADAPTER, '获取上下文长度失败:', error)
      return 4096
    }
  }
}

/**
 * 创建模型能力适配器实例
 */
export function createModelCapabilityAdapter(): IModelCapabilityAdapter {
  return new ModelCapabilityAdapter()
}
