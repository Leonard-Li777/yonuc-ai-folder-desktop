/**
 * 设置相关的 IPC 处理器
 */

import { ipcMain, BrowserWindow } from 'electron';
import { logger, LogCategory } from '@yonuc/shared';
import { databaseService } from '../database/database-service';
import { FileCleanupService } from '../filesystem/file-cleanup-service';
import { IIgnoreRule } from '@yonuc/types/settings-types';
import { shouldIgnoreFile } from '../analysis/analysis-ignore-service';
import fs from 'fs';
import path from 'path';
import { analysisQueueService } from '../analysis-queue-service';
import { configService } from '../config/config-service';
import { defaultUnifiedConfig } from '../../config/config.default';
import { t } from '@app/languages';


/**
 * 获取系统预设忽略规则（来自默认统一配置，不可被用户修改/删除）
 */
function getSystemIgnoreRules(): IIgnoreRule[] {
  const rules = (defaultUnifiedConfig.analysis?.IGNORE_RULES ?? []) as IIgnoreRule[]
  return Array.isArray(rules) ? rules.filter(r => r.isSystem) : []
}

function isValidIgnoreRuleType(value: unknown): value is IIgnoreRule['type'] {
  return value === 'file' || value === 'directory' || value === 'extension' || value === 'pattern'
}

function generateIgnoreRuleId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 获取忽略规则（从统一配置），并自动补齐系统规则
 */
function getIgnoreRulesFromConfig(): IIgnoreRule[] {
  try {
    const systemRules = getSystemIgnoreRules()
    const systemIds = new Set(systemRules.map(r => r.id))

    const rules = configService.getValue<IIgnoreRule[]>('IGNORE_RULES')
    if (!Array.isArray(rules)) {
      return systemRules
    }

    const userRules = rules.filter(r => !r?.isSystem && !systemIds.has(r.id))
    return [...systemRules, ...userRules]
  } catch (error) {
    logger.error(LogCategory.SETTING, '从统一配置获取忽略规则失败:', error)
    return getSystemIgnoreRules()
  }
}

/**
 * 保存忽略规则（到统一配置）
 * - 系统规则：始终以默认统一配置为准，用户不可修改/删除
 * - 用户规则：允许增删改，但强制 isSystem=false
 */
function saveIgnoreRulesToConfig(rules: IIgnoreRule[]): void {
  const systemRules = getSystemIgnoreRules()
  const systemIds = new Set(systemRules.map(r => r.id))

  const sanitizedUserRules: IIgnoreRule[] = []

  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule || typeof rule !== 'object') continue

    // 任何被标记为系统规则的输入都忽略（防止伪造/修改系统规则）
    if ((rule as IIgnoreRule).isSystem) continue

    const id = typeof rule.id === 'string' && rule.id.trim().length > 0 ? rule.id : generateIgnoreRuleId()
    if (systemIds.has(id)) continue

    if (!isValidIgnoreRuleType(rule.type)) continue
    if (typeof rule.value !== 'string' || rule.value.trim().length === 0) continue

    sanitizedUserRules.push({
      id,
      type: rule.type,
      value: rule.value,
      isSystem: false,
      isActive: typeof rule.isActive === 'boolean' ? rule.isActive : true,
    })
  }

  try {
    configService.updateValue('IGNORE_RULES', [...systemRules, ...sanitizedUserRules])
    logger.info(LogCategory.SETTING, '忽略规则已保存到统一配置', {
      systemRuleCount: systemRules.length,
      userRuleCount: sanitizedUserRules.length,
    })
  } catch (error) {
    logger.error(LogCategory.SETTING, '保存忽略规则到统一配置失败:', error)
    throw error
  }
}

