/**
 * Llama Model Manager - 管理 llama-server 兼容的 GGUF 格式模型
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

import { BrowserWindow, app, net, session, webContents } from 'electron';
import {
  ILlamaModelConfig,
  ILlamaModelManager,
  IModelCapabilityInfo,
  IModelDownloadTask,
  IModelEventData,
  IModelRecommendation,
  IModelSummary,
  IModelValidationResult,
  ModelEvent,
  TModelCapabilityType
} from '@yonuc/types';
import { LogCategory, logger } from '@yonuc/shared';
import {
  getAllLlamaModelConfigs,
  getLlamaModelConfig,
  isMultiModalModel,
  recommendLlamaModelsByFileType,
  recommendLlamaModelsByHardware
} from '../../model';

import { EventEmitter } from 'events';
import { configService } from '../config/config-service';
import { createWriteStream } from 'fs';
import { ModelCapabilityDetector } from './model-capability-detector';
import { ModelDownloadManager } from '../ai/model-download-manager';
import { ModelStatusService } from './model-status-service';
import { MultiModalModelService } from '../ai/multimodal-model-service';
import { t } from '@app/languages';

/**
 * Llama 模型管理器实现
 */
export class LlamaModelManager extends EventEmitter implements ILlamaModelManager {
  private static instance: LlamaModelManager;
  private downloadTasks = new Map<string, IModelDownloadTask>();
  private modelCache = new Map<string, ILlamaModelConfig>();
  private capabilityCache = new Map<string, IModelCapabilityInfo>();

  public static getInstance(): LlamaModelManager {
    if (!LlamaModelManager.instance) {
      LlamaModelManager.instance = new LlamaModelManager();
    }
    return LlamaModelManager.instance;
  }

  private constructor() {
    super();
  // 延迟初始化缓存以避免循环依赖
  // 循环依赖发生在：
  // llama-model-manager.ts 的第880行创建了单例 llamaModelManager
  // llama-model-manager.ts 的构造函数（第46-52行）直接调用 this.initializeCache()
  //     this.initializeCache() 方法（第57-62行）调用 getAllLlamaModelConfigs() 函数
  // getAllLlamaModelConfigs() 函数（在 model.ts 中）依赖 ModelConfigService.getInstance()
  // 当 ModelConfigService 尚未完全初始化时，就会出现 "Cannot access 'ModelConfigService' before initialization" 错误

    setImmediate(() => {
      this.initializeCache();
    });

    if (logger) {
      logger.debug(LogCategory.LLAMA_MODEL_MANAGER, '[LlamaModelManager] Llama模型管理器已创建')
    }
  }

  /**
   * 初始化缓存
   */
  private initializeCache(): void {
    // 预加载所有模型配置到缓存
    getAllLlamaModelConfigs().forEach(config => {
      this.modelCache.set(config.id, config);
    });
  }

  /**
   * 获取所有可用模型列表
   */
  async listModels(): Promise<IModelSummary[]> {
    const models = getAllLlamaModelConfigs();
    const summaries: IModelSummary[] = [];

    for (const model of models) {
      const status = await ModelDownloadManager.getInstance().checkModelDownloadStatus(model.id);
      const downloadTask = this.getActiveDownloadTask(model.id);

      const summary: IModelSummary = {
        id: model.id,
        name: model.name,
        description: model.description,
        company: model.company,
        parameterSize: model.parameterSize,
        totalSizeText: model.totalSize,
        totalSizeBytes: model.totalSizeBytes,
        minVramGB: model.hardwareRequirements?.minVramGB || 0,
        recommendedVramGB: model.hardwareRequirements?.recommendedVramGB || 0,
        gpuAccelerated: model.hardwareRequirements?.gpuAccelerated ?? false,
        performance: model.performance || { speed: 'medium', quality: 'medium', score: 0 },
        capabilities: (model.capabilities ?? []).map(c => c.type),
        tags: model.tags || [],
        files: model.files || [],
        vramRequiredGB: model.vramRequiredGB || 0,
        isDownloaded: status.isDownloaded,
        downloadProgress: downloadTask?.status === 'downloading'
          ? Math.round((downloadTask.receivedBytes / downloadTask.totalBytes) * 100)
          : undefined,
        isRecommended: this.isRecommendedModel(model.id)
      };

      summaries.push(summary);
    }

    // 按推荐优先级和显存需求排序
    return summaries.sort((a, b) => {
      // 推荐模型优先
      if (a.isRecommended !== b.isRecommended) {
        return a.isRecommended ? -1 : 1;
      }
      
      // 按显存需求从低到高排序
      if (a.vramRequiredGB !== b.vramRequiredGB) {
        return a.vramRequiredGB - b.vramRequiredGB;
      }
      
      // 按性能评分排序
      return b.performance.score - a.performance.score;
    });
  }

