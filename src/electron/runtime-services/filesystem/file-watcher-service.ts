import chokidar from 'chokidar';
import path from 'node:path';
import fs from 'node:fs';
import { logger, LogCategory } from '@yonuc/shared';
import { databaseService } from '../database/database-service';
import { analysisQueueService } from '../analysis-queue-service';
import { loadIgnoreRules, shouldIgnoreFile } from '../analysis/analysis-ignore-service';
import { configService } from '../config/config-service';
import type { IIgnoreRule } from '@yonuc/types';

/**
 * 文件监听服务类
 */
class FileWatcherService {
  private watchers: Map<number, ReturnType<typeof chokidar.watch>> = new Map();
  private ignoreRules: IIgnoreRule[] = [];
  private isInitialized = false;

  /**
   * 初始化文件监听服务
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn(LogCategory.FILE_WATCHER, '文件监听服务已经初始化');
      return;
    }

    try {
      logger.info(LogCategory.FILE_WATCHER, '初始化文件监听服务...');

      // 加载忽略规则
      this.ignoreRules = loadIgnoreRules();
      logger.info(LogCategory.FILE_WATCHER, `已加载 ${this.ignoreRules.length} 条忽略规则`);

      // 启动所有启用了 autoWatch 的工作目录的监听
      await this.startAllAutoWatchers();

      this.isInitialized = true;
      logger.info(LogCategory.FILE_WATCHER, '文件监听服务初始化成功');
    } catch (error) {
      logger.error(LogCategory.FILE_WATCHER, '文件监听服务初始化失败:', error);
      throw error;
    }
  }

  /**
   * 启动所有启用了 autoWatch 的工作目录的监听
   */
  async startAllAutoWatchers(): Promise<void> {
    try {
      const directories = await databaseService.getAllWorkspaceDirectories();
      const autoWatchDirs = directories.filter(dir => dir.autoWatch && dir.isActive);

      logger.info(LogCategory.FILE_WATCHER, `找到 ${autoWatchDirs.length} 个启用自动监听的目录`);

      for (const directory of autoWatchDirs) {
        if (directory.id) {
          await this.startWatching(directory.id, directory.path);
        }
      }
    } catch (error) {
      logger.error(LogCategory.FILE_WATCHER, '启动自动监听失败:', error);
      throw error;
    }
  }

  /**
   * 开始监听指定目录
   * @param workspaceId 工作目录ID
   * @param directoryPath 目录路径
   */
  async startWatching(workspaceId: number, directoryPath: string): Promise<void> {
    try {
      // 如果已经在监听，先停止
      if (this.watchers.has(workspaceId)) {
        logger.info(LogCategory.FILE_WATCHER, `目录 ${directoryPath} 已在监听中，先停止旧的监听器`);
        await this.stopWatching(workspaceId);
      }

      logger.info(LogCategory.FILE_WATCHER, `开始监听目录: ${directoryPath}`);

      // 创建监听器
      const watcher = chokidar.watch(directoryPath, {
        persistent: true,
        ignoreInitial: true, // 不触发初始文件的事件
        // recursive: true, // chokidar默认递归监听，不需要显式设置
        awaitWriteFinish: {
          stabilityThreshold: 2000, // 文件稳定2秒后才触发事件（等待文件写入完成）
          pollInterval: 100
        },
        ignored: (filePath: string) => {
          // 检查是否应该忽略此文件
          const fileName = path.basename(filePath);
          return shouldIgnoreFile(filePath, fileName, this.ignoreRules);
        }
      });

      // 监听新增文件事件
      watcher.on('add', async (filePath: string) => {
        await this.handleFileAdded(workspaceId, directoryPath, filePath);
      });

      // 监听文件修改事件
      watcher.on('change', async (filePath: string) => {
        await this.handleFileChanged(workspaceId, directoryPath, filePath);
      });

      // 监听文件删除事件
      watcher.on('unlink', async (filePath: string) => {
        await this.handleFileDeleted(workspaceId, directoryPath, filePath);
      });

      // 监听错误事件
      watcher.on('error', (error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(LogCategory.FILE_WATCHER, `监听目录 ${directoryPath} 时发生错误:`, errorMessage);
      });

      // 监听就绪事件
      watcher.on('ready', () => {
        logger.info(LogCategory.FILE_WATCHER, `目录 ${directoryPath} 监听就绪`);
      });

      this.watchers.set(workspaceId, watcher);
      logger.info(LogCategory.FILE_WATCHER, `成功启动对目录 ${directoryPath} 的监听`);
    } catch (error) {
      logger.error(LogCategory.FILE_WATCHER, `启动目录监听失败: ${directoryPath}`, error);
      throw error;
    }
  }

