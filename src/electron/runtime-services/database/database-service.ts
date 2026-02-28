import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'
import type { WorkspaceDirectory, FileInfo, ArchiveFileInfo, AIClassificationResult, LanguageCode } from '@yonuc/types'
import type { Unit, UnitCreationData } from '@yonuc/types'
import { migrations, getDatabaseConfig } from './database'
import { logger, LogCategory } from '@yonuc/shared'

/**
 * 数据库服务
 * 负责 SQLite 数据库的初始化、迁移和 CRUD 操作
 */
export class DatabaseService {
  private _db: Database.Database | null = null
  private dbPath: string

  /**
   * 获取数据库实例
   */
  get db(): Database.Database | null {
    return this._db
  }

  /**
   * 构造函数
   * @param dbPath 数据库文件路径
   */
  constructor(dbPath: string) {
    this.dbPath = dbPath
  }

  /**
   * 初始化数据库并执行迁移
   * @param language 语言代码，用于隔离数据库
   */
  async initialize(language?: string): Promise<void> {
    try {
      if (language) {
        const config = getDatabaseConfig(language)
        this.dbPath = config.path
      }

      if (this._db) {
        try {
          this._db.close()
        } catch (e) {
          logger.warn(LogCategory.DATABASE_SERVICE, '关闭旧数据库连接失败', { error: e })
        }
        this._db = null
      }

      const dir = path.dirname(this.dbPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      this._db = new Database(this.dbPath)
      logger.info(LogCategory.DATABASE_SERVICE, '数据库连接成功', { dbPath: this.dbPath })
      await this.createTables()
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, '数据库初始化失败', { error, dbPath: this.dbPath })
      throw error
    }
  }