  /**
   * 获取模型详细信息
   */
  async getModelInfo(modelId: string): Promise<ILlamaModelConfig | null> {
    return this.modelCache.get(modelId) || null;
  }


  /**
   * 获取模型路径
   */
  async getModelPath(modelId: string): Promise<string | null> {
    // 使用 ModelDownloadManager.getInstance() 检查模型是否已下载
    const downloadStatus = await ModelDownloadManager.getInstance().checkModelDownloadStatus(modelId);
    if (!downloadStatus.isDownloaded) return null;

    const modelDir = await this.getModelDirectory(modelId);
    
    try {
      // 查找目录中的.gguf文件
      const files = await fs.readdir(modelDir);
      const ggufFiles = files.filter(file => file.endsWith('.gguf'));
      
      if (ggufFiles.length === 0) {
        logger.warn(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 在模型目录中未找到.gguf文件: ${modelDir}`);
        return null;
      }
      
      // 主模型文件是除了投影文件之外的文件
      const modelFiles = ggufFiles.filter(file => 
        !file.toLowerCase().includes('mmproj')
      );
      
      let mainModelFile: string | undefined;
      
      if (modelFiles.length > 0) {
        // 如果没找到特定的文件，使用第一个模型文件
        if (!mainModelFile) {
          mainModelFile = modelFiles[0];
        }
      } else {
        // 如果没有非投影文件，这可能是个错误的模型目录
        logger.error(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 模型目录中只有投影文件，没有主模型文件: ${modelDir}`);
        return null;
      }
      
      const modelPath = path.join(modelDir, mainModelFile);
      logger.log(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 找到模型文件: ${modelPath}`);
      
      return modelPath;
    } catch (error) {
      logger.error(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 读取模型目录失败: ${modelDir}`, error);
      return null;
    }
  }

