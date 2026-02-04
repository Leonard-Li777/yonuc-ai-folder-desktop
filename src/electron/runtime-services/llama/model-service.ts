import { BrowserWindow, app, ipcMain, net, session, webContents } from 'electron'
import type {
  DownloadProgressEvent,
  DownloadTaskSummary,
  HardwareInfo,
  ModelSummary
} from '@yonuc/types'
import type { ILlamaModelConfig, IModelSummary } from '@yonuc/types'
import { LogCategory, logger } from '@yonuc/shared'

import EventEmitter from 'events'
import { ModelConfig } from '../../model'
import { ModelConfigService } from '../analysis/model-config-service'
import { configService } from '../config/config-service'
import { exec } from 'node:child_process'
import fs from 'node:fs'
import { LlamaModelManager } from './llama-model-manager'
import { ModelDownloadManager } from '../ai/model-download-manager'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

type VRAMSource = 'electron-api' | 'nvidia-smi' | 'dxdiag' | 'system-command' | 'default'
type GPUType = 'dedicated' | 'integrated' | 'none'
interface VRAMInfo {
  valueMB: number
  source: VRAMSource
  gpuType: GPUType
  detectionTimeMs: number
  attempts: {
    method: string
    timeMs: number
    success: boolean
    valueMB?: number
  }[]
}

const execPromise = promisify(exec)

