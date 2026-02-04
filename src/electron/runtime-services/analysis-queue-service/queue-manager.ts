/**
 * 队列管理模块
 * 负责分析队列的增删改查、状态管理和数据库同步
 */

import { logger, LogCategory } from '@yonuc/shared'
import { databaseService } from '../database/database-service'
import { shouldIgnoreFile } from '../analysis/analysis-ignore-service'
import type { IIgnoreRule } from '@yonuc/types'
import type { AnalysisQueueItem, AnalysisQueueSnapshot } from '@yonuc/types'
import type { EnqueueInput } from './types'

export class QueueManager {
  private queue: AnalysisQueueItem[] = []
  private isInitialized = false
  private ignoreRules: IIgnoreRule[] = []
  
  // 回调函数
  private onUpdate?: () => void
  private onPersist?: () => void
  private onWakeUp?: () => void

  constructor(
    ignoreRules: IIgnoreRule[] = [],
    callbacks?: {
      onUpdate?: () => void
      onPersist?: () => void
      onWakeUp?: () => void
    }
  ) {
    this.ignoreRules = ignoreRules
    this.onUpdate = callbacks?.onUpdate
    this.onPersist = callbacks?.onPersist
    this.onWakeUp = callbacks?.onWakeUp
  }

  /**
   * 设置忽略规则
   */
  setIgnoreRules(rules: IIgnoreRule[]): void {
    this.ignoreRules = rules
  }

  /**
   * 从数据库加载队列
   */
  async loadFromDB(): Promise<void> {
    try {
      logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 从数据库加载队列状态...')
      const rows = databaseService.getAnalysisQueue()
      logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 从数据库加载到', rows.length, '个项目')

      // 将 DB 行恢复为队列项，只恢复非 completed 状态的项目
      this.queue = rows
        .filter(r => r.status !== 'completed')
        .map(r => ({
          id: r.id,
          path: r.file_path,
          name: r.file_name,
          size: 0, // 数据库中没有存储 size，使用默认值
          type: r.file_type,
          status: r.status as 'pending' | 'analyzing' | 'completed' | 'failed',
          error: r.error ?? undefined,
          addedAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
          updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
          progress: r.progress ?? 0,
        } as AnalysisQueueItem))

      // 重置所有 analyzing 状态的项目为 pending，因为应用重启后这些项目应该重新开始
      const analyzingItems = this.queue.filter(item => item.status === 'analyzing')
      if (analyzingItems.length > 0) {
        logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 重置', analyzingItems.length, '个 analyzing 状态的项目为 pending')

        // 批量更新数据库状态
        const transaction = databaseService.db?.transaction(() => {
          for (const item of analyzingItems) {
            item.status = 'pending'
            item.progress = 0
            item.error = undefined
            item.updatedAt = Date.now()

            databaseService.updateAnalysisQueue({
              id: item.id,
              status: 'pending',
              progress: 0,
              error: null
            })
          }
        })

        try {
          transaction?.()
          logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 批量重置状态完成')
        } catch (e) {
          logger.error(LogCategory.ANALYSIS_QUEUE, '[分析队列] 批量重置状态失败:', e)
          // 如果批量操作失败，逐个重试
          for (const item of analyzingItems) {
            try {
              item.status = 'pending'
              item.progress = 0
              item.error = undefined
              item.updatedAt = Date.now()

              databaseService.updateAnalysisQueue({
                id: item.id,
                status: 'pending',
                progress: 0,
                error: null
              })
            } catch (itemError) {
              logger.warn(LogCategory.ANALYSIS_QUEUE, '[分析队列] 重置单个项目状态失败:', item.id, itemError)
            }
          }
        }
      }

      this.isInitialized = true
      this.emitUpdate()

      logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 队列状态加载完成，当前队列长度:', this.queue.length)
    } catch (e) {
      logger.error(LogCategory.ANALYSIS_QUEUE, '[分析队列] 从数据库加载失败:', e)
      // 数据库加载失败时，初始化空队列
      this.queue = []
      this.isInitialized = true
      this.emitUpdate()
    }
  }

