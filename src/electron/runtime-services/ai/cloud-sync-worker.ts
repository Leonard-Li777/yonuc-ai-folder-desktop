import { LogCategory, logger } from '@yonuc/shared';
import { net, powerMonitor } from 'electron';

import { cloudAnalysisService } from '@yonuc/server';
import { configService } from '../config';
import { databaseService } from '../database/database-service';

/**
 * 云端同步 Worker
 * 负责在系统空闲且网络连通时，将本地未同步的数据批量上传至云端
 */
export class CloudSyncWorker {
  private static instance: CloudSyncWorker;
  private isSyncing = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 50;

  private initialized = false;
  private cloudDimMap = new Map<string, number>();
  private cloudTagMap = new Map<string, number>();
  private nextSyncAllowedAt: number | null = null;

  private constructor() { }

  public static getInstance(): CloudSyncWorker {
    if (!CloudSyncWorker.instance) {
      CloudSyncWorker.instance = new CloudSyncWorker();
    }
    return CloudSyncWorker.instance;
  }

  /**
   * 刷新云端 ID 映射缓存
   * 💡 应用启动时调用一次或在必要时手动触发
   */
  public async refreshCloudMaps(): Promise<void> {
    const language = configService.getValue<string>('DEFAULT_LANGUAGE') || 'zh-CN';
    logger.info(LogCategory.SUPABASE, `CloudSyncWorker: Refreshing cloud ID maps for [${language}]...`);

    try {
      // 1. 获取维度映射 (Name -> CloudID)
      const cloudDimensions = await cloudAnalysisService.fetchDimensions(language);
      this.cloudDimMap = new Map<string, number>(cloudDimensions.map(d => [d.name, Number(d.id)]));

      // 2. 获取标签映射 (DimID + Name -> CloudID)
      const cloudTags = await cloudAnalysisService.fetchTags(language);
      this.cloudTagMap = new Map<string, number>(
        cloudTags.map(t => [`${t.dimension_id}:${t.name}`, Number(t.id)])
      );

      this.initialized = true;
      logger.info(LogCategory.SUPABASE, `CloudSyncWorker: Cloud ID maps refreshed. (Dims: ${this.cloudDimMap.size}, Tags: ${this.cloudTagMap.size})`);
    } catch (error) {
      logger.error(LogCategory.SUPABASE, 'CloudSyncWorker: Failed to refresh cloud ID maps', error);
    }
  }

  /**
   * 判断是否处于调试模式
   */
  private isDebugMode(): boolean {
    return process.env.NODE_ENV === 'development' || process.argv.includes('--debug-sync');
  }

  /**
   * 启动同步 Worker
   */
  public start(): void {
    if (this.checkInterval) return;

    // 调试模式下每 3 秒检查一次，生产模式每 30 秒 (提高响应速度)
    const interval = this.isDebugMode() ? 3000 : 30 * 1000;

    logger.info(LogCategory.SUPABASE, `CloudSyncWorker: Starting sync worker (Interval: ${interval / 1000}s)...`);

    this.checkInterval = setInterval(() => {
      this.trySync();
    }, interval);
  }

  /**
   * 停止同步 Worker
   */
  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * 尝试执行同步
   */
  public async trySync(): Promise<void> {
    if (this.isSyncing) return;

    if (this.nextSyncAllowedAt && Date.now() < this.nextSyncAllowedAt) {
      return;
    }

    // 1. 检查网络状态
    if (!net.isOnline()) {
      return;
    }

    // 2. 检查系统空闲状态
    // const idleThreshold = 3;
    // const idleState = powerMonitor.getSystemIdleState(Math.ceil(idleThreshold));

    // if (idleState === 'active') {
    //   return;
    // }

    // 3. 确保云端映射已初始化
    if (!this.initialized) {
      await this.refreshCloudMaps();
    }

    await this.performSync();
  }

