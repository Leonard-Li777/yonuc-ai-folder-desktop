import { LogCategory, logger } from '@firefly/shared';
import { DimensionManager } from './DimensionManager';
import { FileFilter } from './FileFilter';
import { LinkManager } from './LinkManager';
import { PersistenceManager } from './PersistenceManager';
import { databaseService } from '../../database/database-service';
export class AnalyzedDirectoryService {
    _db = null;
    _dimensionManager = null;
    _fileFilter = null;
    _linkManager = null;
    _persistenceManager = null;
    _initialized = false;
    _customDb = false;
    constructor(db) {
        if (db) {
            this._db = db;
            this._customDb = true;
            this.initDelegates();
            this._initialized = true;
        }
    }
    ensureInitialized() {
        if (this._customDb && this._db)
            return;
        if (this._initialized && this._db === databaseService.db)
            return;
        this._db = databaseService.db;
        if (!this._db)
            throw new Error('[AnalyzedDirectoryService] Database not initialized');
        this.initDelegates();
        this._initialized = true;
    }
    initDelegates() {
        const db = this._db;
        this._dimensionManager = new DimensionManager(db);
        this._fileFilter = new FileFilter(db, tag => this._dimensionManager.getExtensionsForTag(tag));
        this._linkManager = new LinkManager(db, params => this._fileFilter.getFilteredFiles(params), async (_virtualDirPath) => { });
        this._persistenceManager = new PersistenceManager(db);
    }
    get dimensionManager() {
        this.ensureInitialized();
        return this._dimensionManager;
    }
    get fileFilter() {
        this.ensureInitialized();
        return this._fileFilter;
    }
    get linkManager() {
        this.ensureInitialized();
        return this._linkManager;
    }
    get persistenceManager() {
        this.ensureInitialized();
        return this._persistenceManager;
    }
    get db() {
        this.ensureInitialized();
        return this._db;
    }
    /**
     * 重置服务状态，在数据库重新初始化后调用（如语言切换）
     */
    reset() {
        this._db = null;
        this._dimensionManager = null;
        this._fileFilter = null;
        this._linkManager = null;
        this._persistenceManager = null;
        this._initialized = false;
    }
    // ─── 维度/过滤相关 ──────────────────────────────────────────────
    async getDimensionGroups(options, language) {
        return this.dimensionManager.getDimensionGroups(options, language);
    }
    async getAnalyzedFilesCount(workspaceDirectoryPath) {
        return this.fileFilter.getAnalyzedFilesCount(workspaceDirectoryPath);
    }
    async getFilteredFilesPaged(params) {
        return this.fileFilter.getFilteredFilesPaged(params);
    }
    async getFilteredFiles(params) {
        return this.fileFilter.getFilteredFiles(params);
    }
    async getSavedDirectories(workspaceDirectoryId) {
        try {
            let resolvedId;
            if (typeof workspaceDirectoryId === 'string') {
                const workspaceResult = this.db
                    .prepare('SELECT id FROM workspace_directories WHERE path = ?')
                    .get(workspaceDirectoryId);
                if (!workspaceResult)
                    return [];
                resolvedId = workspaceResult.id;
            }
            else {
                resolvedId = workspaceDirectoryId;
            }
            const rows = this.db
                .prepare('SELECT * FROM analyzed_directories WHERE workspace_id = ? ORDER BY sort_order ASC')
                .all(resolvedId);
            return rows.map((r) => ({
                ...r,
                filter: JSON.parse(r.filters),
                workspaceId: r.workspace_id,
                parentId: r.parent_id || null,
                createdAt: new Date(r.created_at),
                updatedAt: new Date(r.updated_at)
            }));
        }
        catch (error) {
            logger.error(LogCategory.VIRTUAL_DIRECTORY, 'Failed to get saved analyzed directories:', error);
            return [];
        }
    }
    async saveDirectory(directory, workspaceDirectoryPath) {
        const filters = JSON.stringify(directory.filter);
        this.db
            .prepare(`
      INSERT INTO analyzed_directories (id, workspace_id, name, filters, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        filters = excluded.filters,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at
    `)
            .run(directory.id, directory.workspaceId, directory.name, filters, directory.sort_order || 0, new Date().toISOString(), new Date().toISOString());
        return directory;
    }
    async batchSaveDirectories(directories, workspaceDirectoryPath) {
        return this.db.transaction(() => {
            const result = [];
            let resolvedWorkspaceId = undefined;
            if (workspaceDirectoryPath) {
                const workspaceResult = this.db
                    .prepare('SELECT id FROM workspace_directories WHERE path = ?')
                    .get(workspaceDirectoryPath);
                if (workspaceResult) {
                    resolvedWorkspaceId = workspaceResult.id;
                }
            }
            for (const d of directories) {
                if (!d.id) {
                    const generatedId = `vdir-${Date.now()}-${Math.random().toString(36).substring(7)}`;
                    const saved = {
                        id: generatedId,
                        name: d.name,
                        filter: d.filter || d.filters || {},
                        workspaceId: resolvedWorkspaceId || d.workspaceId || 0,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    this.saveDirectory(saved, workspaceDirectoryPath);
                    result.push({ name: d.name, path: d.path ? d.path.join('/') : d.name });
                }
                else {
                    this.saveDirectory(d, workspaceDirectoryPath);
                    result.push(d);
                }
            }
            return result;
        })();
    }
    async deleteDirectory(directoryId) {
        this.db.prepare('DELETE FROM analyzed_directories WHERE id = ?').run(directoryId);
    }
    async renameDirectory(directoryId, newName) {
        this.db
            .prepare('UPDATE analyzed_directories SET name = ?, updated_at = ? WHERE id = ?')
            .run(newName, new Date().toISOString(), directoryId);
    }
    async isFirst(workspaceDirectoryPath) {
        const count = this.db
            .prepare('SELECT COUNT(*) as count FROM analyzed_directories WHERE workspace_id = (SELECT id FROM workspace_directories WHERE path = ? LIMIT 1)')
            .get(workspaceDirectoryPath);
        return count.count === 0;
    }
    async isFirstVirtualDirectory(workspaceDirectoryPath) {
        return this.isFirst(workspaceDirectoryPath);
    }
    async cleanup(workspaceDirectoryPath) {
        return this.linkManager.cleanupVirtualDirectory(workspaceDirectoryPath);
    }
    async cleanupVirtualDirectory(workspaceDirectoryPath) {
        return this.cleanup(workspaceDirectoryPath);
    }
    async getPrivateAnalyzedFilesCount(workspaceDirectoryPath) {
        return this.getAnalyzedFilesCount(workspaceDirectoryPath);
    }
    async findFirstHardlink(filePath, workspacePath) {
        return this.linkManager.findFirstHardlink(filePath, workspacePath);
    }
}
export const analyzedDirectoryService = new AnalyzedDirectoryService();
//# sourceMappingURL=index.js.map