  /**
   * 停止监听指定目录
   * @param workspaceId 工作目录ID
   */
  async stopWatching(workspaceId: number): Promise<void> {
    try {
      const watcher = this.watchers.get(workspaceId);
      if (watcher) {
        await watcher.close();
        this.watchers.delete(workspaceId);
        logger.info(LogCategory.FILE_WATCHER, `已停止监听目录 ID: ${workspaceId}`);
      }
    } catch (error) {
      logger.error(LogCategory.FILE_WATCHER, `停止目录监听失败 ID: ${workspaceId}`, error);
      throw error;
    }
  }

  /**
   * 同步指定目录中的文件差异（即时对齐）
   * @param dirPath 目录路径
   */
  async syncDirectory(dirPath: string): Promise<void> {
    if (!this.isInitialized) {
      // 确保忽略规则已加载
      this.ignoreRules = loadIgnoreRules();
    }

    try {
      logger.debug(LogCategory.FILE_WATCHER, `正在即时同步目录: ${dirPath}`);

      // 1. 获取工作空间信息
      const workspace = await databaseService.findRootWorkspaceDirectory(dirPath);
      if (!workspace || !workspace.id) {
        logger.debug(LogCategory.FILE_WATCHER, `目录不在任何工作空间中，跳过同步: ${dirPath}`);
        return;
      }

      // 2. 读取磁盘文件
      if (!fs.existsSync(dirPath)) return;
      const diskEntries = fs.readdirSync(dirPath, { withFileTypes: true });
      const diskFiles = diskEntries.filter(e => e.isFile());

      const diskFileMap = new Map<string, fs.Stats>();
      for (const file of diskFiles) {
        const fullPath = path.join(dirPath, file.name);
        if (!shouldIgnoreFile(fullPath, file.name, this.ignoreRules)) {
          try {
            diskFileMap.set(fullPath, fs.statSync(fullPath));
          } catch (e) {
            // 文件可能在过程中消失
          }
        }
      }

      // 3. 读取数据库记录
      const dbFiles = await databaseService.getFilesByParentPath(dirPath, workspace.id);
      const dbFileMap = new Map<string, any>();
      for (const file of dbFiles) {
        dbFileMap.set(file.path, file);
      }

      // 4. 对比并对齐
      // 处理磁盘上存在的文件
      for (const [filePath, stats] of diskFileMap.entries()) {
        const dbFile = dbFileMap.get(filePath);
        if (!dbFile) {
          // 新增文件
          logger.info(LogCategory.FILE_WATCHER, `即时同步发现新文件: ${filePath}`);
          await this.handleFileAdded(workspace.id, dirPath, filePath);
        } else if (dbFile.modifiedAt.getTime() !== stats.mtime.getTime() || dbFile.size !== stats.size) {
          // 文件修改
          logger.info(LogCategory.FILE_WATCHER, `即时同步发现修改: ${filePath}`);
          await this.handleFileChanged(workspace.id, dirPath, filePath);
        }
      }

      // 处理数据库中多余的记录
      for (const [pathInDb, dbFile] of dbFileMap.entries()) {
        if (!diskFileMap.has(pathInDb)) {
          // 文件被删除
          logger.info(LogCategory.FILE_WATCHER, `即时同步发现删除: ${pathInDb}`);
          await this.handleFileDeleted(workspace.id, dirPath, pathInDb);
        }
      }

    } catch (error) {
      logger.error(LogCategory.FILE_WATCHER, `同步目录失败: ${dirPath}`, error);
    }
  }

  /**
   * 处理文件新增事件
   */
  private async handleFileAdded(workspaceId: number, directoryPath: string, filePath: string): Promise<void> {
    try {
      logger.info(LogCategory.FILE_WATCHER, `检测到新文件: ${filePath}`);

      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        logger.warn(LogCategory.FILE_WATCHER, `文件不存在: ${filePath}`);
        return;
      }

      // 获取文件信息
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        logger.debug(LogCategory.FILE_WATCHER, `跳过非文件: ${filePath}`);
        return;
      }

      // 添加文件到数据库
      const fileId = await databaseService.addFileFromPath(filePath, directoryPath);
      logger.info(LogCategory.FILE_WATCHER, `文件已添加到数据库: ${filePath}, ID: ${fileId}`);

