/**
 * AI分析忽略规则服务
 * 负责加载和应用文件忽略规则
 * 
 * 规则存储：使用统一配置系统（ConfigOrchestrator）
 */

import type { IIgnoreRule } from '@yonuc/types/settings-types'

import { filterIgnoredFilesByRules, logger, LogCategory, shouldIgnoreFileByRules } from '@yonuc/shared'

import { configService } from '../config/config-service'

/**
 * 加载忽略规则配置（从统一配置）
 */
export function loadIgnoreRules(): IIgnoreRule[] {
  try {
    const rules = configService.getValue<IIgnoreRule[]>('IGNORE_RULES')
    
    if (Array.isArray(rules) && rules.length > 0) {
      logger.info(LogCategory.SETTING, '[IgnoreRules] 从统一配置加载忽略规则', {
        ruleCount: rules.length
      })
      return rules
    }

    logger.warn(LogCategory.SETTING, '[IgnoreRules] 统一配置中没有忽略规则，返回空数组')
    return []
  } catch (error) {
    logger.error(LogCategory.SETTING, '[IgnoreRules] 加载忽略规则失败:', error)
    return []
  }
}

/**
 * 检查文件是否应该被忽略
 */
export function shouldIgnoreFile(filePath: string, fileName: string, rules: IIgnoreRule[]): boolean {
  return shouldIgnoreFileByRules(filePath, fileName, rules)
}

/**
 * 过滤文件列表，移除应被忽略的文件
 */
export function filterIgnoredFiles(
  files: Array<{ path: string; name: string }>,
  rules: IIgnoreRule[]
): Array<{ path: string; name: string }> {
  return filterIgnoredFilesByRules(files, rules)
}