/** 注册设置相关的 IPC 处理器 */
export function registerSettingsIPCHandlers(): void {
  logger.info(LogCategory.SETTING, '注册设置相关 IPC 处理器...');

  // 获取 AI 分析忽略规则（从统一配置）
  ipcMain.handle('getAnalysisIgnoreRules', async () => {
    try {
      const rules = getIgnoreRulesFromConfig();
      return rules;
    } catch (error) {
      logger.error(LogCategory.SETTING, '获取忽略规则失败:', error);
      return [];
    }
  });

  // 保存 AI 分析忽略规则（到统一配置）
  ipcMain.handle('saveAnalysisIgnoreRules', async (event, rules: IIgnoreRule[]) => {
    try {
      saveIgnoreRulesToConfig(rules);
      
      // 通知分析队列重新加载忽略规则
      if (analysisQueueService && typeof analysisQueueService.reloadIgnoreRules === 'function') {
        analysisQueueService.reloadIgnoreRules();
      }
      return { success: true };
    } catch (error) {
      logger.error(LogCategory.SETTING, '保存忽略规则失败:', error);
      throw error;
    }
  });

  // 获取所有工作目录
  ipcMain.handle('get-all-workspace-directories', async () => {
    try {
      const directories = await databaseService.getAllWorkspaceDirectories();
      return directories;
    } catch (error) {
      logger.error(LogCategory.SETTING, '获取工作目录列表失败:', error);
      throw error;
    }
  });

  // 删除工作目录
  ipcMain.handle('delete-workspace-directory', async (event, directoryPath: string) => {
    try {
      logger.info(LogCategory.SETTING, '开始删除工作目录:', directoryPath);

      // 步骤 1: 删除关联的 .VirtualDirectory 文件夹
      const virtualDirPath = path.join(directoryPath, '.VirtualDirectory');
      if (fs.existsSync(virtualDirPath)) {
        logger.info(LogCategory.SETTING, `正在删除关联的 .VirtualDirectory: ${virtualDirPath}`);
        try {
          await fs.promises.rm(virtualDirPath, { recursive: true, force: true });
          logger.info(LogCategory.SETTING, '.VirtualDirectory 删除成功');
        } catch (fsError) {
          logger.error(LogCategory.SETTING, '删除 .VirtualDirectory 失败:', fsError);
          // 不抛出错误，即使文件夹删除失败，也继续删除数据库记录
        }
      }

      // 步骤 2: 从数据库删除记录
      await databaseService.deleteWorkspaceDirectory(directoryPath);
      logger.info(LogCategory.SETTING, '工作目录数据库记录已删除');
      
      // 步骤 3: 通知所有渲染进程工作目录已更新
      BrowserWindow.getAllWindows().forEach((win: BrowserWindow) => {
        win.webContents.send('workspace-directories-updated');
      });
      
      return { success: true };
    } catch (error) {
      logger.error(LogCategory.SETTING, '删除工作目录失败:', error);
      throw error;
    }
  });

  // 重置工作目录
  ipcMain.handle('reset-workspace-directory', async (event, directoryPath: string) => {
    try {
      logger.info(LogCategory.SETTING, '重置工作目录:', directoryPath);
      await databaseService.resetWorkspaceDirectoryAnalysis(directoryPath);
      logger.info(LogCategory.SETTING, '工作目录已重置');
      return { success: true };
    } catch (error) {
      logger.error(LogCategory.SETTING, '重置工作目录失败:', error);
      throw error;
    }
  });

  // 重新扫描工作目录
  ipcMain.handle('rescanWorkspaceDirectory', async (event, workspaceId: number) => {
    try {
      logger.info(LogCategory.SETTING, '重新扫描工作目录 ID:', workspaceId);
      const directory = await databaseService.getWorkspaceDirectoryById(workspaceId);
      if (!directory) {
        throw new Error(t('未找到 ID 为 {workspaceId} 的工作目录', {workspaceId}));
      }
      logger.info(LogCategory.SETTING, '正在扫描目录:', directory.path);
      const stats = await scanDirectoryRecursive(directory.path, directory.path, workspaceId);
      await databaseService.updateWorkspaceDirectoryLastScan(workspaceId);
      logger.info(LogCategory.SETTING, '目录扫描完成，统计信息:', stats);
      return { success: true, stats };
    } catch (error) {
      logger.error(LogCategory.SETTING, '重新扫描工作目录失败:', error);
      throw error;
    }
  });

  // 重置 AI 分析数据库
  ipcMain.handle('resetAnalysisDatabase', async () => {
    try {
      logger.info(LogCategory.SETTING, '重置 AI 分析数据库...');
      await databaseService.resetAllAnalysisData();
      logger.info(LogCategory.SETTING, 'AI 分析数据库已重置');
      return { success: true };
    } catch (error) {
      logger.error(LogCategory.SETTING, '重置 AI 分析数据库失败:', error);
      throw error;
    }
  });

  // 更新工作目录的 autoWatch 状态
  ipcMain.handle('update-workspace-directory-auto-watch', async (event, workspaceId: number, autoWatch: boolean) => {
    try {
      logger.info(LogCategory.SETTING, '更新工作目录 autoWatch 状态:', { workspaceId, autoWatch });
      
      // 更新数据库
      await databaseService.updateWorkspaceDirectoryAutoWatch(workspaceId, autoWatch);
      logger.info(LogCategory.SETTING, '工作目录 autoWatch 状态已更新');
      
      // 启动或停止文件监听
      const { fileWatcherService } = await import('../filesystem/file-watcher-service');
      const directory = await databaseService.getWorkspaceDirectoryById(workspaceId);
      
      if (!directory) {
        throw new Error(t('未找到工作目录 ID: {workspaceId}', {workspaceId}));
      }
      
      if (autoWatch && directory.isActive) {
        // 启动监听
        await fileWatcherService.startWatching(workspaceId, directory.path);
        logger.info(LogCategory.SETTING, `已启动目录监听: ${directory.path}`);
      } else {
        // 停止监听
        await fileWatcherService.stopWatching(workspaceId);
        logger.info(LogCategory.SETTING, `已停止目录监听: ${directory.path}`);
      }
      
      return { success: true };
    } catch (error) {
      logger.error(LogCategory.SETTING, '更新工作目录 autoWatch 状态失败:', error);
      throw error;
    }
  });

  logger.info(LogCategory.SETTING, '设置相关 IPC 处理器注册完成');
}