  /**
   * 创建数据表
   */
  private async createTables(): Promise<void> {
    if (!this._db) throw new Error('数据库未初始化')
    try {
      const migration = migrations[0]
      if (migration) {
        this._db.exec(migration.up)
        logger.info(LogCategory.DATABASE_SERVICE, '数据表创建成功')
      }
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, '创建数据表失败', { error })
      throw error
    }
  }

  /**
   * 计算文件路径哈希 (用于唯一标识文件记录)
   */
  private calculatePathHash(filePath: string): string {
    const normalizedPath = path.resolve(filePath).toLowerCase()
    return crypto.createHash('sha256').update(normalizedPath).digest('hex')
  }

  /**
   * 计算文件内容哈希 (SHA256)
   */
  async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath)
      stream.on('error', err => {
        // 如果文件不可读（比如 0 字节或锁定），返回空内容的哈希
        if ((err as any).code === 'EISDIR') {
          resolve('directory-hash')
        } else {
          resolve('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') // SHA256 for empty
        }
      })
      stream.on('data', chunk => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
    })
  }

  /**
   * 添加文件，ID 为内容哈希
   */
  async addFile(file: FileInfo): Promise<string> {
    if (!this._db) throw new Error('数据库未初始化')
    try {
      const fileHash = await this.calculateFileHash(file.path)

      const dirPath = path.dirname(file.path)
      const workspaceId = await this.ensureWorkspaceId(dirPath, path.basename(dirPath))

      const sql = `INSERT OR REPLACE INTO files 
        (id, path, name, size, type, mime_type, created_at, modified_at, accessed_at, updated_at, workspace_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

      this._db.prepare(sql).run(
        fileHash,
        file.path,
        file.name,
        file.size,
        file.extension,
        file.mimeType || 'application/octet-stream',
        file.createdAt.toISOString(),
        file.modifiedAt.toISOString(),
        file.modifiedAt.toISOString(),
        new Date().toISOString(),
        workspaceId
      )
      logger.info(LogCategory.DATABASE_SERVICE, '文件已添加到数据库', { filePath: normalizedPath, fileHash })
      return fileHash
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, '添加文件失败', { error, filePath: file.path })
      throw error
    }
  }

  // addArchiveFile 已废弃
  async addArchiveFile(archive: ArchiveFileInfo): Promise<void> {
    logger.warn(LogCategory.DATABASE_SERVICE, 'addArchiveFile 已废弃')
  }

  // addClassification 已废弃
  async addClassification(classification: AIClassificationResult & { fileId: string; timestamp: Date }): Promise<void> {
    logger.warn(LogCategory.DATABASE_SERVICE, 'addClassification 已废弃')
  }

  /**
   * 添加工作目录
   */
  async addWorkspaceDirectory(directory: WorkspaceDirectory): Promise<void> {
    if (!this._db) throw new Error('数据库未初始化')
    try {
      const sql = `INSERT OR REPLACE INTO workspace_directories 
        (path, name, type, recursive, is_active, last_scan_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      this._db.prepare(sql).run(
        directory.path,
        directory.name,
        directory.type || 'SPEEDY',
        directory.recursive ? 1 : 0,
        directory.isActive ? 1 : 0,
        directory.lastScanAt?.toISOString() || null
      )
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, '添加工作目录失败', { error, directoryPath: directory.path })
      throw error
    }
  }

  /**
   * 获取所有工作目录
   */
  async getAllWorkspaceDirectories(): Promise<WorkspaceDirectory[]> {
    if (!this._db) throw new Error('数据库未初始化')
    const rows = this._db.prepare('SELECT * FROM workspace_directories WHERE recursive = 1 ORDER BY created_at DESC').all() as any[]
    return rows.map(row => ({
      id: row.id,
      path: row.path,
      name: row.name,
      type: row.type as 'SPEEDY' | 'PRIVATE',
      recursive: Boolean(row.recursive),
      isActive: Boolean(row.is_active),
      autoWatch: Boolean(row.auto_watch),
      lastScanAt: row.last_scan_at ? new Date(row.last_scan_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }))
  }

  async getCurrentWorkspaceDirectory(): Promise<WorkspaceDirectory | null> {
    if (!this._db) throw new Error('数据库未初始化')
    const row = this._db.prepare('SELECT * FROM workspace_directories WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1').get() as any
    if (!row) return null
    return {
      path: row.path,
      name: row.name,
      type: row.type as 'SPEEDY' | 'PRIVATE',
      recursive: Boolean(row.recursive),
      isActive: Boolean(row.is_active),
      lastScanAt: row.last_scan_at ? new Date(row.last_scan_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  /**
   * 设置当前激活的工作目录
   */
  async setCurrentWorkspaceDirectory(path: string): Promise<void> {
    if (!this._db) throw new Error('数据库未初始化')
    this._db.prepare('UPDATE workspace_directories SET is_active = 0').run()
    this._db.prepare('UPDATE workspace_directories SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE path = ?').run(path)
  }

  /**
   * 删除工作目录
   */
  async deleteWorkspaceDirectory(path: string): Promise<void> {
    if (!this._db) throw new Error('数据库未初始化')
    this._db.prepare('DELETE FROM workspace_directories WHERE path = ?').run(path)
  }

  async updateWorkspaceDirectoryAutoWatch(workspaceId: number, autoWatch: boolean): Promise<void> {
    if (!this._db) throw new Error('数据库未初始化')
    this._db.prepare('UPDATE workspace_directories SET auto_watch = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(autoWatch ? 1 : 0, workspaceId)
  }

  /**
   * 获取所有文件信息
   */
  async getAllFiles(): Promise<FileInfo[]> {
    if (!this._db) throw new Error('数据库未初始化')
    const rows = this._db.prepare('SELECT * FROM files ORDER BY modified_at DESC').all() as any[]
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      path: row.path,
      size: row.size,
      type: row.type,
      extension: row.type,
      mimeType: row.mime_type,
      createdAt: new Date(row.created_at),
      modifiedAt: new Date(row.modified_at)
    }))
  }

  /**
   * 检查数据库连接
   */
  async isConnected(): Promise<boolean> {
    return this._db !== null
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this._db) {
      this._db.close()
      this._db = null
    }
  }

  /**
   * 获取分析队列任务
   */
  getAnalysisQueue(): any[] {
    if (!this._db) throw new Error('数据库未初始化')
    return this._db.prepare(`SELECT * FROM analysis_queue WHERE status IN ('pending','analyzing','failed') ORDER BY created_at ASC`).all() as any[]
  }

  /**
   * 任务入队
   */
  enqueueAnalysis(item: { id: string; file_path: string; file_name: string; file_type: string; status: string; progress?: number }): void {
    if (!this._db) throw new Error('数据库未初始化')
    this._db.prepare(`INSERT OR IGNORE INTO analysis_queue (id, file_path, file_name, file_type, status, progress) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(item.id, item.file_path, item.file_name, item.file_type, item.status, item.progress ?? 0)
  }

  /**
   * 更新任务状态
   */
  updateAnalysisQueue(item: { id: string; status?: string; progress?: number; error?: string | null; result?: string | null }): void {
    if (!this._db) throw new Error('数据库未初始化')
    const row = this._db.prepare('SELECT id FROM analysis_queue WHERE id = ?').get(item.id) as any
    if (!row) return
    const updates = {
      status: item.status,
      progress: item.progress,
      error: item.error,
      result: item.result,
    }
    this._db.prepare(`UPDATE analysis_queue SET 
      status = COALESCE(?, status),
      progress = COALESCE(?, progress),
      error = COALESCE(?, error),
      result = COALESCE(?, result),
      updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(updates.status, updates.progress, updates.error, updates.result, item.id)
  }

  /**
   * 清理非完成任务
   */
  clearNonCompletedAnalysis(): void {
    if (!this._db) throw new Error('数据库未初始化')
    this._db.prepare(`DELETE FROM analysis_queue WHERE status NOT IN ('completed')`).run()
  }

  clearPendingAnalysis(): void {
    if (!this._db) throw new Error('数据库未初始化')
    this._db.prepare(`DELETE FROM analysis_queue WHERE status = 'pending'`).run()
  }

  /**
   * 重试失败任务
   */
  retryFailedAnalysis(): void {
    if (!this._db) throw new Error('数据库未初始化')
    this._db.prepare(`UPDATE analysis_queue SET status = 'pending', retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP WHERE status = 'failed'`).run()
  }

  /**
   * 删除指定分析记录
   */
  deleteAnalysis(id: string): void {
    if (!this._db) throw new Error('数据库未初始化')
    this._db.prepare(`DELETE FROM analysis_queue WHERE id = ?`).run(id)
  }

  // ===== 最小单元（file_units）CRUD =====
  async createUnit(data: UnitCreationData): Promise<Unit> {
    if (!this._db) throw new Error('数据库未初始化')
    const stmt = this._db.prepare(`INSERT INTO file_units (
      name, description, type, path, grouping_reason, grouping_confidence, author, title, tags, quality_score, parent_unit_id, workspace_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
    const result = stmt.run(
      data.name,
      data.description ?? null,
      data.type,
      data.path ?? null,
      data.groupingReason ?? null,
      data.groupingConfidence ?? null,
      data.author ?? null,
      data.title ?? null,
      data.tags ? JSON.stringify(data.tags) : null,
      data.qualityScore ?? null,
      data.parentUnitId ?? null,
      data.workspaceId
    )
    return this.getUnit(Number(result.lastInsertRowid))
  }

  async getUnit(id: number): Promise<Unit> {
    if (!this._db) throw new Error('数据库未初始化')
    const row = this._db.prepare('SELECT * FROM file_units WHERE id = ?').get(id) as any
    if (!row) throw new Error('Unit not found')
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      type: row.type,
      path: row.path ?? undefined,
      groupingReason: row.grouping_reason ?? undefined,
      groupingConfidence: row.grouping_confidence ?? undefined,
      author: row.author ?? undefined,
      title: row.title ?? undefined,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      qualityScore: row.quality_score ?? undefined,
      parentUnitId: row.parent_unit_id ?? undefined,
      isAnalyzed: Boolean(row.is_analyzed),
      analyzedAt: row.analyzed_at ?? undefined,
      analysisError: row.analysis_error ?? undefined,
      workspaceId: row.workspace_id,
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
    }
  }

  async updateUnit(id: number, partial: Partial<Unit>): Promise<Unit> {
    if (!this._db) throw new Error('数据库未初始化')
    const row = this._db.prepare('SELECT * FROM file_units WHERE id = ?').get(id) as any
    if (!row) throw new Error('Unit not found')

    const updated = {
      name: partial.name ?? row.name,
      description: partial.description ?? row.description,
      type: partial.type ?? row.type,
      path: partial.path ?? row.path,
      grouping_reason: partial.groupingReason ?? row.grouping_reason,
      grouping_confidence: partial.groupingConfidence ?? row.grouping_confidence,
      author: partial.author ?? row.author,
      title: partial.title ?? row.title,
      tags: partial.tags ? JSON.stringify(partial.tags) : row.tags,
      quality_score: partial.qualityScore ?? row.quality_score,
      parent_unit_id: partial.parentUnitId ?? row.parent_unit_id,
      is_analyzed: partial.isAnalyzed !== undefined ? (partial.isAnalyzed ? 1 : 0) : row.is_analyzed,
      analyzed_at: partial.analyzedAt ?? row.analyzed_at,
      analysis_error: partial.analysisError ?? row.analysis_error,
    }

    this._db.prepare(`UPDATE file_units SET
      name = ?, description = ?, type = ?, path = ?, grouping_reason = ?, grouping_confidence = ?, author = ?, title = ?, tags = ?, quality_score = ?, parent_unit_id = ?, is_analyzed = ?, analyzed_at = ?, analysis_error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(
      updated.name, updated.description, updated.type, updated.path, updated.grouping_reason, updated.grouping_confidence, updated.author, updated.title, updated.tags, updated.quality_score, updated.parent_unit_id, updated.is_analyzed, updated.analyzed_at, updated.analysis_error, id
    )

    return this.getUnit(id)
  }

  async deleteUnit(id: number): Promise<void> {
    if (!this._db) throw new Error('数据库未初始化')
    this._db.prepare('DELETE FROM file_units WHERE id = ?').run(id)
  }

  async getUnitsForFile(fileId: string): Promise<Unit[]> {
    if (!this._db) throw new Error('数据库未初始化')
    const rows = this._db.prepare(`
      SELECT u.* FROM file_units u
      JOIN file_unit_relations r ON r.unit_id = u.id
      WHERE r.file_id = ?
    `).all(fileId) as any[]
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      type: row.type,
      path: row.path ?? undefined,
      groupingReason: row.grouping_reason ?? undefined,
      groupingConfidence: row.grouping_confidence ?? undefined,
      author: row.author ?? undefined,
      title: row.title ?? undefined,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      qualityScore: row.quality_score ?? undefined,
      parentUnitId: row.parent_unit_id ?? undefined,
      isAnalyzed: Boolean(row.is_analyzed),
      analyzedAt: row.analyzed_at ?? undefined,
      analysisError: row.analysis_error ?? undefined,
      workspaceId: row.workspace_id,
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
    }))
  }

  async createFileUnitRelation(fileId: string, unitId: number): Promise<void> {
    if (!this._db) throw new Error('数据库未初始化')
    this._db.prepare('INSERT OR IGNORE INTO file_unit_relations (file_id, unit_id) VALUES (?, ?)').run(fileId, unitId)
  }

  async getUnitsForPath(filePath: string): Promise<Unit[]> {
    if (!this._db) throw new Error('数据库未初始化')
    const fileRow = this._db.prepare('SELECT id FROM files WHERE path = ?').get(filePath) as any
    if (fileRow?.id) {
      return this.getUnitsForFile(fileRow.id)
    }
    const dirPath = path.dirname(filePath)
    const rows = this._db.prepare('SELECT * FROM file_units WHERE path = ?').all(dirPath) as any[]
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      type: row.type,
      path: row.path ?? undefined,
      groupingReason: row.grouping_reason ?? undefined,
      groupingConfidence: row.grouping_confidence ?? undefined,
      author: row.author ?? undefined,
      title: row.title ?? undefined,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      qualityScore: row.quality_score ?? undefined,
      parentUnitId: row.parent_unit_id ?? undefined,
      isAnalyzed: Boolean(row.is_analyzed),
      analyzedAt: row.analyzed_at ?? undefined,
      analysisError: row.analysis_error ?? undefined,
      workspaceId: row.workspace_id,
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
    }))
  }

  async getWorkspaceIdByPath(dirPath: string): Promise<number | null> {
    if (!this._db) throw new Error('数据库未初始化')
    const row = this._db.prepare('SELECT id FROM workspace_directories WHERE path = ?').get(dirPath) as any
    return row?.id ?? null
  }

  async ensureWorkspaceId(dirPath: string, name: string): Promise<number> {
    if (!this._db) throw new Error('数据库未初始化')
    const id = await this.getWorkspaceIdByPath(dirPath)
    if (id) return id
    this._db.prepare(`INSERT INTO workspace_directories (path, name, type, recursive, is_active, last_scan_at, created_at, updated_at)
      VALUES (?, ?, 'SPEEDY', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(dirPath, name)
    const row = this._db.prepare('SELECT id FROM workspace_directories WHERE path = ?').get(dirPath) as { id: number }
    return row.id
  }

  /**
   * 获取文件的AI分析结果
   * 已根据精简 Schema 更新：移除 fd.name, ft.confidence, ft.is_ai_generated, ftr.source 等
   */
  async getFileAnalysisResult(filePath: string): Promise<any> {
    if (!this._db) throw new Error('数据库未初始化')

    try {
      
      // 1. 获取文件基本信息（直接使用原生路径）
      const fileStmt = this._db.prepare(`
        SELECT 
          id, path, name, smart_name, size, type, mime_type,
          created_at, modified_at, accessed_at,
          description, content, multimodal_content, quality_score, quality_confidence, quality_reasoning, quality_criteria,
          grouping_reason, grouping_confidence,
          author, is_analyzed, last_analyzed_at, metadata
        FROM files 
        WHERE path = ?
      `)
      const file = fileStmt.get(filePath) as any

      // 2. 获取文件的维度标签 (fd.id 即是维度名称)
      const tagsStmt = this._db.prepare(`
        SELECT 
          ft.id, ft.name, ft.dimension_id
        FROM file_tag_relations ftr
        JOIN file_tags ft ON ft.id = ftr.tag_id
        WHERE ftr.file_id = ?
      `)
      const tags = tagsStmt.all(file.id) as any[]

      // 3. 按维度分组标签
      const dimensionTags: { [dimensionId: string]: any[] } = {}

      tags.forEach(tag => {
        const dimId = tag.dimension_id
        if (!dimensionTags[dimId]) {
          dimensionTags[dimId] = []
        }
        dimensionTags[dimId].push({
          id: tag.id,
          name: tag.name
        })
      })

      // 4. 获取维度列表以进行排序 (按 Level)
      const dimensionsStmt = this._db.prepare(`
        SELECT id, level, description
        FROM file_dimensions
        ORDER BY level ASC
      `)
      const dimensions = dimensionsStmt.all() as any[]

      // 5. 构建排序后的维度标签组
      const sortedDimensionTags: Array<{ dimension: string; level: number; tags: any[] }> = []

      // 首先添加已定义的维度标签
      dimensions.forEach(dim => {
        if (dimensionTags[dim.id]) {
          sortedDimensionTags.push({
            dimension: dim.id,
            level: dim.level,
            tags: dimensionTags[dim.id]
          })
          // 标记已处理
          delete dimensionTags[dim.id]
        }
      })

      // 处理那些在 file_dimensions 中没找到定义的“野”标签（比如同步产生的多语言残留）
      Object.entries(dimensionTags).forEach(([dimId, tags]) => {
        sortedDimensionTags.push({
          dimension: dimId,
          level: 3, // 默认归为最低层级
          tags: tags
        })
      })

      return {
        id: file.id,
        path: file.path,
        name: file.name,
        smartName: file.smart_name,
        size: file.size,
        type: file.type,
        mimeType: file.mime_type,
        createdAt: file.created_at,
        modifiedAt: file.modified_at,
        accessedAt: file.accessed_at,
        description: file.description,
        content: file.content,
        multimodalContent: file.multimodal_content,
        qualityScore: file.quality_score,
        qualityConfidence: file.quality_confidence,
        qualityReasoning: file.quality_reasoning,
        qualityCriteria: file.quality_criteria ? JSON.parse(file.quality_criteria) : undefined,
        author: file.author,
        isAnalyzed: Boolean(file.is_analyzed),
        lastAnalyzedAt: file.last_analyzed_at,
        dimensionTags: sortedDimensionTags,
        groupingReason: file.grouping_reason,
        groupingConfidence: file.grouping_confidence,
        metadata: file.metadata ? JSON.parse(file.metadata) : undefined
      }
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, '获取文件分析结果失败', { error, filePath })
      throw error
    }
  }

  /**
   * 获取目录分析统计
   */
  async getDirectoryAnalysisResult(dirPath: string): Promise<any> {
    if (!this._db) throw new Error('数据库未初始化')
    try {
      // 添加调试日志
      logger.info(LogCategory.DATABASE_SERVICE, '查询目录分析结果', { 
        dirPath 
      })
      
      // 直接使用原生路径进行匹配
      const stmt = this._db.prepare(`
        SELECT 
          id, path, name, context_analysis, last_scan_at,
          created_at, updated_at
        FROM workspace_directories
        WHERE path = ?
      `)
      const dir = stmt.get(dirPath) as any
      
      if (!dir) {
        logger.warn(LogCategory.DATABASE_SERVICE, '未找到目录分析结果', { dirPath })
        return null
      }
      
      logger.info(LogCategory.DATABASE_SERVICE, '找到目录分析结果', { 
        dirId: dir.id, 
        dirPath: dir.path 
      })

      let contextAnalysis = null
      if (dir.context_analysis) {
        try {
          contextAnalysis = JSON.parse(dir.context_analysis)
        } catch (e) {
          logger.warn(LogCategory.DATABASE_SERVICE, '解析目录上下文分析失败', { error: e, dirPath })
        }
      }
      const countStmt = this._db.prepare(`SELECT COUNT(*) as count FROM files WHERE workspace_id = ?`)
      const countResult = countStmt.get(dir.id) as { count: number }
      const analyzedCountStmt = this._db.prepare(`SELECT COUNT(*) as count FROM files WHERE workspace_id = ? AND is_analyzed = 1`)
      const analyzedCountResult = analyzedCountStmt.get(dir.id) as { count: number }

      return {
        id: dir.id,
        path: dir.path,
        name: dir.name,
        contextAnalysis: contextAnalysis,
        lastScanAt: dir.last_scan_at,
        createdAt: dir.created_at,
        updatedAt: dir.updated_at,
        fileCount: countResult.count,
        analyzedFileCount: analyzedCountResult.count
      }
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, '获取目录分析结果失败', { error, dirPath })
      throw error
    }
  }

  /**
   * 根据ID获取工作目录
   */
  async getWorkspaceDirectoryById(workspaceId: number): Promise<WorkspaceDirectory | null> {
    if (!this._db) throw new Error('数据库未初始化')
    const row = this._db.prepare('SELECT * FROM workspace_directories WHERE id = ?').get(workspaceId) as any
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      type: row.type as 'SPEEDY' | 'PRIVATE',
      recursive: row.recursive === 1,
      isActive: row.is_active === 1,
      lastScanAt: row.last_scan_at ? new Date(row.last_scan_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  /**
   * 重置单个文件的分析数据
   */
  async resetFileAnalysis(fileId: string): Promise<void> {
    if (!this._db) throw new Error('数据库未初始化')
    try {
      const transaction = this._db.transaction(() => {
        this._db!.prepare(`
          UPDATE files
          SET is_analyzed = 0,
              last_analyzed_at = NULL,
              quality_score = NULL,
              quality_confidence = NULL,
              quality_reasoning = NULL,
              quality_criteria = NULL,
              description = NULL,
              smart_name = name,
              author = NULL,
              language = NULL,
              multimodal_content = NULL,
              grouping_reason = 'collection',
              grouping_confidence = 0.5,
              sync_status = 0
          WHERE id = ?
        `).run(fileId)

        this._db!.prepare('DELETE FROM file_tag_relations WHERE file_id = ?').run(fileId)
      })
      transaction()
      logger.info(LogCategory.DATABASE_SERVICE, '文件分析数据已重置', { fileId })
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, '重置文件分析数据失败', { error, fileId })
      throw error
    }
  }

  /**
   * 重置目录分析数据
   */
  async resetWorkspaceDirectoryAnalysis(directoryPath: string): Promise<void> {
    if (!this._db) throw new Error('数据库未初始化')
    try {
      const transaction = this._db.transaction(() => {
        this._db!.prepare(`
          UPDATE files
          SET is_analyzed = 0,
              last_analyzed_at = NULL,
              quality_score = NULL,
              description = NULL
          WHERE path LIKE ?
        `).run(`${directoryPath}%`)

        this._db!.prepare(`
          DELETE FROM file_tag_relations
          WHERE file_id IN (
            SELECT id FROM files WHERE path LIKE ?
          )
        `).run(`${directoryPath}%`)
      })
      transaction()
      logger.info(LogCategory.DATABASE_SERVICE, '工作目录分析数据已重置', { directoryPath })
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, '重置工作目录分析数据失败', { error, directoryPath })
      throw error
    }
  }

  /**
   * 查找文件根工作目录
   */
  async findRootWorkspaceDirectory(filePath: string): Promise<WorkspaceDirectory | null> {
    if (!this._db) throw new Error('数据库未初始化')
    try {
      const roots = await this.getAllWorkspaceDirectories()
      const normalizedFilePath = filePath.replace(/\\/g, '/').toLowerCase()
      let bestMatch: WorkspaceDirectory | null = null
      let maxLen = 0
      for (const root of roots) {
        const normalizedRootPath = root.path.replace(/\\/g, '/').toLowerCase()
        if (normalizedFilePath.startsWith(normalizedRootPath)) {
          const relative = path.relative(normalizedRootPath, normalizedFilePath)
          if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
            if (root.path.length > maxLen) {
              maxLen = root.path.length
              bestMatch = root
            }
          }
        }
      }
      return bestMatch
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, '查找根工作目录失败', { error, filePath })
      return null
    }
  }

  /**
   * 更新扫描时间
   */
  async updateWorkspaceDirectoryLastScan(workspaceId: number): Promise<void> {
    if (!this._db) throw new Error('数据库未初始化')
    this._db.prepare(`UPDATE workspace_directories SET last_scan_at = ?, updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), new Date().toISOString(), workspaceId)
  }

  async getFilesByWorkspaceId(workspaceId: number): Promise<Array<{ id: string; path: string; name: string; modifiedAt: Date }>> {
    if (!this._db) throw new Error('数据库未初始化')
    const rows = this._db.prepare(`SELECT id, path, name, modified_at FROM files WHERE workspace_id = ?`).all(workspaceId) as any[]
    return rows.map(row => ({
      id: row.id,
      path: row.path,
      name: row.name,
      modifiedAt: new Date(row.modified_at)
    }))
  }

  /**
   * 获取指定目录下的所有文件记录
   */
  async getFilesByParentPath(parentPath: string, workspaceId: number): Promise<Array<{ id: string; path: string; name: string; size: number; modifiedAt: Date }>> {
    if (!this._db) throw new Error('数据库未初始化')
    // 统一路径分隔符进行匹配
    const normalizedParent = parentPath.replace(/\\/g, '/')

    // 使用 LIKE 进行前缀过滤，提高效率
    const pattern = normalizedParent.endsWith('/') ? `${normalizedParent}%` : `${normalizedParent}/%`
    const rows = this._db.prepare(`SELECT id, path, name, size, modified_at FROM files WHERE workspace_id = ? AND REPLACE(path, '\\', '/') LIKE ?`).all(workspaceId, pattern) as any[]

    return rows.filter(row => {
      const rowDir = path.dirname(row.path).replace(/\\/g, '/')
      return rowDir === normalizedParent
    }).map(row => ({
      ...row,
      modifiedAt: new Date(row.modified_at)
    }))
  }

  /**
   * 根据内容哈希获取任何已分析的文件记录 (用于本地缓存重用)
   */
  async getAnalyzedFileByContentHash(contentHash: string): Promise<any> {
    if (!this._db) throw new Error('数据库未初始化')
    try {
      // 优先找最新分析的
      const row = this._db.prepare(`
        SELECT * FROM files 
        WHERE content_hash = ? AND is_analyzed = 1 
        ORDER BY last_analyzed_at DESC 
        LIMIT 1
      `).get(contentHash) as any
      if (!row) return null
      return {
        id: row.id,
        name: row.name,
        path: row.path,
        smartName: row.smart_name,
        contentHash: row.content_hash,
        size: row.size,
        extension: row.type,
        mimeType: row.mime_type,
        isAnalyzed: row.is_analyzed === 1,
        qualityScore: row.quality_score,
        qualityConfidence: row.quality_confidence,
        qualityReasoning: row.quality_reasoning,
        qualityCriteria: row.quality_criteria,
        description: row.description,
        multimodalContent: row.multimodal_content,
        groupingReason: row.grouping_reason,
        groupingConfidence: row.grouping_confidence,
        author: row.author,
        language: row.language,
        metadata: row.metadata
      }
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, '根据内容哈希获取分析文件失败', { error, contentHash })
      return null
    }
  }

  /**
   * 获取文件关联的所有标签
   */
  async getFileTagsByFileId(fileId: string): Promise<any[]> {
    if (!this._db) throw new Error('数据库未初始化')
    try {
      return this._db.prepare(`
        SELECT ft.id, ft.name, ft.dimension_id
        FROM file_tag_relations ftr
        JOIN file_tags ft ON ftr.tag_id = ft.id
        WHERE ftr.file_id = ?
      `).all(fileId) as any[]
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, '获取文件标签失败', { error, fileId })
      return []
    }
  }

  async getFileByPath(filePath: string): Promise<any> {
    if (!this._db) throw new Error('数据库未初始化')
    try {
      // 添加调试日志
      logger.info(LogCategory.DATABASE_SERVICE, '根据路径查询文件', { 
        filePath 
      })
      
      // 直接使用原生路径进行匹配
      const row = this._db.prepare(`
        SELECT * FROM files 
        WHERE path = ?
      `).get(filePath) as any
      
      if (!row) {
        logger.warn(LogCategory.DATABASE_SERVICE, '未找到文件', { filePath })
        return null
      }
      
      logger.info(LogCategory.DATABASE_SERVICE, '找到文件', { 
        fileId: row.id, 
        filePath: row.path 
      })
      
      return {
        id: row.id,
        name: row.name,
        path: row.path,
        contentHash: row.content_hash, // 添加内容哈希
        parentPath: path.dirname(row.path),
        size: row.size,
        extension: row.type,
        mimeType: row.mime_type,
        createdAt: new Date(row.created_at),
        modifiedAt: new Date(row.modified_at),
        isSelected: false,
        isAnalyzed: row.is_analyzed === 1,
        lastAnalyzedAt: row.last_analyzed_at ? new Date(row.last_analyzed_at) : undefined,
        qualityScore: row.quality_score,
        description: row.description
      }
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, '根据路径获取文件失败', { error, filePath })
      throw error
    }
  }

  /**
   * 从物理路径添加文件记录
   */
  async addFileFromPath(filePath: string, rootPath: string): Promise<string> {
    if (!this._db) throw new Error('数据库未初始化')
    try {
      const stats = fs.statSync(filePath)
      const contentHash = await this.calculateFileHash(filePath)
      const fileId = this.calculatePathHash(filePath)
      const dirPath = path.dirname(filePath)
      const workspaceId = await this.ensureWorkspaceId(dirPath, path.basename(dirPath))

      // 检查文件是否已存在且已分析
      const existingFile = this._db.prepare(`
        SELECT is_analyzed, smart_name, description, quality_score, last_analyzed_at 
        FROM files 
        WHERE id = ?
      `).get(fileId) as { 
        is_analyzed: number
        smart_name: string | null
        description: string | null
        quality_score: number | null
        last_analyzed_at: string | null
      } | undefined

      // 如果文件已存在且已分析，使用UPDATE而不是REPLACE，以保留分析结果
      if (existingFile && existingFile.is_analyzed === 1) {
        this._db.prepare(`
          UPDATE files 
          SET content_hash = ?, size = ?, modified_at = ?, accessed_at = ?, updated_at = ?
          WHERE id = ?
        `).run(
          contentHash,
          stats.size,
          stats.mtime.toISOString(),
          stats.atime.toISOString(),
          new Date().toISOString(),
          fileId
        )
        
        logger.info(LogCategory.DATABASE_SERVICE, '更新已分析文件的基本信息', { 
          filePath, 
          fileId,
          isAnalyzed: 1 
        })
      } else {
        // 文件不存在或未分析，使用INSERT OR REPLACE
        this._db.prepare(`INSERT OR REPLACE INTO files 
          (id, content_hash, path, name, size, type, mime_type, created_at, modified_at, accessed_at, updated_at, workspace_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          fileId,
          contentHash,
          filePath,
          path.basename(filePath),
          stats.size,
          path.extname(filePath).toLowerCase(),
          'application/octet-stream',
          stats.birthtime.toISOString(),
          stats.mtime.toISOString(),
          stats.atime.toISOString(),
          new Date().toISOString(),
          workspaceId
        )
        
        logger.info(LogCategory.DATABASE_SERVICE, '文件已添加到数据库', { 
          filePath, 
          fileId,
          isNew: !existingFile 
        })
      }
      
      return fileId
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, '从路径添加文件失败', { error, filePath })
      throw error
    }
  }

  /**
   * 更新修改时间和大小
   */
  async updateFileMetadata(filePath: string, stats: fs.Stats): Promise<void> {
    if (!this._db) throw new Error('数据库未初始化')
    this._db.prepare(`UPDATE files SET size = ?, modified_at = ?, updated_at = ? WHERE path = ?`)
      .run(stats.size, stats.mtime.toISOString(), new Date().toISOString(), filePath)
  }

  /**
   * 更新修改时间 (保留旧版 API 兼容性)
   */
  async updateFileModifiedTime(filePath: string, modifiedAt: Date): Promise<void> {
    if (!this._db) throw new Error('数据库未初始化')
    const stats = fs.statSync(filePath)
    await this.updateFileMetadata(filePath, stats)
  }

  /**
   * 全面重置分析数据
   * 已同步移除 file_tag_analysis
   */
  async resetAllAnalysisData(): Promise<void> {
    if (!this._db) throw new Error('数据库未初始化')
    try {
      const transaction = this._db.transaction(() => {
        this._db!.prepare(`
          UPDATE files
          SET is_analyzed = 0,
              last_analyzed_at = NULL,
              quality_score = NULL,
              description = NULL
        `).run()

        this._db!.prepare('DELETE FROM file_tag_relations').run()
        this._db!.prepare('DELETE FROM file_tags').run()
        this._db!.prepare('DELETE FROM tag_expansions').run()
        this._db!.prepare('DELETE FROM dimension_expansions').run()
        this._db!.prepare('DELETE FROM file_dimensions').run()
      })
      transaction()
      logger.info(LogCategory.DATABASE_SERVICE, '所有AI分析数据已重置')
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, '重置所有AI分析数据失败', { error })
      throw error
    }
  }
}

export const databaseService = new DatabaseService(getDatabaseConfig().path)