  /**
   * 获取多模态模型配置
   */
  async getMultiModalModelConfig(modelId: string): Promise<{
    modelPath: string;
    mmprojPath?: string;
    isMultiModal: boolean;
  } | null> {
    // 使用 ModelDownloadManager.getInstance() 检查模型是否已下载
    const downloadStatus = await ModelDownloadManager.getInstance().checkModelDownloadStatus(modelId);
    if (!downloadStatus.isDownloaded) {
      logger.warn(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 模型尚未下载: ${modelId}`);
      return null;
    }

    const modelDir = await this.getModelDirectory(modelId);
    logger.log(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 检查模型目录: ${modelDir}`);
    
    try {
      // 查找目录中的.gguf文件
      const files = await fs.readdir(modelDir);
      const ggufFiles = files.filter(file => file.endsWith('.gguf'));
      
      if (ggufFiles.length === 0) {
        logger.warn(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 在模型目录中未找到.gguf文件: ${modelDir}`);
        return null;
      }
      
      logger.log(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 在目录中找到 ${ggufFiles.length} 个.gguf文件: ${ggufFiles.join(', ')}`);
      
      // 查找主模型文件和投影文件
      logger.log(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 检测主模型文件，模型ID: ${modelId}`);
      logger.log(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 可用文件: ${ggufFiles.join(', ')}`);
      
      // 首先分离出投影文件
      const mmprojFiles = ggufFiles.filter(file => 
        file.toLowerCase().includes('mmproj')
      );
      
      // 主模型文件是除了投影文件之外的文件
      const modelFiles = ggufFiles.filter(file => 
        !file.toLowerCase().includes('mmproj')
      );
      
      logger.log(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 投影文件: ${mmprojFiles.join(', ')}`);
      logger.log(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 模型文件: ${modelFiles.join(', ')}`);
      
      // 选择主模型文件
      let mainModelFile: string | undefined;
      
      if (modelFiles.length > 0) {
        // 优先选择包含模型ID或Instruct的文件
        mainModelFile = modelFiles.find(file => {
          const hasModelId = file.includes(modelId);
          const hasInstruct = file.toLowerCase().includes('instruct');
          const hasChat = file.toLowerCase().includes('chat');
          
          logger.log(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 检查模型文件 ${file}: hasModelId=${hasModelId}, hasInstruct=${hasInstruct}, hasChat=${hasChat}`);
          
          return hasModelId || hasInstruct || hasChat;
        });
        
        // 如果没找到特定的文件，使用第一个模型文件
        if (!mainModelFile) {
          mainModelFile = modelFiles[0];
          logger.log(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 未找到特定模型文件，使用第一个: ${mainModelFile}`);
        }
      } else {
        // 如果没有非投影文件，这可能是个错误的模型目录
        logger.error(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 模型目录中只有投影文件，没有主模型文件: ${modelDir}`);
        return null;
      }
      
      logger.log(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 选择的主模型文件: ${mainModelFile}`);
      
      // 选择投影文件（如果有多个，选择第一个）
      const mmprojFile = mmprojFiles.length > 0 ? mmprojFiles[0] : undefined;
      
      const modelPath = path.join(modelDir, mainModelFile);
      const mmprojPath = mmprojFile ? path.join(modelDir, mmprojFile) : undefined;
      const isMultiModal = !!mmprojFile;
      
      logger.log(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 多模态模型配置:`, {
        modelId,
        modelPath: path.basename(modelPath),
        mmprojPath: mmprojPath ? path.basename(mmprojPath) : undefined,
        isMultiModal
      });
      
      // 验证文件是否存在
      if (modelPath) {
        try {
          await fs.access(modelPath);
          logger.log(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 主模型文件存在: ${modelPath}`);
        } catch (error) {
          logger.error(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 主模型文件不存在: ${modelPath}`, error);
          return null;
        }
      }
      
      if (mmprojPath) {
        try {
          await fs.access(mmprojPath);
          logger.log(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 投影文件存在: ${mmprojPath}`);
        } catch (error) {
          logger.error(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 投影文件不存在: ${mmprojPath}`, error);
          // 不返回null，因为某些情况下可能没有投影文件但仍可运行
        }
      }
      
      return {
        modelPath,
        mmprojPath,
        isMultiModal
      };
    } catch (error) {
      logger.error(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 读取模型目录失败: ${modelDir}`, error);
      return null;
    }
  }


  /**
   * 获取下载任务状态
   */
  getDownloadTask(taskId: string): IModelDownloadTask | null {
    return this.downloadTasks.get(taskId) || null;
  }

  /**
   * 验证模型完整性
   */
  async validateModel(modelId: string): Promise<IModelValidationResult> {
    const model = await this.getModelInfo(modelId);
    if (!model) {
      return {
        isValid: false,
        modelId,
        validatedFiles: [],
        missingFiles: [],
        corruptedFiles: [],
        errors: [t('型配置不存在: {modelId}',{modelId})],
        warnings: []
      };
    }

    const modelDir = await this.getModelDirectory(modelId);

    // 如果是多模态模型，使用专门的验证逻辑
    if (model.isMultiModal) {
      return await MultiModalModelService.getInstance().checkMultiModalIntegrity(modelId, modelDir);
    }

    // 标准模型验证逻辑
    const validatedFiles: IModelValidationResult['validatedFiles'] = [];
    const missingFiles: string[] = [];
    const corruptedFiles: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const file of model.files) {
      const filePath = path.join(modelDir, file.name);
      
      try {
        const stats = await fs.stat(filePath);
        const sizeMatch = Math.abs(stats.size - file.sizeBytes) <= (file.sizeBytes * 0.05);
        
        let hashMatch: boolean | undefined;
        if (file.sha256) {
          try {
            const hash = await this.calculateFileHash(filePath);
            hashMatch = hash === file.sha256;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            warnings.push(t('无法计算文件哈希: {file} - {error}', {file: file.name, error: errorMessage}));
          }
        }

        validatedFiles.push({
          fileName: file.name,
          exists: true,
          sizeMatch,
          hashMatch,
          error: !sizeMatch ? t('文件大小不匹配'): undefined
        });

        if (!sizeMatch) {
          corruptedFiles.push(file.name);
        }
      } catch {
        validatedFiles.push({
          fileName: file.name,
          exists: false,
          sizeMatch: false,
          error: '文件不存在'
        });
        
        if (file.required) {
          missingFiles.push(file.name);
        }
      }
    }

    const isValid = missingFiles.length === 0 && corruptedFiles.length === 0;

    return {
      isValid,
      modelId,
      validatedFiles,
      missingFiles,
      corruptedFiles,
      errors,
      warnings
    };
  }

  /**
   * 删除模型
   */
  async deleteModel(modelId: string): Promise<void> {
    const modelDir = await this.getModelDirectory(modelId);
    
    try {
      await fs.rm(modelDir, { recursive: true, force: true });
      
      // 发送删除事件
      this.emitModelEvent(ModelEvent.MODEL_DELETED, { modelId });
      
      logger.log(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 模型已删除: ${modelId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(t('删除模型失败: {error}', {error: errorMessage}));
    }
  }

  /**
   * 获取模型能力信息
   */
  async getModelCapabilities(modelId: string): Promise<IModelCapabilityInfo> {
    return await ModelCapabilityDetector.getInstance().detectModelCapabilities(modelId);
  }

  /**
   * 检查文件类型支持
   */
  async checkFileTypeSupport(modelId: string, fileExtension: string) {
    return await ModelCapabilityDetector.getInstance().checkFileTypeSupport(modelId, fileExtension);
  }

  /**
   * 获取模型状态
   */
  async getModelStatus(modelId: string) {
    return await ModelCapabilityDetector.getInstance().getModelStatus(modelId);
  }

  /**
   * 获取支持特定文件类型的模型
   */
  async getModelsByFileType(fileExtension: string) {
    return await ModelCapabilityDetector.getInstance().getModelsByFileType(fileExtension);
  }

  /**
   * 获取能力限制
   */
  async getCapabilityLimitations(modelId: string, capabilityType: TModelCapabilityType) {
    return await ModelCapabilityDetector.getInstance().getCapabilityLimitations(modelId, capabilityType);
  }

  /**
   * 设置当前活跃模型
   */
  async setCurrentModel(modelId: string): Promise<void> {
    await ModelStatusService.getInstance().setCurrentModel(modelId);
  }

  /**
   * 获取当前模型状态栏信息
   */
  getStatusBarInfo() {
    return ModelStatusService.getInstance().getStatusBarInfo();
  }

  /**
   * 检查文件兼容性
   */
  async checkFileCompatibility(fileExtension: string) {
    return await ModelStatusService.getInstance().checkFileCompatibility(fileExtension);
  }

  /**
   * 根据硬件配置推荐模型
   */
  async recommendModelsByHardware(
    memoryGB: number,
    hasGPU?: boolean,
    vramGB?: number
  ): Promise<IModelRecommendation> {
    const recommendedModelIds = recommendLlamaModelsByHardware(memoryGB, hasGPU, vramGB);
    const reasons: { [modelId: string]: string } = {};
    const hardwareMatchScore: { [modelId: string]: number } = {};
    const useCaseMatchScore: { [modelId: string]: number } = {};

    for (const modelId of recommendedModelIds) {
      const model = await this.getModelInfo(modelId);
      if (!model) continue;

      // 计算硬件匹配度
      let hwScore = 0;
      if (vramGB && model.vramRequiredGB <= vramGB) {
        hwScore += 40;
      }
      if ((model.hardwareRequirements?.minMemoryGB ?? 0) <= memoryGB) {
        hwScore += 30;
      }
      if (hasGPU && model.hardwareRequirements?.gpuAccelerated) {
        hwScore += 20;
      }
      if (!hasGPU && !model.hardwareRequirements?.gpuAccelerated) {
        hwScore += 10;
      }

      hardwareMatchScore[modelId] = Math.min(100, hwScore);

      // 计算用例匹配度（基于能力数量和质量）
      const capabilityScore = model.capabilities.length * 20;
      const qualityScore = model.performance.score * 0.3;
      useCaseMatchScore[modelId] = Math.min(100, capabilityScore + qualityScore);

      // 生成推荐原因
      const reasonParts: string[] = [];
      if (model.isMultiModal) {
        reasonParts.push(t('支持多模态'));
      }
      if (model.vramRequiredGB <= (vramGB || 0)) {
        reasonParts.push(t('显存需求适中'));
      }
      if (model.performance.speed === 'fast' || model.performance.speed === 'very_fast') {
        reasonParts.push(t('推理速度快'));
      }
      
      reasons[modelId] = reasonParts.join('，') || t('综合性能良好');
    }

    return {
      recommendedModels: recommendedModelIds,
      reasons,
      hardwareMatchScore,
      useCaseMatchScore
    };
  }

  /**
   * 根据文件类型推荐模型
   */
  async recommendModelsByFileType(fileType: TModelCapabilityType): Promise<string[]> {
    return recommendLlamaModelsByFileType(fileType);
  }

  /**
   * 检查模型是否支持特定文件类型
   */
  async isFileTypeSupported(modelId: string, fileExtension: string): Promise<boolean> {
    const formats = await this.getSupportedFileFormats(modelId);
    return formats.includes(fileExtension.toLowerCase());
  }

  /**
   * 获取支持的文件格式
   */
  async getSupportedFileFormats(modelId: string): Promise<string[]> {
    const model = await this.getModelInfo(modelId);
    if (!model) return [];

    const formats: string[] = [];
    model.capabilities.forEach(capability => {
      formats.push(...capability.supportedFormats);
    });

    return [...new Set(formats)]; // 去重
  }

  /**
   * 迁移现有模型配置
   */
  async migrateFromLegacyConfig(): Promise<void> {
    // 这里可以实现从旧配置格式到新格式的迁移逻辑
    logger.log(LogCategory.LLAMA_MODEL_MANAGER, '[LlamaModelManager] 配置迁移完成');
  }

  /**
   * 获取多模态模型信息
   */
  async getMultiModalInfo(modelId: string) {
    return await MultiModalModelService.getInstance().analyzeMultiModalModel(modelId);
  }

  /**
   * 验证多模态文件关联
   */
  async validateMultiModalAssociations(modelId: string) {
    const modelDir = await this.getModelDirectory(modelId);
    return await MultiModalModelService.getInstance().validateFileAssociations(modelId, modelDir);
  }

  /**
   * 检查模型是否支持特定模态
   */
  async supportsModality(modelId: string, modality: TModelCapabilityType): Promise<boolean> {
    return MultiModalModelService.getInstance().supportsModality(modelId, modality);
  }

  /**
   * 获取模型支持的模态类型
   */
  async getSupportedModalities(modelId: string): Promise<TModelCapabilityType[]> {
    return MultiModalModelService.getInstance().getSupportedModalities(modelId);
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.modelCache.clear();
    this.capabilityCache.clear();
    MultiModalModelService.getInstance().clearCache();
    ModelCapabilityDetector.getInstance().clearCache();
    this.initializeCache();
    
    this.emitModelEvent(ModelEvent.CACHE_CLEARED, {
      modelId: 'all'
    });
  }

  /**
   * 刷新基础目录配置（当配置变更时调用）
   */
  refreshBaseDirectory(): void {
    logger.info(LogCategory.LLAMA_MODEL_MANAGER, '[LlamaModelManager] 刷新基础目录配置');
    this.clearCache();
  }

  /**
   * 获取模型目录路径
   */
  private async getModelDirectory(modelId: string): Promise<string> {
    try {
      const configuredPath = configService.getValue<string>('MODEL_STORAGE_PATH');
      if (configuredPath && configuredPath.trim().length > 0) {
        // 如果配置了路径，则使用配置路径作为模型存储的根目录
        const baseDir = path.resolve(configuredPath.trim());
        await fs.mkdir(baseDir, { recursive: true });
        return path.join(baseDir, modelId);
      }
    } catch (error) {
      logger.warn(LogCategory.LLAMA_MODEL_MANAGER, '读取模型存储路径失败，将使用默认目录', error);
    }
    // 回退到默认目录
    const defaultModelsDir = path.join(app.getPath('userData'), 'models');
    await fs.mkdir(defaultModelsDir, { recursive: true });
    return path.join(defaultModelsDir, modelId);
  }


  /**
   * 获取活跃的下载任务
   */
  private getActiveDownloadTask(modelId: string): IModelDownloadTask | undefined {
    for (const task of this.downloadTasks.values()) {
      if (task.modelId === modelId && (task.status === 'downloading' || task.status === 'pending')) {
        return task;
      }
    }
    return undefined;
  }

  /**
   * 判断是否为推荐模型
   */
  private isRecommendedModel(modelId: string): boolean {
    // 基于一些启发式规则判断是否为推荐模型
    const recommendedIds = [
      'qwen2.5-omni-7b-q4_k_m',
      'qwen3-4b',
      'gemma-3-4b-q4_0-mmproj',
      'Qwen3VL-4B-Instruct-Q8_0'
    ];
    
    return recommendedIds.includes(modelId);
  }

  /**
   * 估算处理时间
   */
  private estimateProcessingTime(model: ILlamaModelConfig): number {
    // 基于模型大小和性能等级估算处理时间（毫秒）
    const baseTime = model.totalSizeBytes / (1024 ** 3) * 1000; // 每GB约1秒
    
    switch (model.performance.speed) {
      case 'very_fast': return baseTime * 0.5;
      case 'fast': return baseTime * 0.7;
      case 'medium': return baseTime * 1.0;
      case 'slow': return baseTime * 1.5;
      default: return baseTime;
    }
  }

  /**
   * 开始文件下载
   */
  private async startFileDownloads(
    task: IModelDownloadTask,
    model: ILlamaModelConfig,
    webContentsId?: number
  ): Promise<void> {
    task.status = 'downloading';
    
    try {
      // 获取下载优先级（多模态模型需要特定顺序）
      let filesToDownload: import('@yonuc/types').IModelFile[];
      
      if (model.isMultiModal) {
        // 使用多模态服务获取优先级排序
        filesToDownload = MultiModalModelService.getInstance().getDownloadPriority(model.id);
      } else {
        // 标准模型按原顺序下载
        filesToDownload = model.files.filter(f => f.required);
      }
      
      // 按优先级顺序下载文件
      for (const file of filesToDownload) {
        await this.downloadFile(task, file, webContentsId);
        
        if ((task.status as string) === 'cancelled' || (task.status as string) === 'canceled') {
          return;
        }
      }

      // 所有文件下载完成
      task.status = 'completed';
      task.endTime = new Date();
      task.receivedBytes = task.totalBytes;

      this.emitModelEvent(ModelEvent.DOWNLOAD_COMPLETE, {
        modelId: task.modelId,
        taskId: task.taskId
      });

      this.downloadTasks.delete(task.taskId);
    } catch (error) {
      task.status = 'error';
      task.endTime = new Date();
      task.error = String(error);

      this.emitModelEvent(ModelEvent.DOWNLOAD_ERROR, {
        modelId: task.modelId,
        taskId: task.taskId,
        error: String(error)
      });

      this.downloadTasks.delete(task.taskId);
    }
  }

  /**
   * 下载单个文件
   */
  private async downloadFile(
    task: IModelDownloadTask,
    file: import('@yonuc/types').IModelFile,
    webContentsId?: number
  ): Promise<void> {
    const filePath = path.join(task.destDir, file.name);
    
    // 检查文件是否已存在且完整
    try {
      const stats = await fs.stat(filePath);
      const tolerance = file.sizeBytes * 0.05;
      
      if (Math.abs(stats.size - file.sizeBytes) <= tolerance) {
        logger.debug(LogCategory.LLAMA_MODEL_MANAGER, `[LlamaModelManager] 文件已存在且完整，跳过下载: ${file.name}`);
        task.fileProgress.set(file.name, file.sizeBytes);
        this.updateTaskProgress(task, webContentsId);
        return;
      }
    } catch {
      // 文件不存在，继续下载
    }

    return new Promise((resolve, reject) => {
      const request = net.request({ url: file.url, session: session.defaultSession });
      
      request.on('response', (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(t('下载失败，状态码: {statusCode}', {statusCode: response.statusCode})));
          return;
        }

        const writeStream = createWriteStream(filePath);
        let receivedBytes = 0;
        let lastUpdateTime = Date.now();

        task.currentFileName = file.name;

        response.on('data', (chunk: Buffer) => {
          if ((task.status as string) === 'cancelled' || (task.status as string) === 'canceled') {
            request.abort();
            writeStream.close();
            return;
          }

          writeStream.write(chunk);
          receivedBytes += chunk.length;
          
          // 更新文件进度
          task.fileProgress.set(file.name, receivedBytes);
          
          // 限制更新频率（每500ms更新一次）
          const now = Date.now();
          if (now - lastUpdateTime > 500) {
            this.updateTaskProgress(task, webContentsId);
            lastUpdateTime = now;
          }
        });

        response.on('end', () => {
          writeStream.end();
          task.fileProgress.set(file.name, file.sizeBytes);
          this.updateTaskProgress(task, webContentsId);
          resolve();
        });

        response.on('error', (error) => {
          writeStream.close();
          reject(error);
        });
      });

      request.on('error', (error) => {
        reject(error);
      });

      request.end();
    });
  }

  /**
   * 更新任务进度
   */
  private updateTaskProgress(task: IModelDownloadTask, webContentsId?: number): void {
    // 计算总进度
    let totalReceived = 0;
    task.fileProgress.forEach(bytes => {
      totalReceived += bytes;
    });
    
    task.receivedBytes = totalReceived;
    
    const progress = Math.round((totalReceived / task.totalBytes) * 100);
    
    // 发送进度事件
    this.emitModelEvent(ModelEvent.DOWNLOAD_PROGRESS, {
      modelId: task.modelId,
      taskId: task.taskId,
      progress,
      fileName: task.currentFileName,
      receivedBytes: totalReceived,
      totalBytes: task.totalBytes
    });

    // 发送到特定的webContents
    if (webContentsId) {
      const wc = webContents.fromId(webContentsId);
      if (wc) {
        wc.send('model-download-progress', {
          taskId: task.taskId,
          modelId: task.modelId,
          progress,
          fileName: task.currentFileName,
          receivedBytes: totalReceived,
          totalBytes: task.totalBytes,
          status: task.status
        });
      }
    }
  }

  /**
   * 计算文件哈希
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    const fileBuffer = await fs.readFile(filePath);
    hash.update(fileBuffer);
    return hash.digest('hex');
  }

  /**
   * 发送模型事件
   */
  private emitModelEvent(event: ModelEvent, data: IModelEventData): void {
    this.emit(event, data);
    
    // 广播到所有窗口
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send(`model-${event}`, data);
    });
  }
}

/**
 * 单例实例
 * 注意：由于可能的循环依赖，建议在方法内部使用 LlamaModelManager.getInstance()
 */
export const llamaModelManager = LlamaModelManager.getInstance();