      // 检查是否需要自动加入分析队列
      const autoAnalyze = configService.getValue<boolean>('AUTO_ANALYZE_NEW_FILES')
      if (autoAnalyze) {
        // 将文件加入分析队列
        const fileName = path.basename(filePath);
        const fileExt = path.extname(filePath).toLowerCase();

        analysisQueueService.addItems([
          {
            path: filePath,
            name: fileName,
            size: stats.size,
            type: fileExt || 'unknown'
          }
        ], false); // forceReanalyze = false

        logger.info(LogCategory.FILE_WATCHER, `文件已加入分析队列: ${filePath}`);
      } else {
        logger.info(LogCategory.FILE_WATCHER, `自动分析已禁用，仅添加文件到数据库: ${filePath}`);
      }
    } catch (error) {
      logger.error(LogCategory.FILE_WATCHER, `处理新增文件失败: ${filePath}`, error);
    }
  }

  /**
   * 处理文件修改事件
   */
  private async handleFileChanged(workspaceId: number, directoryPath: string, filePath: string): Promise<void> {
    try {
      logger.info(LogCategory.FILE_WATCHER, `检测到文件修改: ${filePath}`);

      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        logger.warn(LogCategory.FILE_WATCHER, `文件不存在: ${filePath}`);
        return;
      }

      // 获取文件信息
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        logger.debug(LogCategory.FILE_WATCHER, `跳过非文件: ${filePath}`);
        return;
      }

      // 更新数据库中的文件修改时间
      await databaseService.updateFileModifiedTime(filePath, stats.mtime);
      logger.debug(LogCategory.FILE_WATCHER, `文件修改时间已更新: ${filePath}`);

      // 获取文件记录
      const file = await databaseService.getFileByPath(filePath);
      if (!file) {
        logger.warn(LogCategory.FILE_WATCHER, `数据库中未找到文件记录: ${filePath}`);
        return;
      }

      // 检查是否需要自动重新加入分析队列
      const autoAnalyze = configService.getValue<boolean>('AUTO_ANALYZE_NEW_FILES')
      if (autoAnalyze) {
        // 先计算内容哈希，看是否真的变了（或者能复用之前的分析结果）
        const contentHash = await databaseService.calculateFileHash(filePath)

        // 如果内容哈希没变，仅更新元数据即可，不需要重分析
        if (file.contentHash === contentHash && file.isAnalyzed) {
          logger.info(LogCategory.FILE_WATCHER, `文件内容无变化，跳过队列分析: ${filePath}`)
          return
        }

        // 将文件重新加入分析队列（覆盖旧的分析结果）
        const fileName = path.basename(filePath);
        const fileExt = path.extname(filePath).toLowerCase();

        analysisQueueService.addItems([
          {
            path: filePath,
            name: fileName,
            size: stats.size,
            type: fileExt || 'unknown'
          }
        ], true); // forceReanalyze = true 强制重新分析

        logger.info(LogCategory.FILE_WATCHER, `修改的文件已重新加入分析队列: ${filePath}`);
      } else {
        logger.debug(LogCategory.FILE_WATCHER, `自动分析已禁用，仅更新文件元数据: ${filePath}`);
      }
    } catch (error) {
      logger.error(LogCategory.FILE_WATCHER, `处理文件修改失败: ${filePath}`, error);
    }
  }

  /**
   * 处理文件删除事件
   */
  private async handleFileDeleted(workspaceId: number, directoryPath: string, filePath: string): Promise<void> {
    try {
      logger.info(LogCategory.FILE_WATCHER, `检测到文件删除: ${filePath}`);

      // 从数据库中删除文件记录
      const file = await databaseService.getFileByPath(filePath);
      if (file) {
        const { FileCleanupService } = await import('./file-cleanup-service');
        const fileCleanupService = new FileCleanupService(databaseService.db!);
        await fileCleanupService.deleteFileAndCleanup(file.id);
        logger.info(LogCategory.FILE_WATCHER, `文件已从数据库中删除: ${filePath}`);
      } else {
        logger.debug(LogCategory.FILE_WATCHER, `数据库中未找到文件记录: ${filePath}`);
      }
    } catch (error) {
      logger.error(LogCategory.FILE_WATCHER, `处理文件删除失败: ${filePath}`, error);
    }
  }

  /**
   * 重新加载忽略规则
   */
  reloadIgnoreRules(): void {
    try {
      this.ignoreRules = loadIgnoreRules();
      logger.info(LogCategory.FILE_WATCHER, `已重新加载 ${this.ignoreRules.length} 条忽略规则`);
    } catch (error) {
      logger.error(LogCategory.FILE_WATCHER, '重新加载忽略规则失败:', error);
    }
  }

  /**
   * 清理所有监听器
   */
  async cleanup(): Promise<void> {
    try {
      logger.info(LogCategory.FILE_WATCHER, '清理文件监听服务...');

      for (const [workspaceId, watcher] of this.watchers.entries()) {
        await watcher.close();
        logger.debug(LogCategory.FILE_WATCHER, `已关闭监听器: ${workspaceId}`);
      }

      this.watchers.clear();
      this.isInitialized = false;

      logger.info(LogCategory.FILE_WATCHER, '文件监听服务已清理');
    } catch (error) {
      logger.error(LogCategory.FILE_WATCHER, '清理文件监听服务失败:', error);
      throw error;
    }
  }

  /**
   * 获取当前监听的目录数量
   */
  getWatcherCount(): number {
    return this.watchers.size;
  }

  /**
   * 检查指定目录是否正在监听
   */
  isWatching(workspaceId: number): boolean {
    return this.watchers.has(workspaceId);
  }
}

// 导出单例
export const fileWatcherService = new FileWatcherService();
