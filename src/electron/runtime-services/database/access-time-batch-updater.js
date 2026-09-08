import { LogCategory, logger } from '@firefly/shared';
export class AccessTimeBatchUpdater {
    static instance = null;
    updates = new Map();
    timer = null;
    maxBatchSize = 50;
    debounceMs = 5000;
    dbProvider = null;
    constructor() { }
    static getInstance() {
        if (!AccessTimeBatchUpdater.instance) {
            AccessTimeBatchUpdater.instance = new AccessTimeBatchUpdater();
        }
        return AccessTimeBatchUpdater.instance;
    }
    setDbProvider(provider) {
        this.dbProvider = provider;
    }
    queueUpdate(id, accessedAt) {
        this.updates.set(id, accessedAt);
        if (this.updates.size >= this.maxBatchSize) {
            this.flush();
        }
        else {
            this.startTimer();
        }
    }
    startTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.flush();
        }, this.debounceMs);
    }
    flush() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.updates.size === 0) {
            return;
        }
        const db = this.dbProvider ? this.dbProvider() : null;
        if (!db) {
            logger.warn(LogCategory.DATABASE_SERVICE, 'AccessTimeBatchUpdater: 数据库不可用，跳过刷盘');
            return;
        }
        const currentUpdates = Array.from(this.updates.entries());
        this.updates.clear();
        try {
            db.transaction(() => {
                const stmt = db.prepare('UPDATE workspace_files SET accessed_at = ? WHERE id = ?');
                for (const [id, accessedAt] of currentUpdates) {
                    stmt.run(accessedAt, id);
                }
            })();
            logger.info(LogCategory.DATABASE_SERVICE, `AccessTimeBatchUpdater: 批量更新 ${currentUpdates.length} 条 accessed_at 记录完成`);
        }
        catch (error) {
            logger.error(LogCategory.DATABASE_SERVICE, 'AccessTimeBatchUpdater: 批量刷新失败', error);
            // 若写入失败，重新放回队列（优先保留新值）
            for (const [id, accessedAt] of currentUpdates) {
                if (!this.updates.has(id)) {
                    this.updates.set(id, accessedAt);
                }
            }
        }
    }
}
//# sourceMappingURL=access-time-batch-updater.js.map