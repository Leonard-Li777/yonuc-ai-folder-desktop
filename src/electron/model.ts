import * as os from 'os';
import {
  ILlamaModelConfig,
  IModelCapability,
  IModelFile,
  IDownloadSource,
  IHardwareRequirements,
  IModelPerformance,
  TModelCapabilityType,
  TModelQuality,
  TModelPerformance
} from '@yonuc/types/model-manager';
import { ModelConfigService } from './runtime-services/analysis/model-config-service';

/**
 * 模型配置类型 - 导出以供其他模块使用
 */
export type ModelConfig = ILlamaModelConfig;

/**
 * 根据硬件配置推荐模型
 * @param memoryGB 可用内存(GB)
 * @param hasGPU 是否有GPU支持
 * @param vramGB 显存大小(GB，可选)
 * @returns 推荐的模型ID数组，按推荐优先级排序
 */
export function recommendModelByHardware(memoryGB: number, hasGPU = false, vramGB?: number): string[] {
  const recommendedModels: string[] = [];
  const modelConfigs = ModelConfigService.getInstance().loadModelConfig();

  // 使用显存进行推荐（如果可用）
  if (vramGB !== undefined) {
    const maxVramForModel = vramGB * 0.75; // 使用显存的75%作为上限

    // 筛选出显存需求不超过上限的模型
    const eligibleModels = modelConfigs.filter(model => {
      const modelVram = model.vramRequiredGB || model.hardwareRequirements?.minMemoryGB;
      return modelVram <= maxVramForModel;
    });

    // 如果有符合条件的模型，选择功能列、能力最多的模型
    if (eligibleModels.length > 0) {
      // 按能力数量排序，能力多的在前面
      const sortedModels = [...eligibleModels].sort((a, b) => {
        // 计算每个模型的能力数量
        const capabilitiesA = a.capabilities.length;
        const capabilitiesB = b.capabilities.length;

        // 计算每个模型支持的文件格式数量
        const formatsA = a.capabilities.reduce((sum, cap) => sum + cap.supportedFormats.length, 0);
        const formatsB = b.capabilities.reduce((sum, cap) => sum + cap.supportedFormats.length, 0);

        // 综合排序：先按能力数量，再按支持格式数量
        if (capabilitiesB !== capabilitiesA) {
          return capabilitiesB - capabilitiesA;
        }
        return formatsB - formatsA;
      });

      // 推荐功能最多的一个模型
      recommendedModels.push(sortedModels[0].id);
    }
  } else {
    // 原有基于内存的推荐逻辑
    // 1. 内存匹配
    if (memoryGB >= 16) {
      // 内存≥16GB：推荐高质量多模态模型和大参数模型
      recommendedModels.push("qwen2.5-omni-7b-q8_0"); // 最高质量多模态
    } else if (memoryGB >= 8) {
      // 内存8-16GB：推荐平衡性能的多模态模型和中等参数模型
      recommendedModels.push("qwen2.5-omni-7b-q4_k_m"); // 平衡的多模态
    } else if (memoryGB >= 4) {
      // 内存4-8GB：推荐轻量级模型和压缩模型
      recommendedModels.push("qwen3-4b"); // Qwen最新一代
    } else if (memoryGB >= 2) {
      // 内存2-4GB：推荐极轻量模型
      recommendedModels.push("gemma-3-1b-q4_0"); // 轻量高效
    } else {
      // 内存<2GB：仅推荐最小模型
      recommendedModels.push("qwen3-0.6b-mlx-4bit"); // 超轻量苹果优化
    }

    // 2. GPU支持优化
    if (hasGPU) {
      // 有GPU支持时优先推荐需要GPU加速的模型
      // 当前推荐列表已经优先考虑了GPU友好的模型
    } else {
      // 无GPU时推荐CPU友好的模型
      // 过滤掉GPU要求严格的模型，优先推荐CPU友好的模型
      const cpuFriendlyModels = recommendedModels.filter(modelId => {
        const model = modelConfigs.find(m => m.id === modelId);
        return model ? !model.hardwareRequirements?.gpuAccelerated || (model.hardwareRequirements?.minMemoryGB ?? 0) <= memoryGB : false;
      });

      // 如果有CPU友好的模型，优先推荐它们
      if (cpuFriendlyModels.length > 0) {
        return [cpuFriendlyModels[0]]; // 只返回一个推荐模型
      }
    }
  }

  // 确保只返回一个推荐模型
  return recommendedModels.length > 0 ? [recommendedModels[recommendedModels.length - 1]] : [];
}