/** 递归扫描目录（仅扫描，不写入数据库 - 临时方案C） */
async function scanDirectoryRecursive(dirPath: string, rootPath: string, workspaceId: number): Promise<{
  filesAdded: number;
  filesUpdated: number;
  filesRemoved: number;
  newFiles: Array<{ path: string; name: string; size: number; type: string }>;
  modifiedFiles: Array<{ path: string; name: string; size: number; type: string }>;
}> {
  let filesAdded = 0;
  let filesUpdated = 0;
  let filesRemoved = 0;
  const newFiles: Array<{ path: string; name: string; size: number; type: string }> = [];
  const modifiedFiles: Array<{ path: string; name: string; size: number; type: string }> = [];
  const scannedPaths = new Set<string>();

  const ignoreRules = getIgnoreRulesFromConfig();
  logger.info(LogCategory.SETTING, `加载了 ${ignoreRules.length} 条忽略规则`);

  const scanDir = async (currentPath: string) => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (shouldIgnoreFile(fullPath, entry.name, ignoreRules)) {
          logger.debug(LogCategory.SETTING, `跳过被忽略的目录: ${fullPath}`);
          continue;
        }
        await scanDir(fullPath);
      } else if (entry.isFile()) {
        if (shouldIgnoreFile(fullPath, entry.name, ignoreRules)) {
          logger.debug(LogCategory.SETTING, `跳过被忽略的文件: ${fullPath}`);
          continue;
        }
        scannedPaths.add(fullPath);
        try {
          const stats = fs.statSync(fullPath);
          const existing = await databaseService.getFileByPath(fullPath);
          if (existing) {
            // 检查文件是否被修改（比较修改时间）
            if (existing.modifiedAt.getTime() !== stats.mtime.getTime()) {
              filesUpdated++;
              modifiedFiles.push({ path: fullPath, name: entry.name, size: stats.size, type: path.extname(entry.name).toLowerCase() });
              // 注意：不在这里更新数据库，只记录变更，由用户决定是否加入队列
            }
          } else {
            // 新文件：不在数据库中
            filesAdded++;
            newFiles.push({ path: fullPath, name: entry.name, size: stats.size, type: path.extname(entry.name).toLowerCase() });
            // 注意：不在这里添加到数据库，只记录发现的新文件，由用户决定是否加入队列
          }
        } catch (error) {
          logger.error(LogCategory.SETTING, `处理文件失败: ${fullPath}`, error);
        }
      }
    }
  };

  await scanDir(dirPath);

  const dbFiles = await databaseService.getFilesByWorkspaceId(workspaceId);
  if (dbFiles.length > 0) {
    const fileCleanupService = new FileCleanupService(databaseService.db!);
    for (const dbFile of dbFiles) {
      if (!scannedPaths.has(dbFile.path)) {
        logger.info(LogCategory.SETTING, `检测到已删除的文件: ${dbFile.path}`);
        try {
          await fileCleanupService.deleteFileAndCleanup(dbFile.id);
          filesRemoved++;
        } catch (error) {
          logger.error(LogCategory.SETTING, `清理已删除文件失败: ${dbFile.path}`, error);
        }
      }
    }
  }

  return { filesAdded, filesUpdated, filesRemoved, newFiles, modifiedFiles };
}
