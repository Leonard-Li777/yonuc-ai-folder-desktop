import { LogCategory, logger } from '@firefly/shared';
import * as path from 'path';
export class TagUnitDao {
    db;
    constructor(db) {
        this.db = db;
    }
    async createUnit(data) {
        const now = new Date().toISOString();
        const stmt = this.db.prepare(`INSERT INTO file_units (
      name, description, type, path, grouping_reason, grouping_confidence, author, title, tags, quality_score, parent_unit_id, workspace_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const result = stmt.run(data.name, data.description ?? null, data.type, data.path ?? null, data.groupingReason ?? null, data.groupingConfidence ?? null, data.author ?? null, data.title ?? null, data.tags ? JSON.stringify(data.tags) : null, data.qualityScore ?? null, data.parentUnitId ?? null, data.workspaceId, now, now);
        return this.getUnit(Number(result.lastInsertRowid));
    }
    async getUnit(id) {
        const row = this.db.prepare('SELECT * FROM file_units WHERE id = ?').get(id);
        if (!row)
            throw new Error('Unit not found');
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
            updatedAt: row.updated_at ?? undefined
        };
    }
    async updateUnit(id, partial) {
        const row = this.db.prepare('SELECT * FROM file_units WHERE id = ?').get(id);
        if (!row)
            throw new Error('Unit not found');
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
            analysis_error: partial.analysisError ?? row.analysis_error
        };
        this.db
            .prepare(`UPDATE file_units SET
      name = ?, description = ?, type = ?, path = ?, grouping_reason = ?, grouping_confidence = ?, author = ?, title = ?, tags = ?, quality_score = ?, parent_unit_id = ?, is_analyzed = ?, analyzed_at = ?, analysis_error = ?, updated_at = ?
      WHERE id = ?`)
            .run(updated.name, updated.description, updated.type, updated.path, updated.grouping_reason, updated.grouping_confidence, updated.author, updated.title, updated.tags, updated.quality_score, updated.parent_unit_id, updated.is_analyzed, updated.analyzed_at, updated.analysis_error, new Date().toISOString(), id);
        return this.getUnit(id);
    }
    async deleteUnit(id) {
        this.db.prepare('DELETE FROM file_units WHERE id = ?').run(id);
    }
    async getUnitsForFile(fileDbId) {
        const rows = this.db
            .prepare(`
      SELECT u.* FROM file_units u
      JOIN file_unit_relations r ON r.file_id = u.id
      WHERE r.file_id = ?
    `)
            .all(fileDbId);
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
            updatedAt: row.updated_at ?? undefined
        }));
    }
    async createFileUnitRelation(fileDbId, unitId) {
        this.db
            .prepare('INSERT OR IGNORE INTO file_unit_relations (file_id, unit_id) VALUES (?, ?)')
            .run(fileDbId, unitId);
    }
    async getUnitsForPath(filePath) {
        const wf = this.db.prepare('SELECT id FROM workspace_files WHERE path = ?').get(filePath);
        if (wf) {
            return this.getUnitsForFile(wf.id);
        }
        const parentDirPath = path.dirname(filePath);
        const rows = this.db
            .prepare('SELECT * FROM file_units WHERE path = ?')
            .all(parentDirPath);
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
            updatedAt: row.updated_at ?? undefined
        }));
    }
    async getFileTagsByFileId(fileFingerprint) {
        try {
            return this.db
                .prepare(`
        SELECT ft.id, ft.name, ft.dimension_id
        FROM file_tag_relations ftr
        JOIN file_tags ft ON ftr.tag_id = ft.id
        WHERE ftr.file_fingerprint = ?
      `)
                .all(fileFingerprint);
        }
        catch (error) {
            logger.error(LogCategory.DATABASE_SERVICE, '获取文件标签失败', { error, fileFingerprint });
            return [];
        }
    }
}
//# sourceMappingURL=tag-unit-dao.js.map