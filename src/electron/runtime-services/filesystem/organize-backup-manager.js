import fs from 'node:fs';
import path from 'node:path';
import { logger, LogCategory } from '@firefly/shared';
/**
 * 备份管理器
 * 负责创建、管理和恢复文件备份
 */
export class OrganizeBackupManager {
    backupDir;
    backupRecords = [];
    sessionId;
    constructor(workspaceDirectoryPath) {
        this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');
        this.backupDir = path.join(workspaceDirectoryPath, '.organize-backups', this.sessionId);
        this.ensureBackupDirectory();
    }
    /**
     * 确保备份目录存在
     */
    ensureBackupDirectory() {
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
            logger.info(LogCategory.FILE_ORGANIZATION, '创建备份目录', { backupDir: this.backupDir });
        }
    }
    /**
     * 创建文件备份
     */
    async createBackup(filePath) {
        try {
            const fileName = path.basename(filePath);
            const relativePath = path.relative(path.dirname(this.backupDir), filePath);
            const backupPath = path.join(this.backupDir, relativePath);
            // 确保备份目标目录存在
            const backupDirPath = path.dirname(backupPath);
            if (!fs.existsSync(backupDirPath)) {
                fs.mkdirSync(backupDirPath, { recursive: true });
            }
            // 复制文件
            fs.copyFileSync(filePath, backupPath);
            // 获取文件大小
            const stats = fs.statSync(filePath);
            // 记录备份
            const record = {
                originalPath: filePath,
                backupPath,
                timestamp: new Date().toISOString(),
                fileSize: stats.size
            };
            this.backupRecords.push(record);
            logger.debug(LogCategory.FILE_ORGANIZATION, '创建文件备份', {
                original: filePath,
                backup: backupPath
            });
            return backupPath;
        }
        catch (error) {
            logger.error(LogCategory.FILE_ORGANIZATION, '创建备份失败', {
                filePath,
                error: error.message
            });
            throw error;
        }
    }
    /**
     * 批量创建备份
     */
    async createBatchBackups(filePaths) {
        const backupMap = new Map();
        for (const filePath of filePaths) {
            try {
                const backupPath = await this.createBackup(filePath);
                backupMap.set(filePath, backupPath);
            }
            catch (error) {
                // 继续处理其他文件
                logger.warn(LogCategory.FILE_ORGANIZATION, '跳过备份失败的文件', { filePath });
            }
        }
        logger.info(LogCategory.FILE_ORGANIZATION, '批量备份完成', {
            total: filePaths.length,
            success: backupMap.size,
            failed: filePaths.length - backupMap.size
        });
        return backupMap;
    }
    /**
     * 恢复单个文件
     */
    async restoreFile(originalPath) {
        try {
            const record = this.backupRecords.find(r => r.originalPath === originalPath);
            if (!record) {
                logger.warn(LogCategory.FILE_ORGANIZATION, '未找到备份记录', { originalPath });
                return false;
            }
            if (!fs.existsSync(record.backupPath)) {
                logger.warn(LogCategory.FILE_ORGANIZATION, '备份文件不存在', {
                    backupPath: record.backupPath
                });
                return false;
            }
            // 恢复文件
            fs.copyFileSync(record.backupPath, originalPath);
            logger.info(LogCategory.FILE_ORGANIZATION, '文件恢复成功', {
                original: originalPath,
                backup: record.backupPath
            });
            return true;
        }
        catch (error) {
            logger.error(LogCategory.FILE_ORGANIZATION, '文件恢复失败', {
                originalPath,
                error: error.message
            });
            return false;
        }
    }
    /**
     * 恢复所有备份
     */
    async restoreAll() {
        let success = 0;
        let failed = 0;
        logger.info(LogCategory.FILE_ORGANIZATION, '开始恢复所有备份', {
            total: this.backupRecords.length
        });
        for (const record of this.backupRecords) {
            const result = await this.restoreFile(record.originalPath);
            if (result) {
                success++;
            }
            else {
                failed++;
            }
        }
        logger.info(LogCategory.FILE_ORGANIZATION, '备份恢复完成', { success, failed });
        return { success, failed };
    }
    /**
     * 清理备份文件
     */
    async cleanup() {
        try {
            if (fs.existsSync(this.backupDir)) {
                fs.rmSync(this.backupDir, { recursive: true, force: true });
                logger.info(LogCategory.FILE_ORGANIZATION, '清理备份目录', { backupDir: this.backupDir });
            }
        }
        catch (error) {
            logger.error(LogCategory.FILE_ORGANIZATION, '清理备份失败', {
                backupDir: this.backupDir,
                error: error.message
            });
        }
    }
    /**
     * 获取备份记录
     */
    getBackupRecords() {
        return [...this.backupRecords];
    }
    /**
     * 获取备份统计信息
     */
    getStatistics() {
        const totalSize = this.backupRecords.reduce((sum, record) => sum + record.fileSize, 0);
        return {
            totalFiles: this.backupRecords.length,
            totalSize,
            backupDir: this.backupDir,
            sessionId: this.sessionId
        };
    }
    /**
     * 保存备份清单到文件
     */
    async saveManifest() {
        try {
            const manifestPath = path.join(this.backupDir, 'manifest.json');
            const manifest = {
                sessionId: this.sessionId,
                timestamp: new Date().toISOString(),
                records: this.backupRecords,
                statistics: this.getStatistics()
            };
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
            logger.info(LogCategory.FILE_ORGANIZATION, '保存备份清单', { manifestPath });
        }
        catch (error) {
            logger.error(LogCategory.FILE_ORGANIZATION, '保存备份清单失败', {
                error: error.message
            });
        }
    }
    /**
     * 从清单文件加载备份记录
     */
    static async loadFromManifest(workspaceDirectoryPath, sessionId) {
        try {
            const backupDir = path.join(workspaceDirectoryPath, '.organize-backups', sessionId);
            const manifestPath = path.join(backupDir, 'manifest.json');
            if (!fs.existsSync(manifestPath)) {
                return null;
            }
            const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestContent);
            const manager = new OrganizeBackupManager(workspaceDirectoryPath);
            manager.sessionId = manifest.sessionId;
            manager.backupRecords = manifest.records;
            logger.info(LogCategory.FILE_ORGANIZATION, '从清单加载备份', {
                sessionId,
                recordCount: manager.backupRecords.length
            });
            return manager;
        }
        catch (error) {
            logger.error(LogCategory.FILE_ORGANIZATION, '加载备份清单失败', {
                sessionId,
                error: error.message
            });
            return null;
        }
    }
}
//# sourceMappingURL=organize-backup-manager.js.map