  /**
   * 执行实际的同步逻辑
   * 💡 回归传统：在上传前根据【名称】动态映射本地 ID 为云端 ID，解决外键冲突
   */
  private async performSync(): Promise<void> {
    this.isSyncing = true;
    try {
      const db = databaseService.db;
      if (!db) return;

      const language = configService.getValue<string>('DEFAULT_LANGUAGE') || 'zh-CN';
      const panDimensionIds = configService.getValue<number[]>('PAN_DIMENSION_IDS') || [];

      // ==================================================================================
      // Phase 1: 准备数据与同步定义 (Dimensions & Tags)
      // ==================================================================================

      // 1.1 选取待同步的文件
      const pendingFiles = db.prepare(`
        SELECT f.* FROM files f
        JOIN workspace_directories wd ON f.workspace_id = wd.id
        WHERE f.sync_status = 0 AND f.is_analyzed = 1 AND wd.type = 'SPEEDY'
        LIMIT ?
      `).all(this.BATCH_SIZE) as any[];

      // 1.2 找出这些文件引用的所有标签 (无论同步状态如何，只要文件要同步，其关联的标签定义必须在云端存在)
      let tagsToSync: any[] = [];

      if (pendingFiles.length > 0) {
        const fileIds = pendingFiles.map(f => f.id);
        // 查询文件关联的所有标签详情
        const relatedTags = db.prepare(`
          SELECT DISTINCT ft.*, fd.name as dimension_name, fd.level, fd.description, fd.is_ai_generated, fd.trigger_conditions, fd.applicable_file_types, fd.context_hints, fd.created_at as dim_created_at
          FROM file_tag_relations ftr
          JOIN file_tags ft ON ftr.tag_id = ft.id
          JOIN file_dimensions fd ON ft.dimension_id = fd.id
          WHERE ftr.file_id IN (${fileIds.map(() => '?').join(',')})
        `).all(...fileIds) as any[];

        tagsToSync = relatedTags;
      }

      // 1.3 加上其他本身状态为 pending 的标签 (可能未被上述文件引用)
      const otherPendingTags = db.prepare(`
        SELECT DISTINCT ft.*, fd.name as dimension_name, fd.level, fd.description, fd.is_ai_generated, fd.trigger_conditions, fd.applicable_file_types, fd.context_hints, fd.created_at as dim_created_at
        FROM file_tags ft
        JOIN file_dimensions fd ON ft.dimension_id = fd.id
        WHERE ft.sync_status = 0
        LIMIT ?
      `).all(this.BATCH_SIZE) as any[];

      // 合并去重
      const allTags = [...tagsToSync, ...otherPendingTags];
      // 简单的 ID 去重
      const uniqueTags = Array.from(new Map(allTags.map(item => [item.id, item])).values());

      // 1.4 处理 Pan-Dimensions 过滤 (如果配置了泛维度，这些维度的标签不上云)
      // FIX: 移除过滤逻辑，确保所有标签都能同步，否则用户数据会丢失。
      // "污染公共库"的问题应由后端通过数据隔离解决，而不是客户端丢弃数据。
      let tagsPayload: any[] = [];
      let dimsPayload: any[] = [];

      if (uniqueTags.length > 0) {
        let tagsProcessList = uniqueTags;

        // 准备 Dimensions Payload (去重)
        const dimMap = new Map();
        tagsProcessList.forEach(t => {
          if (!dimMap.has(t.dimension_name)) {
            dimMap.set(t.dimension_name, {
              name: t.dimension_name,
              level: t.level,
              description: t.description,
              is_ai_generated: Boolean(t.is_ai_generated),
              trigger_conditions: typeof t.trigger_conditions === 'string' ? JSON.parse(t.trigger_conditions) : t.trigger_conditions,
              applicable_file_types: typeof t.applicable_file_types === 'string' ? JSON.parse(t.applicable_file_types) : t.applicable_file_types,
              context_hints: typeof t.context_hints === 'string' ? JSON.parse(t.context_hints) : t.context_hints,
              created_at: t.dim_created_at
            });
          }
        });
        dimsPayload = Array.from(dimMap.values());
      }

      // 执行 Phase 1 同步：先确保 Dimensions 和 Tags 存在

      // Step A: 上传 Dimensions
      if (dimsPayload.length > 0) {
        await cloudAnalysisService.batchSync({ dimensions: dimsPayload }, language);
        // 立即刷新 Map 以获取新维度的 ID
        await this.refreshCloudMaps();
      }

      // Step B: 上传 Tags (现在有 Dim ID 了)
      if (uniqueTags.length > 0) {
        // 重新使用 uniqueTags (包含所有维度)
        const tagsProcessList = uniqueTags;

        tagsPayload = tagsProcessList.map(t => {
          const cloudDimId = this.cloudDimMap.get(t.dimension_name);
          if (!cloudDimId) {
            logger.warn(LogCategory.SUPABASE, `CloudSyncWorker: Missing cloud ID for dimension [${t.dimension_name}], skipping tag [${t.name}]`);
            return null; // 理论上不应发生，除非 Dim 同步失败
          }
          return {
            name: t.name,
            dimension_id: cloudDimId,
            created_at: t.created_at
          };
        }).filter(Boolean);

        if (tagsPayload.length > 0) {
          await cloudAnalysisService.batchSync({ tags: tagsPayload }, language);

          // 标记这些 Tags 为已同步
          const ids = tagsProcessList.map(t => t.id);
          db.prepare(`UPDATE file_tags SET sync_status = 2 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);

          // 再次刷新 Map 以获取新标签的 ID (供 Relations 使用)
          await this.refreshCloudMaps();
        }
      }

      // ==================================================================================
      // Phase 2: 同步 Files 及其关联 (Files & Relations)
      // ==================================================================================

      if (pendingFiles.length > 0) {
        // 构建文件 Payload
        const cloudFiles = pendingFiles.map(f => ({
          id: f.content_hash,
          smart_name: f.smart_name,
          size: f.size,
          author: f.author,
          description: f.description,
          content: f.content,
          language: f.language,
          quality_score: f.quality_score,
          quality_confidence: f.quality_confidence,
          quality_criteria: typeof f.quality_criteria === 'string' ? JSON.parse(f.quality_criteria) : f.quality_criteria,
          quality_reasoning: f.quality_reasoning,
          grouping_reason: f.grouping_reason,
          grouping_confidence: f.grouping_confidence,
          multimodal_content: f.multimodal_content,
          last_analyzed_at: f.last_analyzed_at
        }));

        // 获取这些文件的所有关联标签 (快照)
        const fileIds = pendingFiles.map(f => f.id);
        const fileTags = db.prepare(`
          SELECT f.content_hash as file_id, ft.name as tag_name, fd.name as dimension_name
          FROM file_tag_relations ftr
          JOIN files f ON ftr.file_id = f.id
          JOIN file_tags ft ON ftr.tag_id = ft.id
          JOIN file_dimensions fd ON ft.dimension_id = fd.id
          WHERE ftr.file_id IN (${fileIds.map(() => '?').join(',')})
        `).all(...fileIds) as any[];

        // 映射 Tag 关联到云端 ID
        const relationsPayload = fileTags.map(ft => {
          const cloudDimId = this.cloudDimMap.get(ft.dimension_name);
          if (!cloudDimId) {
            logger.warn(LogCategory.SUPABASE, `CloudSyncWorker: Missing cloud ID for dimension [${ft.dimension_name}], skipping file-tag relation for file [${ft.file_id}]`);
            return null;
          }

          const cloudTagId = this.cloudTagMap.get(`${cloudDimId}:${ft.tag_name}`);
          if (!cloudTagId) {
            logger.warn(LogCategory.SUPABASE, `CloudSyncWorker: Missing cloud ID for tag [${ft.dimension_name}:${ft.tag_name}], skipping file-tag relation`);
            return null;
          }

          return {
            file_id: ft.file_id,
            tag_id: cloudTagId
          };
        }).filter(Boolean);

        try {
          // 发送 Batch: Files + Relations
          await cloudAnalysisService.batchSync({
            files: cloudFiles,
            tag_relations: relationsPayload
          }, language);

          // 更新 Files 的同步状态
          db.prepare(`UPDATE files SET sync_status = 2 WHERE id IN (${fileIds.map(() => '?').join(',')})`).run(...fileIds);
          db.prepare(`UPDATE file_tag_relations SET sync_status = 2 WHERE file_id IN (${fileIds.map(() => '?').join(',')})`).run(...fileIds);

          logger.info(LogCategory.SUPABASE, `CloudSyncWorker: Synced ${pendingFiles.length} files and ${relationsPayload.length} relations`);
        } catch (e) {
          logger.error(LogCategory.SUPABASE, 'Files sync failed', e);
        }
      }

      // ==================================================================================
      // Phase 3: 同步 Expansions (单向提案)
      // ==================================================================================

      const pendingDimExp = db.prepare(`SELECT * FROM dimension_expansions WHERE sync_status = 0 LIMIT ?`).all(this.BATCH_SIZE) as any[];
      let pendingTagExp = db.prepare(`
        SELECT te.*, fd.name as dimension_name, fd.id as real_dimension_id 
        FROM tag_expansions te
        JOIN file_dimensions fd ON te.dimension_id = fd.id
        WHERE te.sync_status = 0 
        LIMIT ?
      `).all(this.BATCH_SIZE) as any[];

      // 过滤泛维度标签提案：泛维度的标签不进入审核流程
      if (panDimensionIds.length > 0) {
        const panSet = new Set(panDimensionIds);
        // 自动将泛维度的标签提案标记为已同步（实际上是本地忽略，不上报）
        const panTagExps = pendingTagExp.filter(te => panSet.has(te.real_dimension_id));
        if (panTagExps.length > 0) {
          const ids = panTagExps.map(t => t.id);
          // 标记为 2 (Synced) 以免下次重复查询，但实际上并未上传到 tag_expansions 表
          db.prepare(`UPDATE tag_expansions SET sync_status = 2 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
          logger.info(LogCategory.SUPABASE, `CloudSyncWorker: Skipped ${ids.length} pan-dimension tag expansions`);
        }
        // 仅保留非泛维度提案
        pendingTagExp = pendingTagExp.filter(te => !panSet.has(te.real_dimension_id));
      }

      if (pendingDimExp.length > 0 || pendingTagExp.length > 0) {
        try {
          const tagExpPayload = pendingTagExp.map(te => {
            const cloudDimId = this.cloudDimMap.get(te.dimension_name);
            return {
              name: te.name,
              dimension_id: cloudDimId || te.dimension_id,
              created_at: te.created_at
            };
          });

          await cloudAnalysisService.batchSync({
            dimension_expansions: pendingDimExp.map(d => ({
              name: d.name,
              level: d.level,
              tags: typeof d.tags === 'string' ? JSON.parse(d.tags) : d.tags,
              trigger_conditions: typeof d.trigger_conditions === 'string' ? JSON.parse(d.trigger_conditions) : d.trigger_conditions,
              description: d.description,
              created_at: d.created_at
            })),
            tag_expansions: tagExpPayload
          }, language);

          if (pendingDimExp.length > 0) {
            const ids = pendingDimExp.map(d => d.id);
            db.prepare(`UPDATE dimension_expansions SET sync_status = 2 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
          }
          if (pendingTagExp.length > 0) {
            const ids = pendingTagExp.map(t => t.id);
            db.prepare(`UPDATE tag_expansions SET sync_status = 2 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
          }
          logger.info(LogCategory.SUPABASE, `CloudSyncWorker: Synced expansions (Dims: ${pendingDimExp.length}, Tags: ${pendingTagExp.length})`);
        } catch (e) {
          logger.error(LogCategory.SUPABASE, 'Expansions sync failed', e);
        }
      }

      this.cleanupProcessedExpansions(db);

      this.nextSyncAllowedAt = null;
    } catch (error) {
      logger.error(LogCategory.SUPABASE, 'CloudSyncWorker: Sync cycle crashed', { error });
      const msg = error instanceof Error ? error.message : String(error);
      if (/permission denied/i.test(msg) || /42501/.test(msg)) {
        this.nextSyncAllowedAt = Date.now() + 10 * 60 * 1000;
        logger.warn(LogCategory.SUPABASE, 'CloudSyncWorker: 检测到云端权限错误，暂停同步 10 分钟');
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * 清理本地已审核通过（或已存在于标准库中）的扩展记录
   * 逻辑：如果 dimension_expansions/tag_expansions 中的内容在 file_dimensions/file_tags 中已存在且 sync_status=2，
   * 说明云端已接纳（审核通过）并同步回了本地，此时应删除本地的 expansion 记录以防冗余。
   */
  private cleanupProcessedExpansions(db: any): void {
    try {
      // 1. 清理维度提案
      // 只要 file_dimensions 里有同名且已同步的维度，就删除对应的提案
      const deletedDims = db.prepare(`
        DELETE FROM dimension_expansions 
        WHERE name IN (
          SELECT name FROM file_dimensions WHERE sync_status = 2
        )
      `).run();

      if (deletedDims.changes > 0) {
        logger.info(LogCategory.SUPABASE, `CloudSyncWorker: Cleaned up ${deletedDims.changes} approved dimension expansions`);
      }

      // 2. 清理标签提案
      // 只要 file_tags 里有同名、同维度（通过维度名匹配）且已同步的标签，就删除对应的提案
      // 注意：这里通过维度名关联，因为 ID 可能会变（本地临时 ID vs 云端正式 ID）
      const deletedTags = db.prepare(`
        DELETE FROM tag_expansions 
        WHERE EXISTS (
          SELECT 1 
          FROM file_tags ft 
          JOIN file_dimensions fd_real ON ft.dimension_id = fd_real.id
          JOIN file_dimensions fd_exp ON tag_expansions.dimension_id = fd_exp.id
          WHERE ft.name = tag_expansions.name 
          AND fd_real.name = fd_exp.name 
          AND ft.sync_status = 2
        )
      `).run();

      if (deletedTags.changes > 0) {
        logger.info(LogCategory.SUPABASE, `CloudSyncWorker: Cleaned up ${deletedTags.changes} approved tag expansions`);
      }
    } catch (e) {
      logger.error(LogCategory.SUPABASE, 'Failed to cleanup processed expansions', e);
    }
  }
}

export const cloudSyncWorker = CloudSyncWorker.getInstance();
