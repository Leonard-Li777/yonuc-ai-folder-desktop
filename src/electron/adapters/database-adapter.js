/**
 * 数据库适配器实现
 * 将数据库服务 API 适配到核心引擎
 */
import { databaseService } from '../runtime-services/database';
import { ConfigOrchestrator } from '@app/electron/config/config-orchestrator';
import { t } from '@app/languages';
/**
 * 数据库适配器
 */
export class DatabaseAdapter {
    language = 'zh-CN';
    /**
     * 获取数据库实例
     * 动态获取当前活动的数据库连接，避免持有已关闭的旧连接
     */
    getDatabase() {
        const currentDb = databaseService.db;
        if (!currentDb) {
            throw new Error(t('数据库未初始化'));
        }
        return currentDb;
    }
    /**
     * 初始化数据库连接
     */
    async initialize() {
        // 仅初始化语言配置，不再缓存 db 实例
        this.language = ConfigOrchestrator.getInstance().getValue('DEFAULT_LANGUAGE');
    }
    constructor() {
        /**
         * 文件记录操作
         */
        this.files = {
            get: async (fileId) => {
                const db = this.getDatabase();
                // fileId 实际上是 file_fingerprint
                const stmt = db.prepare('SELECT * FROM files WHERE file_fingerprint = ?');
                return stmt.get(fileId) || null;
            },
            update: async (fileId, data) => {
                const db = this.getDatabase();
                // 分离不同表的字段
                const fileContentsFields = [
                    'quality_score',
                    'quality_confidence',
                    'quality_criteria',
                    'quality_reasoning',
                    'content',
                    'multimodal_content',
                    'lrc',
                    'metadata',
                    'analysis_stats',
                    'grouping_reason',
                    'grouping_confidence'
                ];
                const workspaceFilesFields = [
                    'is_analyzed',
                    'analysis_error',
                    'last_analyzed_at',
                    'thumbnail_path',
                    'parent_archive',
                    'unit_id'
                ];
                const fileContentsData = {};
                const filesData = {};
                const workspaceFilesData = {};
                Object.keys(data).forEach(key => {
                    if (fileContentsFields.includes(key)) {
                        fileContentsData[key] = data[key];
                    }
                    else if (workspaceFilesFields.includes(key)) {
                        workspaceFilesData[key] = data[key];
                    }
                    else {
                        filesData[key] = data[key];
                    }
                });
                // 更新 file_contents 表（如果包含相关字段）
                if (Object.keys(fileContentsData).length > 0) {
                    const fields = Object.keys(fileContentsData);
                    const values = Object.values(fileContentsData).map(v => {
                        if (typeof v === 'object' && v !== null) {
                            return JSON.stringify(v);
                        }
                        return v;
                    });
                    const setClause = fields.map(field => `${field} = ?`).join(', ');
                    const stmt = db.prepare(`UPDATE file_contents SET ${setClause} WHERE file_fingerprint = ?`);
                    stmt.run(...values, fileId);
                }
                // 更新 files 表（如果包含相关字段）
                if (Object.keys(filesData).length > 0) {
                    const fields = Object.keys(filesData);
                    const values = Object.values(filesData);
                    const setClause = fields.map(field => `${field} = ?`).join(', ');
                    const extraFields = data.sync_status === undefined ? ', sync_status = 0' : '';
                    const stmt = db.prepare(`UPDATE files SET ${setClause}${extraFields}, modified_at = ? WHERE file_fingerprint = ?`);
                    stmt.run(...values, new Date().toISOString(), fileId);
                }
                // 更新 workspace_files 表（如果包含相关字段）
                if (Object.keys(workspaceFilesData).length > 0) {
                    const fields = Object.keys(workspaceFilesData);
                    const values = Object.values(workspaceFilesData);
                    const setClause = fields.map(field => `${field} = ?`).join(', ');
                    const stmt = db.prepare(`UPDATE workspace_files SET ${setClause}, modified_at = ? WHERE file_fingerprint = ?`);
                    stmt.run(...values, new Date().toISOString(), fileId);
                }
            },
            getByPath: async (filePath) => {
                const db = this.getDatabase();
                const stmt = db.prepare('SELECT * FROM files WHERE path = ?');
                return stmt.get(filePath) || null;
            },
            getBatch: async (fileIds) => {
                if (fileIds.length === 0)
                    return [];
                const db = this.getDatabase();
                const placeholders = fileIds.map(() => '?').join(',');
                const stmt = db.prepare(`SELECT * FROM files WHERE file_fingerprint IN (${placeholders})`);
                return stmt.all(...fileIds);
            }
        };
        /**
         * 维度操作
         */
        this.dimensions = {
            getAll: async () => {
                const db = this.getDatabase();
                const stmt = db.prepare('SELECT * FROM file_dimensions ORDER BY level ASC');
                return stmt.all();
            },
            create: async (dimension) => {
                const db = this.getDatabase();
                const stmt = db.prepare(`
          INSERT INTO file_dimensions (
            id, level, tags, trigger_conditions,
            is_ai_generated, description, applicable_file_types, context_hints
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
                stmt.run(dimension.id, dimension.level, JSON.stringify(dimension.tags || []), JSON.stringify(dimension.triggerConditions || []), dimension.isAIGenerated ? 1 : 0, dimension.description || null, JSON.stringify(dimension.applicableFileTypes || []), JSON.stringify(dimension.contextHints || []));
            },
            update: async (dimensionId, data) => {
                const db = this.getDatabase();
                const fields = Object.keys(data);
                const values = Object.values(data).map(v => typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
                if (fields.length === 0)
                    return;
                const setClause = fields.map(field => `${field} = ?`).join(', ');
                const stmt = db.prepare(`UPDATE file_dimensions SET ${setClause}, sync_status = 0 WHERE id = ?`);
                stmt.run(...values, dimensionId);
            },
            getById: async (dimensionId) => {
                const db = this.getDatabase();
                const stmt = db.prepare('SELECT * FROM file_dimensions WHERE id = ?');
                return stmt.get(dimensionId) || null;
            }
        };
        /**
         * 维度扩展操作
         */
        this.dimensionExpansions = {
            create: async (expansion) => {
                const db = this.getDatabase();
                const stmt = db.prepare(`
          INSERT INTO dimension_expansions (
            id, name, level, tags, trigger_conditions, description
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);
                stmt.run(expansion.id, expansion.name, expansion.level || 2, JSON.stringify(expansion.tags || []), JSON.stringify(expansion.triggerConditions || []), expansion.description || null);
            },
            getById: async (expansionId) => {
                const db = this.getDatabase();
                const stmt = db.prepare('SELECT * FROM dimension_expansions WHERE id = ?');
                return stmt.get(expansionId) || null;
            },
            approve: async (expansionId) => {
                const db = this.getDatabase();
                const expansion = db
                    .prepare('SELECT * FROM dimension_expansions WHERE id = ?')
                    .get(expansionId);
                if (expansion) {
                    db.transaction(() => {
                        db.prepare(`
              INSERT OR REPLACE INTO file_dimensions (
                id, level, tags, trigger_conditions, is_ai_generated, description, sync_status
              ) VALUES (?, ?, ?, ?, 1, ?, 0)
            `).run(expansion.id, expansion.level, expansion.tags, expansion.trigger_conditions, expansion.description);
                        db.prepare('DELETE FROM dimension_expansions WHERE id = ?').run(expansionId);
                    })();
                }
            },
            reject: async (expansionId) => {
                const db = this.getDatabase();
                db.prepare('DELETE FROM dimension_expansions WHERE id = ?').run(expansionId);
            },
            getPending: async () => {
                const db = this.getDatabase();
                const stmt = db.prepare(`SELECT * FROM dimension_expansions`);
                return stmt.all();
            }
        };
    }
    /**
     * 文件记录操作
     */
    files;
    /**
     * 维度操作
     */
    dimensions;
    /**
     * 维度扩展操作
     */
    dimensionExpansions;
    /**
     * 按工作区 ID 获取文件
     */
    async getFilesByWorkspaceId(workspaceId) {
        const db = this.getDatabase();
        return db.prepare('SELECT * FROM workspace_files WHERE workspace_id = ?').all(workspaceId);
    }
}
/**
 * 创建数据库适配器实例
 */
export async function createDatabaseAdapter() {
    const adapter = new DatabaseAdapter();
    await adapter.initialize();
    return adapter;
}
//# sourceMappingURL=database-adapter.js.map