function parseSizeToBytes(size: string): number {
  try {
    const match = size
      .trim()
      .toUpperCase()
      .match(/([\d.]+)\s*(KB|MB|GB|TB)?/)
    if (!match) {
      return 0
    }
    const value = parseFloat(match[1])
    const unit = match[2] || 'B'
    const unitMap: Record<string, number> = {
      B: 1,
      KB: 1024,
      MB: 1024 ** 2,
      GB: 1024 ** 3,
      TB: 1024 ** 4
    }
    const bytes = Math.round(value * (unitMap[unit] || 1))
    return bytes
  } catch (error) {
    logger.error(LogCategory.MODEL_SERVICE, '解析显存大小时出错', error)
    return 0
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)}${sizes[i]}`
}

/**
 * 模型加载状态事件定义
 */
export enum ModelLoadingEvent {
  START = 'model-loading-start',
  COMPLETE = 'model-loading-complete',
  ERROR = 'model-loading-error'
}

/**
 * 下载任务接口
 */
interface DownloadTask {
  model: ModelConfig
  files: Array<{
    name: string
    url: string
    sizeBytes: number
    required: boolean
  }>
  destDir: string
  totalBytes: number
  receivedBytes: number
  startTime: number
  currentRequest?: Electron.ClientRequest
  aborted: boolean
  webContentsId?: number
  lastPercent: number
  lastUpdate: number
  fileProgress: Map<string, number>
  currentFileName?: string
  lastSpeedUpdate: number
  lastSpeedBytes: number
  lastUpdateBytes: number
  isUpdating: boolean
  lastDebugLog: number
  retryCount: number // 添加重试计数器
}

export class ModelService extends EventEmitter {
  private static instance: ModelService;
  // 定义安全的IPC通道名称
  private static readonly IPC_CHANNELS = {
    LOADING_START: 'model-service:loading-start',
    LOADING_COMPLETE: 'model-service:loading-complete',
    LOADING_ERROR: 'model-service:loading-error'
  }

  public static getInstance(): ModelService {
    if (!ModelService.instance) {
      ModelService.instance = new ModelService();
    }
    return ModelService.instance;
  }

  // 注册IPC通信处理程序
  private constructor() {
    super()
    this.registerIpcHandlers()
  }

  /**
   * 注册IPC通信处理程序
   */
  private registerIpcHandlers() {
    // 验证IPC通道名称是否安全
    Object.values(ModelService.IPC_CHANNELS).forEach(channel => {
      if (!channel.startsWith('model-service:')) {
        throw new Error(`不安全的IPC通道名称: ${channel}`)
      }
    })

    // 清理之前的监听器
    ipcMain.removeAllListeners(ModelService.IPC_CHANNELS.LOADING_START)
    ipcMain.removeAllListeners(ModelService.IPC_CHANNELS.LOADING_COMPLETE)
    ipcMain.removeAllListeners(ModelService.IPC_CHANNELS.LOADING_ERROR)

    // 注册新的监听器
    ipcMain.on(ModelService.IPC_CHANNELS.LOADING_START, (event, modelId) => {
      if (logger) {
        logger.debug(LogCategory.MODEL_SERVICE, '[ModelService] 收到加载开始请求:', modelId)
      }
      // 这里可以添加额外的验证逻辑
    })
  }

  private downloads = new Map<string, DownloadTask>()

  /**
   * 获取 GGUF 格式的模型列表（新接口）
   */
  async listLlamaModels(): Promise<IModelSummary[]> {
    return await LlamaModelManager.getInstance().listModels()
  }

  /**
   * 获取 GGUF 格式的模型信息
   */
  async getLlamaModelInfo(modelId: string): Promise<ILlamaModelConfig | null> {
    return await LlamaModelManager.getInstance().getModelInfo(modelId)
  }

  /**
   * 检查 GGUF 模型是否已下载
   */
  async isLlamaModelDownloaded(modelId: string): Promise<boolean> {
    return (await ModelDownloadManager.getInstance().checkModelDownloadStatus(modelId)).isDownloaded
  }

  /**
   * 获取 GGUF 模型路径
   */
  async getLlamaModelPath(modelId: string): Promise<string | null> {
    return await LlamaModelManager.getInstance().getModelPath(modelId)
  }

  /**
   * 开始下载 GGUF 模型
   */
  async startLlamaModelDownload(modelId: string, webContentsId?: number): Promise<any> {
    const focusedWebContents = webContents.getFocusedWebContents()
    const task = await ModelDownloadManager.getInstance().startDownload(modelId, focusedWebContents?.id)
    return {
      taskId: task.taskId,
      modelId: task.modelId,
      destDir: task.destDir,
      totalBytes: task.totalBytes
    }
  }

  /**
   * 验证 GGUF 模型
   */
  async validateLlamaModel(modelId: string) {
    return await LlamaModelManager.getInstance().validateModel(modelId)
  }

  /**
   * 获取模型能力信息
   */
  async getModelCapabilities(modelId: string) {
    return await LlamaModelManager.getInstance().getModelCapabilities(modelId)
  }

  /**
   * 根据硬件推荐模型
   */
  async recommendModelsByHardware(memoryGB: number, hasGPU?: boolean, vramGB?: number) {
    return await LlamaModelManager.getInstance().recommendModelsByHardware(memoryGB, hasGPU, vramGB)
  }

  /**
   * 获取多模态模型信息
   */
  async getMultiModalInfo(modelId: string) {
    return await LlamaModelManager.getInstance().getMultiModalInfo(modelId)
  }

  /**
   * 验证多模态文件关联
   */
  async validateMultiModalAssociations(modelId: string) {
    return await LlamaModelManager.getInstance().validateMultiModalAssociations(modelId)
  }

  /**
   * 检查模型是否支持特定模态
   */
  async supportsModality(modelId: string, modality: string) {
    return await LlamaModelManager.getInstance().supportsModality(modelId, modality as any)
  }

  /**
   * 获取模型支持的模态类型
   */
  async getSupportedModalities(modelId: string) {
    return await LlamaModelManager.getInstance().getSupportedModalities(modelId)
  }

  /**
   * 检查文件类型支持
   */
  async checkFileTypeSupport(modelId: string, fileExtension: string) {
    return await LlamaModelManager.getInstance().checkFileTypeSupport(modelId, fileExtension)
  }

  /**
   * 获取模型状态
   */
  async getModelStatus(modelId: string) {
    return await LlamaModelManager.getInstance().getModelStatus(modelId)
  }

  /**
   * 获取支持特定文件类型的模型
   */
  async getModelsByFileType(fileExtension: string) {
    return await LlamaModelManager.getInstance().getModelsByFileType(fileExtension)
  }

  /**
   * 获取能力限制
   */
  async getCapabilityLimitations(modelId: string, capabilityType: string) {
    return await LlamaModelManager.getInstance().getCapabilityLimitations(modelId, capabilityType as any)
  }

  /**
   * 设置当前活跃模型
   */
  async setCurrentModel(modelId: string) {
    return await LlamaModelManager.getInstance().setCurrentModel(modelId)
  }

  /**
   * 获取状态栏信息
   */
  getStatusBarInfo() {
    return LlamaModelManager.getInstance().getStatusBarInfo()
  }

  /**
   * 检查文件兼容性
   */
  async checkFileCompatibility(fileExtension: string) {
    return await LlamaModelManager.getInstance().checkFileCompatibility(fileExtension)
  }

  listModels(): ModelSummary[] {
    // 显式传递当前语言参数，确保加载正确的语言配置
    const currentLanguage = this.getCurrentLanguage()
    const summaries: ModelSummary[] = []
    
    // 获取原始模型配置
    const models = ModelConfigService.getInstance().loadModelConfig(currentLanguage)
    const platform = configService.getValue<'llama.cpp' | 'ollama'>('AI_PLATFORM') || 'llama.cpp'
    
    for (const model of (models || [])) {
      // 映射质量等级以满足 ModelSummary 类型
      const quality = model.performance?.quality as string
      let mappedQuality: 'basic' | 'good' | 'excellent' | 'best' = 'good'

      if (quality === 'low') mappedQuality = 'basic'
      else if (quality === 'medium') mappedQuality = 'good'
      else if (quality === 'high') mappedQuality = 'excellent'
      else if (quality === 'ultra') mappedQuality = 'best'
      else if (['basic', 'good', 'excellent', 'best'].includes(quality)) mappedQuality = quality as any

      // 计算显存需求
      const totalSizeBytes = model.totalSizeBytes || (model.files || []).reduce((acc, f) => acc + (f.required ? f.sizeBytes : 0), 0)
      const vramRequiredGB = model.vramRequiredGB !== undefined
        ? model.vramRequiredGB
        : Math.round((totalSizeBytes / 1024 ** 3) * 100) / 100

      summaries.push({
        id: model.id,
        name: model.name,
        description: model.description || '',
        company: model.company || '',
        parameterSize: model.parameterSize || '',
        totalSizeText: model.totalSize || '',
        totalSizeBytes: totalSizeBytes,
        minVramGB: model.hardwareRequirements?.minMemoryGB ?? model.performance?.minMemoryGB ?? 0,
        recommendedVramGB: model.hardwareRequirements?.recommendedMemoryGB ?? model.performance?.recommendedMemoryGB ?? 0,
        gpuAccelerated: model.hardwareRequirements?.gpuAccelerated ?? true,
        performance: {
          speed: (model.performance?.speed as any) || 'medium',
          quality: mappedQuality
        },
        capabilities: (model.capabilities || []).map(c => c.type),
        tags: model.tags || [],
        files: (model.files || []).map(f => ({
          name: f.name,
          url: f.url,
          sizeText: f.size,
          sizeBytes: f.sizeBytes,
          required: f.required
        })),
        vramRequiredGB: vramRequiredGB
      })
    }

    return summaries.sort((a, b) => {
      // 按照显存需求从低到高排序
      if (a.vramRequiredGB !== b.vramRequiredGB) {
        return a.vramRequiredGB - b.vramRequiredGB
      }

      // 如果显存需求相同，按照内存需求排序
      if (a.minVramGB !== b.minVramGB) {
        return a.minVramGB - b.minVramGB
      }

      // 按照推荐顺序排序
      const recommendedOrder = [
        'qwen3-0.6b-mlx-4bit',
        'gemma-3-1b-q4_0',
        'qwen3-4b',
        'qwen2.5-vl-7b-q2_k',
        'gemma-3-4b-q4_0-mmproj',
        'Qwen3VL-4B-Instruct-Q8_0',
        'qwen2.5-omni-7b-q4_k_m',
        'gemma-3-12b-q4_0-mmproj',
        'qwen2.5-omni-7b-q8_0'
      ]

      const indexA = recommendedOrder.indexOf(a.id)
      const indexB = recommendedOrder.indexOf(b.id)

      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB
      }
      if (indexA !== -1) return -1
      if (indexB !== -1) return 1

      return 0
    })
  }

  /**
   * 获取当前语言设置
   */
  private getCurrentLanguage(): string {
    try {
      // 优先从配置服务获取语言设置
      const configLanguage = configService.getValue<string>('DEFAULT_LANGUAGE')
      if (configLanguage) {
        return configLanguage
      }

      // 回退到默认语言
      return 'zh-CN'
    } catch (error) {
      logger.warn(LogCategory.MODEL_SERVICE, '获取当前语言设置失败，使用默认语言', error)
      return 'zh-CN'
    }
  }

  private async detectGPUType(gpuModel?: string): Promise<GPUType> {
    if (!gpuModel) return 'none'

    const dedicatedKeywords = ['nvidia', 'geforce', 'radeon', 'rtx', 'gtx', 'amd']
    const integratedKeywords = ['intel', 'iris', 'hd graphics', 'uhd graphics', 'xe graphics']

    const lowerModel = gpuModel.toLowerCase()

    if (dedicatedKeywords.some(keyword => lowerModel.includes(keyword))) {
      return 'dedicated'
    }
    if (integratedKeywords.some(keyword => lowerModel.includes(keyword))) {
      return 'integrated'
    }

    return 'none'
  }

  async getHardwareInfo(): Promise<HardwareInfo> {
    const startTime = Date.now()
    logger.debug(LogCategory.MODEL_SERVICE, '[HardwareInfo] 开始获取硬件信息')

    const totalMemGB = Math.round(os.totalmem() / 1024 ** 3)
    const freeMemGB = Math.round(os.freemem() / 1024 ** 3)

    const vramInfo: VRAMInfo = {
      valueMB: 0,
      source: 'default',
      gpuType: 'none',
      detectionTimeMs: 0,
      attempts: []
    }

    let gpuModel: string | undefined
    let hasGPU = false

    // 1. 尝试通过Electron API获取GPU信息
    const electronApiStart = Date.now()
    try {
      logger.debug(LogCategory.MODEL_SERVICE, '[HardwareInfo] 尝试通过Electron API获取GPU信息')
      const info = await app.getGPUInfo('complete')
      const gpus = (info as any).gpuDevice || (info as any).gpuDevices || []

      if (Array.isArray(gpus) && gpus.length > 0) {
        hasGPU = true
        const primary = gpus.find((g: any) => g.active) || gpus[0]
        gpuModel = primary?.deviceString || primary?.name || primary?.description || undefined
        logger.debug(LogCategory.MODEL_SERVICE, '[HardwareInfo] 检测到GPU:', gpuModel)

        // 检测GPU类型
        vramInfo.gpuType = await this.detectGPUType(gpuModel)

        // 尝试从多个可能的字段获取显存信息
        const vramFields = ['videoMemory', 'vram', 'memorySizeMB', 'deviceMemory']
        for (const field of vramFields) {
          if (primary && primary[field] !== undefined) {
            let rawValue = primary[field]
            logger.debug(
              LogCategory.MODEL_SERVICE,
              `[HardwareInfo] 从字段${field}获取显存原始值:`,
              rawValue
            )

            if (typeof rawValue === 'string') {
              rawValue = parseInt(rawValue, 10)
              logger.debug(
                LogCategory.MODEL_SERVICE,
                '[HardwareInfo] 字符串显存值转换为数字:',
                rawValue
              )
            }

            if (typeof rawValue === 'number' && rawValue > 0) {
              let valueMB = rawValue
              if (rawValue > 100 * 1024 * 1024 * 1024) {
                valueMB = Math.round(rawValue / (1024 * 1024))
                logger.debug(LogCategory.MODEL_SERVICE, '[HardwareInfo] 字节转换为MB:', valueMB)
              } else if (rawValue > 100 * 1024) {
                valueMB = Math.round(rawValue / 1024)
                logger.debug(LogCategory.MODEL_SERVICE, '[HardwareInfo] KB转换为MB:', valueMB)
              }

              if (valueMB > 0) {
                vramInfo.valueMB = valueMB
                vramInfo.source = 'electron-api'
                break
              }
            }
          }
        }

        vramInfo.attempts.push({
          method: 'electron-api',
          timeMs: Date.now() - electronApiStart,
          success: vramInfo.source === 'electron-api',
          valueMB: vramInfo.source === 'electron-api' ? vramInfo.valueMB : undefined
        })
      }
    } catch (e) {
      logger.warn(LogCategory.MODEL_SERVICE, '[HardwareInfo] 通过Electron API获取GPU信息失败:', e)
      vramInfo.attempts.push({
        method: 'electron-api',
        timeMs: Date.now() - electronApiStart,
        success: false
      })
    }

    // 2. 如果通过Electron API没有获取到显存信息，尝试通过系统命令获取
    if (hasGPU && vramInfo.source === 'default') {
      const systemCmdStart = Date.now()
      try {
        logger.debug(LogCategory.MODEL_SERVICE, '[HardwareInfo] 尝试通过系统命令获取显存信息')
        const cmdResult = await this.getVRAMFromSystemCommand()
        if (cmdResult !== undefined) {
          vramInfo.valueMB = cmdResult
          vramInfo.source = 'system-command'
        }
        vramInfo.attempts.push({
          method: 'system-command',
          timeMs: Date.now() - systemCmdStart,
          success: vramInfo.source === 'system-command',
          valueMB: vramInfo.source === 'system-command' ? vramInfo.valueMB : undefined
        })
      } catch (e) {
        logger.warn(LogCategory.MODEL_SERVICE, '[HardwareInfo] 通过系统命令获取显存信息失败:', e)
        vramInfo.attempts.push({
          method: 'system-command',
          timeMs: Date.now() - systemCmdStart,
          success: false
        })
      }
    }

    // 3. 提供默认显存值
    if (hasGPU && vramInfo.source === 'default') {
      logger.debug(LogCategory.MODEL_SERVICE, '[HardwareInfo] 使用默认显存值')
      switch (vramInfo.gpuType) {
        case 'dedicated':
          vramInfo.valueMB = 4096 // 4GB for dedicated GPU
          break
        case 'integrated':
          vramInfo.valueMB = 2048 // 2GB for integrated GPU
          break
        default:
          vramInfo.valueMB = 0 // 0GB for no GPU
      }
      vramInfo.attempts.push({
        method: 'default-value',
        timeMs: 0,
        success: true,
        valueMB: vramInfo.valueMB
      })
    }

    vramInfo.detectionTimeMs = Date.now() - startTime

    // 记录显存检测过程
    logger.debug(LogCategory.MODEL_SERVICE, '[HardwareInfo] 显存检测过程:', {
      source: vramInfo.source,
      gpuType: vramInfo.gpuType,
      attempts: vramInfo.attempts,
      totalTimeMs: vramInfo.detectionTimeMs
    })

    // 获取存储空间信息
    // 获取存储空间信息
    let storageFreeGB: number | undefined
    try {
      // 使用模型存储路径检测硬盘空间，如果未配置则使用默认路径
      const modelStoragePath = this.getModelBaseDir()
      
      // 向上查找直到找到存在的路径
      let checkPath = modelStoragePath
      while (checkPath) {
        if (fs.existsSync(checkPath)) {
          break
        }
        const parent = path.dirname(checkPath)
        if (parent === checkPath) {
          // 到达根目录且不存在(不太可能, 除非驱动器不存在)
          break
        }
        checkPath = parent
      }

      if (fs.existsSync(checkPath)) {
        const diskInfo = await fs.promises.statfs(checkPath)
        storageFreeGB = Math.round((diskInfo.bavail * diskInfo.bsize) / 1024 ** 3)
        logger.debug(
          LogCategory.MODEL_SERVICE,
          '[HardwareInfo] 获取存储空间信息:',
          storageFreeGB,
          'GB',
          '检查路径:',
          checkPath,
          '原始路径:',
          modelStoragePath
        )
      } else {
        logger.warn(LogCategory.MODEL_SERVICE, '[HardwareInfo] 无法找到用于检查磁盘空间的有效路径:', modelStoragePath)
      }
    } catch (e) {
      logger.warn(LogCategory.MODEL_SERVICE, '[HardwareInfo] 获取存储空间信息失败:', e)
    }

    const hardwareInfo = {
      osPlatform: os.platform(),
      osArch: os.arch(),
      totalMemGB,
      freeMemGB,
      hasGPU,
      gpuModel,
      vramGB: vramInfo.valueMB ? Math.round(vramInfo.valueMB / 1024) : undefined,
      vramSource: vramInfo.source,
      gpuType: vramInfo.gpuType,
      vramDetectionTimeMs: vramInfo.detectionTimeMs,
      storageFreeGB
    }

    logger.debug(LogCategory.MODEL_SERVICE, '[HardwareInfo] 硬件信息获取完成:', hardwareInfo)
    return hardwareInfo
  }

  /**
   * 通过系统命令获取显存信息
   */
  private async getVRAMFromSystemCommand(): Promise<number | undefined> {
    // 1. 首先尝试通过 nvidia-smi 命令获取显存信息
    try {
      logger.debug(LogCategory.MODEL_SERVICE, '[VRAM] 尝试通过 nvidia-smi 获取显存信息')
      const nvidiaSmiResult = await this.getVRAMFromNvidiaSmi()
      if (nvidiaSmiResult !== undefined) {
        return nvidiaSmiResult
      }
    } catch (e) {
      logger.warn(LogCategory.MODEL_SERVICE, '[VRAM] 通过 nvidia-smi 获取显存信息失败:', e)
    }

    // 2. 如果 nvidia-smi 不可用且是 Windows 平台，尝试 dxdiag
    if (os.platform() === 'win32') {
      try {
        logger.debug(LogCategory.MODEL_SERVICE, '[VRAM] Windows系统尝试通过 dxdiag 获取显存信息')
        const dxdiagResult = await this.getVRAMFromDxDiag()
        if (dxdiagResult !== undefined) {
          return dxdiagResult
        }
      } catch (e) {
        logger.warn(LogCategory.MODEL_SERVICE, '[VRAM] 通过 dxdiag 获取显存信息失败:', e)
      }
    }

    // 3. 回退到原有系统命令检测逻辑
    try {
      logger.debug(LogCategory.MODEL_SERVICE, '[VRAM] 尝试通过原有系统命令获取显存信息')
      const originalResult = await this.getVRAMFromOriginalSystemCommand()
      if (originalResult !== undefined) {
        return originalResult
      }
    } catch (e) {
      logger.warn(LogCategory.MODEL_SERVICE, '[VRAM] 通过原有系统命令获取显存信息失败:', e)
    }

    return undefined
  }

  /**
   * 通过 nvidia-smi 命令获取显存信息
   */
  private async getVRAMFromNvidiaSmi(): Promise<number | undefined> {
    try {
      // 检查 nvidia-smi 命令是否可用
      await execPromise('nvidia-smi --help')

      // 执行 nvidia-smi 命令获取显存信息
      const { stdout } = await execPromise('nvidia-smi --query-gpu=memory.total --format=csv -i 0')

      // 解析输出结果
      const lines = stdout.trim().split('\n')
      if (lines.length > 1) {
        const memoryInfo = lines[1].trim() // 第二行包含显存信息
        const match = memoryInfo.match(/(\d+)\s*(MiB|MB)/i)
        if (match) {
          const memoryMB = parseInt(match[1], 10)
          return memoryMB
        }
      }
    } catch (error) {
      // 命令执行失败或解析失败
      logger.warn(LogCategory.MODEL_SERVICE, '[VRAM] nvidia-smi 命令执行失败:', error)
    }
    return undefined
  }

  /**
   * 通过 dxdiag 命令获取显存信息 (仅限 Windows)
   */
  private async getVRAMFromDxDiag(): Promise<number | undefined> {
    if (os.platform() !== 'win32') {
      return undefined
    }

    const reportPath = path.join(app.getPath('userData'), 'dxdiag_report.txt')

    try {
      // 执行 dxdiag 命令生成报告
      await execPromise(`dxdiag /t "${reportPath}"`)

      // 读取并解析报告文件
      const reportContent = await fs.promises.readFile(reportPath, 'utf-8')

      // 解析显存信息
      const vramMatch = reportContent.match(
        /[\s\S]*?Dedicated Memory:[\s]*([0-9.]+)\s*(MB|GB|TB)[\s\S]*?/i
      )
      if (vramMatch) {
        const value = parseFloat(vramMatch[1])
        const unit = vramMatch[2].toUpperCase()

        // 转换为MB
        let memoryMB: number
        switch (unit) {
          case 'GB':
            memoryMB = value * 1024
            break
          case 'TB':
            memoryMB = value * 1024 * 1024
            break
          default:
            memoryMB = value
        }

        return Math.round(memoryMB)
      }
    } catch (error) {
      logger.warn(LogCategory.MODEL_SERVICE, '[VRAM] dxdiag 命令执行失败:', error)
    } finally {
      // 清理临时文件
      try {
        await fs.promises.unlink(reportPath)
      } catch (error) {
        // 忽略删除失败
      }
    }
    return undefined
  }

  /**
   * 原有的系统命令检测逻辑作为备选方案
   */
  private async getVRAMFromOriginalSystemCommand(): Promise<number | undefined> {
    try {
      if (os.platform() === 'win32') {
        logger.debug(LogCategory.MODEL_SERVICE, '[VRAM] Windows系统尝试通过PowerShell获取显存信息')
        // 优先尝试 PowerShell (Get-CimInstance) 查询显存
        const psCommand = 'powershell.exe "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Csv -NoTypeInformation"'
        let stdout = ''
        try {
          const result = await execPromise(psCommand)
          stdout = result.stdout
        } catch (psError) {
          logger.debug(LogCategory.MODEL_SERVICE, '[VRAM] PowerShell 查询失败，尝试回退 wmic:', psError)
          // 回退到 wmic
          const wmicResult = await execPromise('wmic path win32_VideoController get Name,AdapterRAM /format:csv')
          stdout = wmicResult.stdout
        }

        // 提取所有可能的显存值并取最大值
        const lines = stdout.split('\n').filter(line => line.trim() && !line.startsWith('Node') && !line.includes('Name,AdapterRAM') && !line.includes('"Name"'))
        
        let maxMemory = 0
        for (const line of lines) {
          const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''))
          
          let memoryStr = ''
          if (parts.length === 2) {
            // PowerShell: Name, AdapterRAM
            memoryStr = parts[1]
          } else if (parts.length >= 3) {
            // wmic: Node, AdapterRAM, Name 或 Node, Name, AdapterRAM
            if (!isNaN(parseInt(parts[1]))) {
              memoryStr = parts[1]
            } else if (!isNaN(parseInt(parts[2]))) {
              memoryStr = parts[2]
            }
          }

          const bytes = parseInt(memoryStr || '0')
          if (!isNaN(bytes) && bytes > 0) {
            maxMemory = Math.max(maxMemory, bytes)
          }
        }

        if (maxMemory > 0) {
          return Math.round(maxMemory / (1024 * 1024)) // 转换为 MB
        }
      } else if (os.platform() === 'darwin') {
        logger.debug(
          LogCategory.MODEL_SERVICE,
          '[VRAM] macOS系统尝试通过system_profiler获取显存信息'
        )
        // macOS系统使用system_profiler命令
        const { stdout } = await execPromise(
          'system_profiler SPDisplaysDataType | grep "VRAM\\|VRAM Total"'
        )
        logger.debug(LogCategory.MODEL_SERVICE, '[VRAM] system_profiler命令输出:', stdout)
        const match = stdout.match(/(\d+)\s*(MB|GB)/i)
        if (match) {
          const value = parseInt(match[1], 10)
          const unit = match[2].toUpperCase()
          if (!isNaN(value) && value > 0) {
            // 转换为MB
            return unit === 'GB' ? value * 1024 : value
          }
        }
      } else if (os.platform() === 'linux') {
        logger.debug(LogCategory.MODEL_SERVICE, '[VRAM] Linux系统尝试通过lshw获取显存信息')
        // Linux系统尝试使用lshw命令
        try {
          const { stdout } = await execPromise('lshw -c display 2>/dev/null | grep -i size')
          logger.debug(LogCategory.MODEL_SERVICE, '[VRAM] lshw命令输出:', stdout)
          const match = stdout.match(/(\d+)\s*(MB|GB)/i)
          if (match) {
            const value = parseInt(match[1], 10)
            const unit = match[2].toUpperCase()
            if (!isNaN(value) && value > 0) {
              // 转换为MB
              return unit === 'GB' ? value * 1024 : value
            }
          }
        } catch (e) {
          // 如果lshw命令不可用，尝试其他方法
          logger.warn(LogCategory.MODEL_SERVICE, '[VRAM] lshw命令执行失败:', e)
        }
      }
    } catch (e) {
      logger.warn(LogCategory.MODEL_SERVICE, '[VRAM] 执行原有系统命令获取显存信息失败:', e)
    }

    return undefined
  }

  private getModelBaseDir(): string {
    try {
      const configuredPath = configService.getValue<string>('MODEL_STORAGE_PATH')
      if (configuredPath && configuredPath.trim().length > 0) {
        return path.resolve(configuredPath.trim())
      }
    } catch (error) {
      logger.warn(LogCategory.MODEL_SERVICE, '读取模型存储路径失败，将使用默认目录', error)
    }
    return path.join(app.getPath('userData'), 'models')
  }

  private ensureModelDir(): string {
    const modelsDir = this.getModelBaseDir()
    try {
      fs.mkdirSync(modelsDir, { recursive: true })
    } catch (err) {
      logger.error(LogCategory.MODEL_SERVICE, '创建模型目录失败:', err)
    }
    return modelsDir
  }


  /**
   * 发送模型加载状态事件
   * @param event 事件类型
   * @param modelId 模型ID
   * @param payload 附加数据
   */
  private emitModelLoadingEvent(event: ModelLoadingEvent, modelId: string, payload?: unknown) {
    logger.debug(LogCategory.MODEL_SERVICE, `[ModelService] 发送模型加载事件: ${event}`, {
      modelId,
      payload
    })

    // 安全验证
    if (!Object.values(ModelLoadingEvent).includes(event)) {
      logger.error(LogCategory.MODEL_SERVICE, '[ModelService] 无效的模型加载事件类型:', event)
      return
    }

    // 验证模型ID格式
    if (!modelId || typeof modelId !== 'string' || !/^[a-z0-9-_.]+$/.test(modelId)) {
      logger.error(LogCategory.MODEL_SERVICE, '[ModelService] 无效的模型ID:', modelId)
      return
    }

    // 验证payload内容
    if (payload && typeof payload !== 'object') {
      logger.error(LogCategory.MODEL_SERVICE, '[ModelService] 无效的payload类型:', typeof payload)
      return
    }

    // 发送给特定webContents
    const task = [...this.downloads.values()].find(d => d.model.id === modelId)
    const wc = task?.webContentsId ? webContents.fromId(task.webContentsId) : undefined

    if (wc) {
      try {
        // 使用安全的IPC通道发送
        const safePayload = this.sanitizePayload(payload)
        wc.send(this.getIpcChannelForEvent(event), { modelId, ...(safePayload as object) })
      } catch (err) {
        logger.error(
          LogCategory.MODEL_SERVICE,
          `[ModelService] 发送事件${event}到webContents失败:`,
          err
        )
      }
    } else {
      // 广播给所有窗口
      BrowserWindow.getAllWindows().forEach(win => {
        try {
          const safePayload = this.sanitizePayload(payload)
          win.webContents.send(this.getIpcChannelForEvent(event), {
            modelId,
            ...(safePayload as object)
          })
        } catch (err) {
          logger.error(LogCategory.MODEL_SERVICE, `[ModelService] 发送事件${event}到窗口失败:`, err)
        }
      })
    }

    // 本地触发事件
    this.emit(event, { modelId, ...(this.sanitizePayload(payload) as object) })
  }

  private emitProgress(
    taskId: string,
    percent?: number,
    canceled?: boolean,
    status: 'downloading' | 'completed' | 'canceled' | 'error' | 'retrying' = 'downloading',
    extra?: Partial<DownloadProgressEvent>
  ) {
    const task = this.downloads.get(taskId)
    const wc = task?.webContentsId ? webContents.fromId(task.webContentsId) : undefined
    const payload: DownloadProgressEvent = {
      taskId,
      modelId: task?.model.id || extra?.modelId || '',
      fileName: extra?.fileName,
      receivedBytes: extra?.receivedBytes ?? task?.receivedBytes ?? 0,
      totalBytes: extra?.totalBytes ?? task?.totalBytes ?? 0,
      speedBps: extra?.speedBps,
      percent,
      status,
      destDir: task?.destDir,
      error: extra?.error
    }
    if (wc) {
      wc.send('model-download-progress', payload)
      if (status === 'completed') wc.send('model-download-complete', payload)
    } else {
      const all = BrowserWindow.getAllWindows()
      all.forEach(win => {
        win.webContents.send('model-download-progress', payload)
        if (status === 'completed') win.webContents.send('model-download-complete', payload)
      })
    }
  }

  /**
   * 获取事件对应的IPC通道
   */
  private getIpcChannelForEvent(event: ModelLoadingEvent): string {
    switch (event) {
      case ModelLoadingEvent.START:
        return ModelService.IPC_CHANNELS.LOADING_START
      case ModelLoadingEvent.COMPLETE:
        return ModelService.IPC_CHANNELS.LOADING_COMPLETE
      case ModelLoadingEvent.ERROR:
        return ModelService.IPC_CHANNELS.LOADING_ERROR
      default:
        throw new Error(`未知的事件类型: ${event}`)
    }
  }

  /**
   * 清理payload中的敏感数据
   */
  private sanitizePayload(payload?: unknown): unknown {
    if (!payload) return {}

    // 移除可能的敏感字段
    const { error, ...rest } = (payload as any) || {}

    // 确保错误信息是字符串
    const safeError = error ? String(error) : undefined

    return {
      ...rest,
      ...(safeError ? { error: safeError } : {})
    }
  }

  /**
   * 检查模型是否已下载完成
   * @param modelId 模型ID
   * @returns 是否已下载完成
   */
  async checkModelDownloadStatus(modelId: string) {
    return await ModelDownloadManager.getInstance().checkModelDownloadStatus(modelId)
  }

  /**
   * 获取已下载模型的目录路径
   * @param modelId 模型ID
   * @returns 模型目录路径，如果未下载则返回null
   */
  async getModelPath(modelId: string): Promise<string | null> {
    const status = await this.checkModelDownloadStatus(modelId)
    if (!status.isDownloaded) {
      return null
    }

    const model = ModelConfigService.getInstance()
      .loadModelConfig()
      .find(m => m.id === modelId)
    if (!model) return null

    return path.join(this.ensureModelDir(), model.id)
  }
  /**
   * 删除已下载的模型
   */
  async deleteModel(modelId: string): Promise<boolean> {
    const model = ModelConfigService.getInstance()
      .loadModelConfig()
      .find(m => m.id === modelId)
    if (!model) {
      throw new Error('模型不存在')
    }

    const dir = path.join(this.ensureModelDir(), model.id)
    if (!fs.existsSync(dir)) {
      return false
    }

    try {
      await fs.promises.rm(dir, { recursive: true, force: true })
      logger.info(LogCategory.MODEL_SERVICE, `模型已删除: ${modelId}`)
      return true
    } catch (error) {
      logger.error(LogCategory.MODEL_SERVICE, `删除模型失败: ${modelId}`, error)
      throw error
    }
  }
}

/**
 * 单例实例
 * 注意：由于可能的循环依赖，建议在方法内部使用 ModelService.getInstance()
 */
export const modelService = ModelService.getInstance();