  /**
   * 添加项目到队列
   */
  addItems(inputs: EnqueueInput[], forceReanalyze = false): void {
    if (!this.isInitialized) {
      logger.warn(LogCategory.ANALYSIS_QUEUE, '[分析队列] 服务未初始化，无法添加项目')
      return
    }

    logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 添加项目到队列，输入数量:', inputs.length, 'forceReanalyze:', forceReanalyze)
    logger.info(LogCategory.ANALYSIS_QUEUE, '[DEBUG] Queue before addItems:', JSON.stringify(this.queue.map(i => ({ id: i.id, status: i.status }))))

    const now = Date.now()
    const existingByPath = new Map(this.queue.map(i => [i.path, i as any]))
    let addedCount = 0
    let updatedCount = 0

    // 使用事务确保数据一致性
    const transaction = databaseService.db?.transaction(() => {
      for (const file of inputs) {
        // 检查文件是否应该被忽略
        if (shouldIgnoreFile(file.path, file.name, this.ignoreRules)) {
          logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 文件被忽略规则过滤:', file.path)
          continue
        }

        const exists = existingByPath.get(file.path)
        if (exists) {
          if (forceReanalyze) {
            exists.status = 'pending'
            exists.error = undefined
            exists.updatedAt = now
            exists.progress = 0
            updatedCount++
            logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 更新现有项目状态为pending:', file.path)

            // 同步更新数据库
            databaseService.updateAnalysisQueue({
              id: exists.id,
              status: 'pending',
              progress: 0,
              error: null
            })
          }
          continue
        }

        const item: AnalysisQueueItem = {
          id: `${file.path}:${now}:${Math.random().toString(36).slice(2, 8)}`,
          path: file.path,
          name: file.name,
          size: file.size,
          type: file.type,
          status: 'pending',
          addedAt: now,
          updatedAt: now,
          progress: 0,
        }

        // 先添加到数据库
        databaseService.enqueueAnalysis({
          id: item.id,
          file_path: item.path,
          file_name: item.name,
          file_type: item.type,
          status: item.status,
          progress: 0
        })

        // 数据库操作成功后再添加到内存队列
        this.queue.push(item)
        addedCount++
        logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 添加新项目:', file.path, item.id)
      }
    })

    try {
      transaction?.()
      logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 批量操作完成，新增:', addedCount, '更新:', updatedCount)
    } catch (e) {
      logger.error(LogCategory.ANALYSIS_QUEUE, '[分析队列] 批量操作失败:', e)
      // 如果事务失败，回滚内存状态
      this.loadFromDB()
      return
    }

    this.persist()
    this.emitUpdate()

    // 如果有新增或更新的项目，唤醒队列处理器
    if ((addedCount > 0 || updatedCount > 0)) {
      logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 唤醒队列处理器以处理新项目')
      this.wakeUp()
    }
  }

  /**
   * 添加解析后的项目到队列
   */
  async addItemsResolved(inputs: EnqueueInput[], forceReanalyze = false): Promise<void> {
    logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 添加解析项目到队列，输入数量:', inputs.length, 'forceReanalyze:', forceReanalyze)
    const flat: EnqueueInput[] = []
    for (const it of inputs) {
      try {
        if (it.type === 'folder') {
          // 文件夹统一作为单个项目添加到队列
          // 在分析时会判断是否为最小单元，如果不是才展开第一层
          logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 添加文件夹项目:', it.path)
          flat.push({ ...it, type: 'folder', size: 0 })
        } else {
          flat.push(it)
        }
      } catch (e) {
        logger.error(LogCategory.ANALYSIS_QUEUE, `[分析队列] 解析项目失败 ${it.path}:`, e)
        flat.push(it)
      }
    }
    logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 解析完成，最终项目数量:', flat.length)
    this.addItems(flat as EnqueueInput[], forceReanalyze)
  }

  /**
   * 重试失败的项目
   */
  retryFailed(): void {
    if (!this.isInitialized) {
      logger.warn(LogCategory.ANALYSIS_QUEUE, '[分析队列] 服务未初始化，无法重试失败项目')
      return
    }

    logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 重试失败的项目')
    const now = Date.now()
    const failedItems = this.queue.filter(item => item.status === 'failed')

    if (failedItems.length === 0) {
      logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 没有失败的项目需要重试')
      return
    }

    // 使用事务确保数据一致性
    try {
      const transaction = databaseService.db?.transaction(() => {
        for (const item of failedItems) {
          item.status = 'pending'
          item.error = undefined
          item.updatedAt = now
          item.progress = 0

          // 同步更新数据库
          databaseService.updateAnalysisQueue({
            id: item.id,
            status: 'pending',
            progress: 0,
            error: null
          })
        }
      })

      transaction?.()
      logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 重试完成，共重试', failedItems.length, '个项目')
    } catch (e) {
      logger.error(LogCategory.ANALYSIS_QUEUE, '[分析队列] 批量重试失败:', e)
      // 如果批量操作失败，逐个重试
      let retryCount = 0
      for (const item of failedItems) {
        try {
          item.status = 'pending'
          item.error = undefined
          item.updatedAt = now
          item.progress = 0

          databaseService.updateAnalysisQueue({
            id: item.id,
            status: 'pending',
            progress: 0,
            error: null
          })
          retryCount++
        } catch (itemError) {
          logger.warn(LogCategory.ANALYSIS_QUEUE, '[分析队列] 重试单个项目失败:', item.id, itemError)
        }
      }
      logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 逐个重试完成，共重试', retryCount, '个项目')
    }

    this.persist()
    this.emitUpdate()

    // 如果有项目被重试，唤醒队列处理器
    if (failedItems.length > 0) {
      logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 唤醒队列处理器以处理重试项目')
      this.wakeUp()
    }
  }