/**
 * 根据文件类型推荐模型
 * @param fileType 文件类型（文本、图像、音频、视频）
 * @returns 推荐的模型ID数组
 */
export function recommendModelByFileType(fileType: string): string[] {
  const recommendedModels: string[] = [];

  // 根据文件类型推荐最合适的模型
  switch (fileType) {
    case '文本':
    case 'TEXT':
      // 文本处理优先推荐文本能力强的模型
      recommendedModels.push("qwen3-4b");
      // recommendedModels.push("gemma-3n-e4b-q4_k_m");
      // recommendedModels.push("phi-4-mini-3.8b");
      // recommendedModels.push("llama-3.2-3b-instruct");
      recommendedModels.push("qwen3-0.6b-mlx-4bit");
      break;
    case '图像':
    case 'IMAGE':
      // 图像处理优先推荐多模态模型
      recommendedModels.push("qwen2.5-omni-7b-q4_k_m");
      recommendedModels.push("qwen2.5-omni-7b-q8_0");
      recommendedModels.push("qwen2.5-vl-7b-q2_k");
      recommendedModels.push("gemma-3-12b-q4_0-mmproj");
      recommendedModels.push("minicpm-v-4_5-q2_k");
      break;
    case '音频':
    case 'AUDIO':
      // 音频处理优先推荐多模态模型
      recommendedModels.push("qwen2.5-omni-7b-q4_k_m");
      recommendedModels.push("qwen2.5-omni-7b-q8_0");
      recommendedModels.push("minicpm-v-4_5-q2_k");
      break;
    case '视频':
    case 'VIDEO':
      // 视频处理优先推荐多模态模型
      recommendedModels.push("qwen2.5-omni-7b-q4_k_m");
      recommendedModels.push("qwen2.5-omni-7b-q8_0");
      recommendedModels.push("minicpm-v-4_5-q2_k");
      break;
    default:
      // 默认推荐平衡型模型
      recommendedModels.push("qwen2.5-omni-7b-q4_k_m");
      recommendedModels.push("qwen3-4b");
      recommendedModels.push("minicpm-v-4_5-q2_k");
  }

  return recommendedModels;
}

/**
 * 获取模型支持的文件格式
 * @param modelId 模型ID
 * @returns 支持的文件格式数组
 */
export function getSupportedFileFormats(modelId: string): string[] {
  const modelConfigs = ModelConfigService.getInstance().loadModelConfig();
  const model = modelConfigs.find(m => m.id === modelId);
  if (!model) return [];

  const formats: string[] = [];
  model.capabilities.forEach(capability => {
    formats.push(...capability.supportedFormats);
  });

  // 去重
  return [...new Set(formats)];
}

/**
 * 检查模型是否支持特定文件扩展名
 * @param modelId 模型ID
 * @param fileExtension 文件扩展名
 * @returns 是否支持
 */
export function isFileTypeSupported(modelId: string, fileExtension: string): boolean {
  const supportedFormats = getSupportedFileFormats(modelId);
  return supportedFormats.includes(fileExtension.toLowerCase());
}

/**
 * 新的 GGUF 格式模型配置缓存
 */

/**
 * 延迟加载 GGUF 格式模型配置，避免循环依赖
 */
function getLlamaModelsConfig(modelConfigs?: ILlamaModelConfig[]): ILlamaModelConfig[] {
  const configs = modelConfigs || ModelConfigService.getInstance().loadModelConfig();
  if (!configs) {
    return [];
  }
  return configs;
}

/**
 * 获取 GGUF 格式的模型配置
 * @param modelId 模型ID
 * @returns GGUF 格式的模型配置
 */
export function getLlamaModelConfig(modelId: string, modelConfigs?: ILlamaModelConfig[]): ILlamaModelConfig | null {
  return getLlamaModelsConfig(modelConfigs).find(m => m.id === modelId) || null;
}

/**
 * 获取所有 GGUF 格式的模型配置
 * @returns 所有 GGUF 格式的模型配置
 */
export function getAllLlamaModelConfigs(modelConfigs?: ILlamaModelConfig[]): ILlamaModelConfig[] {
  return getLlamaModelsConfig(modelConfigs);
}

/**
 * 根据能力类型获取支持的模型
 * @param capabilityType 能力类型
 * @returns 支持该能力的模型ID列表
 */
