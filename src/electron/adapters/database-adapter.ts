/**
 * 数据库适配器实现
 * 将数据库服务 API 适配到核心引擎
 */

import { IDatabaseAdapter } from '@yonuc/core-engine'
import { databaseService } from '../runtime-services/database'
import type { LanguageCode } from '@yonuc/types'
import type Database from 'better-sqlite3'
import { configService } from '../runtime-services/config'

/**
 * 数据库适配器
 */
export class DatabaseAdapter implements IDatabaseAdapter {
  // private db: Database.Database | null = null // 移除缓存的 db 引用
  private language: LanguageCode = 'zh-CN'
  
  /**
   * 获取数据库实例
   * 动态获取当前活动的数据库连接，避免持有已关闭的旧连接
   */
  getDatabase(): Database.Database {
    const currentDb = databaseService.db
    if (!currentDb) {
      throw new Error('数据库未初始化')
    }
    return currentDb
  }

  /**
   * 初始化数据库连接
   */
  async initialize(): Promise<void> {
    // 仅初始化语言配置，不再缓存 db 实例
    this.language = configService.getValue('DEFAULT_LANGUAGE')
  }

  constructor() {
    /**
     * 文件记录操作
     */
    this.files = {
      get: async (fileId: string): Promise<any | null> => {
        const db = this.getDatabase()
        const stmt = db.prepare('SELECT * FROM files WHERE id = ?')
        return stmt.get(fileId) || null
      },

      update: async (fileId: string, data: Partial<any>): Promise<void> => {
        const db = this.getDatabase()
        const fields = Object.keys(data)
        const values = Object.values(data)

        if (fields.length === 0) return

        const setClause = fields.map((field) => `${field} = ?`).join(', ')
        // 更新时自动重置 sync_status 为 0 (除非显式提供了 sync_status)
        const extraFields = data.sync_status === undefined ? ', sync_status = 0' : ''
        const stmt = db.prepare(`UPDATE files SET ${setClause}${extraFields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        stmt.run(...values, fileId)
      },

      getByPath: async (filePath: string): Promise<any | null> => {
        const db = this.getDatabase()
        const stmt = db.prepare('SELECT * FROM files WHERE path = ?')
        return stmt.get(filePath) || null
      },

      getBatch: async (fileIds: string[]): Promise<any[]> => {
        if (fileIds.length === 0) return []

        const db = this.getDatabase()
        const placeholders = fileIds.map(() => '?').join(',')
        const stmt = db.prepare(`SELECT * FROM files WHERE id IN (${placeholders})`)
        return stmt.all(...fileIds)
      },
    }

    /**
     * 维度操作
     */
    this.dimensions = {
      getAll: async (): Promise<any[]> => {
        const db = this.getDatabase()
        const stmt = db.prepare('SELECT * FROM file_dimensions ORDER BY level ASC')
        return stmt.all()
      },

      create: async (dimension: any): Promise<void> => {
        const db = this.getDatabase()
        const stmt = db.prepare(`
          INSERT INTO file_dimensions (
            id, level, tags, trigger_conditions,
            is_ai_generated, description, applicable_file_types, context_hints
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)

        stmt.run(
          dimension.id,
          dimension.level,
          JSON.stringify(dimension.tags || []),
          JSON.stringify(dimension.triggerConditions || []),
          dimension.isAIGenerated ? 1 : 0,
          dimension.description || null,
          JSON.stringify(dimension.applicableFileTypes || []),
          JSON.stringify(dimension.contextHints || [])
        )
      },

      update: async (dimensionId: string, data: Partial<any>): Promise<void> => {
        const db = this.getDatabase()
        const fields = Object.keys(data)
        const values = Object.values(data).map((v) =>
          typeof v === 'object' && v !== null ? JSON.stringify(v) : v
        )

        if (fields.length === 0) return

        const setClause = fields.map((field) => `${field} = ?`).join(', ')
        const stmt = db.prepare(`UPDATE file_dimensions SET ${setClause}, sync_status = 0 WHERE id = ?`)
        stmt.run(...values, dimensionId)
      },

      getById: async (dimensionId: string): Promise<any | null> => {
        const db = this.getDatabase()
        const stmt = db.prepare('SELECT * FROM file_dimensions WHERE id = ?')
        return stmt.get(dimensionId) || null
      },
    }

    /**
     * 维度扩展操作
     */
    this.dimensionExpansions = {
      create: async (expansion: any): Promise<void> => {
        const db = this.getDatabase()
        const stmt = db.prepare(`
          INSERT INTO dimension_expansions (
            id, level, tags, trigger_conditions, description
          ) VALUES (?, ?, ?, ?, ?)
        `)

        stmt.run(
          expansion.id,
          expansion.level || 2,
          JSON.stringify(expansion.tags || []),
          JSON.stringify(expansion.triggerConditions || []),
          expansion.description || null
        )
      },

      getById: async (expansionId: string): Promise<any | null> => {
        const db = this.getDatabase()
        const stmt = db.prepare('SELECT * FROM dimension_expansions WHERE id = ?')
        return stmt.get(expansionId) || null
      },

      approve: async (expansionId: string): Promise<void> => {
        const db = this.getDatabase()
        const expansion = db.prepare('SELECT * FROM dimension_expansions WHERE id = ?').get(expansionId) as any
        if (expansion) {
          db.transaction(() => {
            db.prepare(`
              INSERT OR REPLACE INTO file_dimensions (
                id, level, tags, trigger_conditions, is_ai_generated, description, sync_status
              ) VALUES (?, ?, ?, ?, 1, ?, 0)
            `).run(expansion.id, expansion.level, expansion.tags, expansion.trigger_conditions, expansion.description)
            db.prepare('DELETE FROM dimension_expansions WHERE id = ?').run(expansionId)
          })()
        }
      },

      reject: async (expansionId: string): Promise<void> => {
        const db = this.getDatabase()
        db.prepare('DELETE FROM dimension_expansions WHERE id = ?').run(expansionId)
      },

      getPending: async (): Promise<any[]> => {
        const db = this.getDatabase()
        const stmt = db.prepare(`SELECT * FROM dimension_expansions`)
        return stmt.all()
      },
    }
  }

  /**
   * 文件记录操作
   */
  files: any

  /**
   * 维度操作
   */
  dimensions: any

  /**
   * 维度扩展操作
   */
  dimensionExpansions: any
}

/**
 * 创建数据库适配器实例
 */
export async function createDatabaseAdapter(): Promise<IDatabaseAdapter> {
  const adapter = new DatabaseAdapter()
  await adapter.initialize()
  return adapter
}