  /**
   * 清理待处理项目
   */
  clearPending(): void {
    if (!this.isInitialized) {
      logger.warn(LogCategory.ANALYSIS_QUEUE, '[分析队列] 服务未初始化，无法清理队列')
      return
    }

    logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 开始清理待处理项目')
    logger.info(LogCategory.ANALYSIS_QUEUE, '[DEBUG] Queue before clear:', JSON.stringify(this.queue.map(i => ({ id: i.id, status: i.status }))))

    // 1. 记录要删除的项目ID，用于数据库清理
    const itemsToDelete = this.queue.filter(i => i.status !== 'completed').map(i => i.id)
    logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 将删除', itemsToDelete.length, '个未完成的项目')

    // 2. 更新内存中的队列，只保留已完成的
    this.queue = this.queue.filter(i => i.status === 'completed')

    // 3. 从数据库中删除所有未完成的任务
    try {
      // 使用事务确保数据一致性
      const transaction = databaseService.db?.transaction(() => {
        databaseService.clearNonCompletedAnalysis()
      })

      transaction?.()
      logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 数据库清理完成')
    } catch (e) {
      logger.error(LogCategory.ANALYSIS_QUEUE, '[分析队列] 数据库清理失败:', e)
      // 如果数据库清理失败，尝试逐个删除
      for (const id of itemsToDelete) {
        try {
          databaseService.deleteAnalysis(id)
        } catch (deleteError) {
          logger.warn(LogCategory.ANALYSIS_QUEUE, '[分析队列] 删除项目失败:', id, deleteError)
        }
      }
    }

    // 4. 持久化配置
    this.persist()

    // 5. 更新UI
    logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 清理完成')
    logger.info(LogCategory.ANALYSIS_QUEUE, '[DEBUG] Queue after clear:', JSON.stringify(this.queue.map(i => ({ id: i.id, status: i.status }))))
    this.emitUpdate()
  }

  /**
   * 删除单个项目
   */
  deleteItem(id: string): void {
    if (!this.isInitialized) {
      logger.warn(LogCategory.ANALYSIS_QUEUE, '[分析队列] 服务未初始化，无法删除项目')
      return
    }

    logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 删除项目:', id)

    // 1. 检查项目是否存在
    const itemIndex = this.queue.findIndex(i => i.id === id)
    if (itemIndex === -1) {
      logger.warn(LogCategory.ANALYSIS_QUEUE, '[分析队列] 项目不存在:', id)
      return
    }

    // 2. 使用事务确保数据一致性
    try {
      const transaction = databaseService.db?.transaction(() => {
        // 从数据库中删除
        databaseService.deleteAnalysis(id)
        // 从内存队列中移除
        this.queue.splice(itemIndex, 1)
      })

      transaction?.()
      logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 项目已删除:', id)
    } catch (e) {
      logger.error(LogCategory.ANALYSIS_QUEUE, '[分析队列] 删除项目失败:', id, e)
      return
    }

    // 3. 持久化和更新UI
    this.persist()
    this.emitUpdate()
  }

  /**
   * 获取队列快照
   */
  getSnapshot(currentItemId?: string): AnalysisQueueSnapshot {
    return {
      items: this.queue.slice(),
      running: false, // 由主服务设置
      currentItemId,
    }
  }

  /**
   * 获取队列统计
   */
  getQueueStatistics() {
    return {
      total: this.queue.length,
      pending: this.queue.filter(i => i.status === 'pending').length,
      analyzing: this.queue.filter(i => i.status === 'analyzing').length,
      completed: this.queue.filter(i => i.status === 'completed').length,
      failed: this.queue.filter(i => i.status === 'failed').length,
    }
  }