export function getModelsByCapability(capabilityType: TModelCapabilityType, modelConfigs?: ILlamaModelConfig[]): string[] {
  return getLlamaModelsConfig(modelConfigs)
    .filter(model => model.capabilities.some(cap => cap.type === capabilityType))
    .map(model => model.id);
}

/**
 * 检查模型是否为多模态模型
 * @param modelId 模型ID
 * @returns 是否为多模态模型
 */
export function isMultiModalModel(modelId: string, modelConfigs?: ILlamaModelConfig[]): boolean {
  const model = getLlamaModelConfig(modelId, modelConfigs);
  return model?.isMultiModal || false;
}

/**
 * 获取模型的量化类型
 * @param modelId 模型ID
 * @returns 量化类型
 */
export function getModelQuantization(modelId: string, modelConfigs?: ILlamaModelConfig[]): string | undefined {
  const model = getLlamaModelConfig(modelId, modelConfigs);
  return model?.quantization;
}

/**
 * 根据硬件配置推荐 GGUF 模型
 * @param memoryGB 可用内存(GB)
 * @param hasGPU 是否有GPU支持
 * @param vramGB 显存大小(GB，可选)
 * @returns 推荐的模型ID数组，按推荐优先级排序
 */
export function recommendLlamaModelsByHardware(memoryGB: number, hasGPU = false, vramGB?: number): string[] {
  const recommendedModels: string[] = [];
  const modelConfigs = ModelConfigService.getInstance().loadModelConfig();

  // 使用显存进行推荐（如果可用）
  if (vramGB !== undefined) {
    const maxVramForModel = vramGB * 0.75; // 使用显存的75%作为上限

    // 筛选出显存需求不超过上限的模型
    const eligibleModels = getLlamaModelsConfig(modelConfigs).filter(model => {
      return model.vramRequiredGB <= maxVramForModel;
    });

    // 如果有符合条件的模型，选择能力最多的模型
    if (eligibleModels.length > 0) {
      // 按能力数量和性能评分排序
      const sortedModels = [...eligibleModels].sort((a, b) => {
        // 先按能力数量排序
        const capabilitiesA = a.capabilities.length;
        const capabilitiesB = b.capabilities.length;

        if (capabilitiesB !== capabilitiesA) {
          return capabilitiesB - capabilitiesA;
        }

        // 再按性能评分排序
        return b.performance.score - a.performance.score;
      });

      // 推荐功能最多的一个模型
      recommendedModels.push(sortedModels[0].id);
    }
  } else {
    // 基于内存的推荐逻辑
    if (memoryGB >= 16) {
      recommendedModels.push("qwen2.5-omni-7b-q8_0"); // 最高质量多模态
    } else if (memoryGB >= 8) {
      recommendedModels.push("qwen2.5-omni-7b-q4_k_m"); // 平衡的多模态
    } else if (memoryGB >= 4) {
      recommendedModels.push("qwen3-4b"); // Qwen最新一代
    } else if (memoryGB >= 2) {
      recommendedModels.push("gemma-3-1b-q4_0"); // 轻量高效
    }

    // GPU支持优化
    if (!hasGPU) {
      // 无GPU时优先推荐CPU友好的模型
      const cpuFriendlyModels = recommendedModels.filter(modelId => {
        const model = getLlamaModelConfig(modelId, modelConfigs);
        return model ? !model.hardwareRequirements?.gpuAccelerated || (model.hardwareRequirements?.minMemoryGB ?? 0) <= memoryGB : false;
      });

      if (cpuFriendlyModels.length > 0) {
        return [cpuFriendlyModels[0]];
      }
    }
  }

  return recommendedModels.length > 0 ? [recommendedModels[0]] : [];
}

/**
 * 根据文件类型推荐 GGUF 模型
 * @param fileType 文件类型（文本、图像、音频、视频）
 * @returns 推荐的模型ID数组
 */
export function recommendLlamaModelsByFileType(fileType: TModelCapabilityType): string[] {
  const modelConfigs = ModelConfigService.getInstance().loadModelConfig();
  return getModelsByCapability(fileType, modelConfigs)
    .sort((a, b) => {
      const modelA = getLlamaModelConfig(a, modelConfigs);
      const modelB = getLlamaModelConfig(b, modelConfigs);

      if (!modelA || !modelB) return 0;

      // 按性能评分排序
      return modelB.performance.score - modelA.performance.score;
    })
    .slice(0, 3); // 返回前3个推荐模型
}