  /**
   * 同步内存队列到数据库
   */
  async syncMemoryToDatabase(): Promise<void> {
    try {
      logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 同步内存队列到数据库...')

      for (const item of this.queue) {
        try {
          // 检查数据库中是否存在该项目
          const dbItems = databaseService.getAnalysisQueue()
          const existsInDb = dbItems.some(dbItem => dbItem.id === item.id)

          if (!existsInDb) {
            // 如果数据库中不存在，则添加
            databaseService.enqueueAnalysis({
              id: item.id,
              file_path: item.path,
              file_name: item.name,
              file_type: item.type,
              status: item.status,
              progress: item.progress
            })
            logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 同步项目到数据库:', item.id)
          } else {
            // 如果存在，则更新状态
            databaseService.updateAnalysisQueue({
              id: item.id,
              status: item.status,
              progress: item.progress,
              error: item.error || null
            })
          }
        } catch (itemError) {
          logger.warn(LogCategory.ANALYSIS_QUEUE, '[分析队列] 同步单个项目失败:', item.id, itemError)
        }
      }

      logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 内存队列同步完成')
    } catch (e) {
      logger.error(LogCategory.ANALYSIS_QUEUE, '[分析队列] 同步内存队列到数据库失败:', e)
    }
  }

  /**
   * 验证队列状态一致性
   */
  async validateQueueConsistency(): Promise<void> {
    try {
      logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 验证队列状态一致性...')

      // 获取数据库中的所有项目
      const dbItems = databaseService.getAnalysisQueue()
      const dbItemsMap = new Map(dbItems.map(item => [item.id, item]))

      // 检查内存队列中的项目是否在数据库中存在
      const memoryItemsToRemove: string[] = []
      for (const memoryItem of this.queue) {
        const dbItem = dbItemsMap.get(memoryItem.id)
        if (!dbItem) {
          logger.warn(LogCategory.ANALYSIS_QUEUE, '[分析队列] 内存中的项目在数据库中不存在:', memoryItem.id)
          memoryItemsToRemove.push(memoryItem.id)
        } else if (dbItem.status !== memoryItem.status) {
          logger.warn(LogCategory.ANALYSIS_QUEUE, '[分析队列] 状态不一致:', memoryItem.id, '内存:', memoryItem.status, '数据库:', dbItem.status)
          // 以数据库状态为准
          memoryItem.status = dbItem.status as 'pending' | 'analyzing' | 'completed' | 'failed'
          memoryItem.progress = dbItem.progress || 0
          memoryItem.error = dbItem.error || undefined
        }
      }

      // 移除不存在的项目
      if (memoryItemsToRemove.length > 0) {
        this.queue = this.queue.filter(item => !memoryItemsToRemove.includes(item.id))
        logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 移除了', memoryItemsToRemove.length, '个不一致的项目')
      }

      // 检查数据库中是否有内存队列中没有的项目
      const memoryItemsMap = new Map(this.queue.map(item => [item.id, item]))
      for (const dbItem of dbItems) {
        if (!memoryItemsMap.has(dbItem.id) && dbItem.status !== 'completed') {
          logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 从数据库恢复遗漏的项目:', dbItem.id)
          const restoredItem: AnalysisQueueItem = {
            id: dbItem.id,
            path: dbItem.file_path,
            name: dbItem.file_name,
            size: 0,
            type: dbItem.file_type,
            status: dbItem.status as 'pending' | 'analyzing' | 'completed' | 'failed',
            error: dbItem.error || undefined,
            addedAt: Date.now(),
            updatedAt: Date.now(),
            progress: dbItem.progress || 0,
          }
          this.queue.push(restoredItem)
        }
      }

      logger.info(LogCategory.ANALYSIS_QUEUE, '[分析队列] 队列状态一致性验证完成，当前队列长度:', this.queue.length)
    } catch (e) {
      logger.error(LogCategory.ANALYSIS_QUEUE, '[分析队列] 队列状态一致性验证失败:', e)
    }
  }

  /**
   * 获取队列引用(用于主服务直接访问)
   */
  getQueue(): AnalysisQueueItem[] {
    return this.queue
  }

  /**
   * 获取初始化状态
   */
  getIsInitialized(): boolean {
    return this.isInitialized
  }

  /**
   * 触发更新回调
   */
  private emitUpdate(): void {
    this.onUpdate?.()
  }

  /**
   * 触发持久化回调
   */
  private persist(): void {
    this.onPersist?.()
  }

  /**
   * 触发唤醒回调
   */
  private wakeUp(): void {
    this.onWakeUp?.()
  }
}
