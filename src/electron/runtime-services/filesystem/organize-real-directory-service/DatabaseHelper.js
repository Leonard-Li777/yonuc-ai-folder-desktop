import { LogCategory, logger, isDimensionApplicableToFile } from '@firefly/shared';
import { t } from '@app/languages';
import path from 'node:path';
export class DatabaseHelper {
    db;
    constructor(db) {
        this.db = db;
    }
    async getBatchedVirtualDirectoryFiles(workspaceDirectoryPath, virtualDirs) {
        const resultMap = new Map();
        for (const dir of virtualDirs) {
            resultMap.set(dir.id, []);
        }
        const hasAnyTags = virtualDirs.some(dir => dir.filter?.selectedTags && dir.filter.selectedTags.length > 0);
        if (!hasAnyTags) {
            return resultMap;
        }
        const workspaceRow = this.db
            .prepare('SELECT workspace_id FROM workspaces WHERE path = ?')
            .get(workspaceDirectoryPath);
        if (!workspaceRow) {
            return resultMap;
        }
        const workspaceId = workspaceRow.workspace_id;
        const query = `
      SELECT
        wf.id,
        wf.path,
        wf.name,
        f.smart_name as smartName,
        ft.dimension_id,
        ft.name as tagName
      FROM workspace_files wf
      INNER JOIN files f ON wf.file_fingerprint = f.file_fingerprint
      INNER JOIN file_tag_relations ftr ON ftr.file_fingerprint = f.file_fingerprint
      INNER JOIN file_tags ft ON ft.id = ftr.tag_id
      WHERE wf.is_analyzed = 1
        AND wf.workspace_id = ?
    `;
        const rows = this.db.prepare(query).all(workspaceId);
        const filesById = new Map();
        for (const row of rows) {
            if (!filesById.has(row.id)) {
                filesById.set(row.id, {
                    id: row.id,
                    path: row.path,
                    name: row.name,
                    smartName: row.smartName,
                    tags: new Set()
                });
            }
            filesById.get(row.id).tags.add(`${row.dimension_id}:${row.tagName}`);
        }
        for (const dir of virtualDirs) {
            const selectedTags = dir.filter?.selectedTags;
            if (!selectedTags || selectedTags.length === 0)
                continue;
            const dirTags = selectedTags.map(t => `${t.dimensionId}:${t.tagValue}`);
            const matchedFiles = [];
            for (const file of filesById.values()) {
                let matched = true;
                for (const tag of dirTags) {
                    if (!file.tags.has(tag)) {
                        matched = false;
                        break;
                    }
                }
                if (matched) {
                    matchedFiles.push({
                        id: file.id,
                        path: file.path,
                        name: file.name,
                        smartName: file.smartName
                    });
                }
            }
            resultMap.set(dir.id, matchedFiles);
        }
        return resultMap;
    }
    async getVirtualDirectoryFiles(workspaceDirectoryPath, virtualDir) {
        const selectedTags = virtualDir.filter?.selectedTags;
        if (!selectedTags || selectedTags.length === 0) {
            return [];
        }
        let query = `
      SELECT DISTINCT
        wf.id,
        wf.path,
        wf.name,
        f.smart_name as smartName
      FROM workspace_files wf
      INNER JOIN files f ON wf.file_fingerprint = f.file_fingerprint
      INNER JOIN file_tag_relations ftr ON ftr.file_fingerprint = f.file_fingerprint
      INNER JOIN file_tags ft ON ft.id = ftr.tag_id
      WHERE wf.is_analyzed = 1
        AND wf.workspace_id = (
          SELECT workspace_id FROM workspaces WHERE path = ?
        )
    `;
        const params = [workspaceDirectoryPath];
        for (let i = 0; i < selectedTags.length; i++) {
            const tag = selectedTags[i];
            query += `
        AND EXISTS (
          SELECT 1 FROM file_tag_relations ftr${i}
          INNER JOIN file_tags ft${i} ON ft${i}.id = ftr${i}.tag_id
          WHERE ftr${i}.file_fingerprint = f.file_fingerprint
            AND ft${i}.dimension_id = ?
            AND (
              LOWER(TRIM(ft${i}.name)) = LOWER(TRIM(?))
              OR LOWER(TRIM(REPLACE(ft${i}.name, '.', ''))) = LOWER(TRIM(REPLACE(?, '.', '')))
            )
        )
      `;
            params.push(tag.dimensionId, tag.tagValue, tag.tagValue);
        }
        const files = this.db.prepare(query).all(...params);
        return files;
    }
    async getAnalyzedFiles(workspaceDirectoryPath) {
        try {
            const sep = path.sep;
            const prefix = workspaceDirectoryPath.endsWith(sep)
                ? workspaceDirectoryPath
                : workspaceDirectoryPath + sep;
            const files = this.db
                .prepare(`
        SELECT
          wf.id,
          wf.name,
          f.smart_name as smartName,
          wf.path,
          f.type,
          f.size,
          f.author,
          f.language,
          wf.is_analyzed as isAnalyzed,
          COALESCE(f.modified_at, wf.modified_at) as modifiedAt,
          COALESCE(f.created_at, wf.created_at) as createdAt,
          fc.metadata,
          fc.quality_score as qualityScore,
          f.description
        FROM workspace_files wf
        INNER JOIN files f ON wf.file_fingerprint = f.file_fingerprint
        LEFT JOIN file_contents fc ON wf.file_fingerprint = fc.file_fingerprint
        WHERE wf.is_analyzed = 1
          AND (wf.status IS NULL OR wf.status = 1)
          AND (wf.path LIKE ? OR wf.path = ?)
      `)
                .all(`${prefix}%`, workspaceDirectoryPath);
            logger.info(LogCategory.FILE_ORGANIZATION, `[一键整理] 查询到 ${files.length} 个已分析文件（包含所有子目录）`, {
                workspaceDirectoryPath,
                prefix
            });
            const filesWithTags = [];
            for (const file of files) {
                const dimensionTagsArray = this.db
                    .prepare(`
          SELECT
            fd.name as dimensionName,
            ft.dimension_id as dimension,
            ft.name as tag,
            fd.applicable_file_types as applicableFileTypes
          FROM file_tag_relations ftr
          INNER JOIN file_tags ft ON ft.id = ftr.tag_id
          LEFT JOIN file_dimensions fd ON fd.id = ft.dimension_id
          WHERE ftr.file_fingerprint = (SELECT file_fingerprint FROM workspace_files WHERE id = ?)
            AND ft.dimension_id IS NOT NULL
        `)
                    .all(file.id);
                const contentTags = this.db
                    .prepare(`
          SELECT ft.name
          FROM file_tag_relations ftr
          INNER JOIN file_tags ft ON ft.id = ftr.tag_id
          WHERE ftr.file_fingerprint = (SELECT file_fingerprint FROM workspace_files WHERE id = ?)
            AND ft.dimension_id IS NULL
        `)
                    .all(file.id);
                let parsedMeta = {};
                if (file.metadata) {
                    try {
                        parsedMeta = typeof file.metadata === 'string' ? JSON.parse(file.metadata) : file.metadata;
                    }
                    catch {
                        parsedMeta = {};
                    }
                }
                const fileExt = path.extname(file.path || file.name || '').replace(/^\./, '');
                let rawSmartName = parsedMeta.raw_smart_name || file.smartName || file.name || '';
                if (fileExt) {
                    rawSmartName = rawSmartName.replace(new RegExp(`\\.${fileExt}$`, 'i'), '');
                }
                rawSmartName = rawSmartName.replace(/\.[a-zA-Z0-9]{1,10}$/i, '').trim();
                if (!rawSmartName) {
                    rawSmartName = path.basename(file.name || file.path || '', path.extname(file.name || file.path || ''));
                }
                const formattedDimensionTags = [];
                for (const tItem of dimensionTagsArray) {
                    let applicableTypes = undefined;
                    if (tItem.applicableFileTypes) {
                        try {
                            applicableTypes =
                                typeof tItem.applicableFileTypes === 'string'
                                    ? JSON.parse(tItem.applicableFileTypes)
                                    : tItem.applicableFileTypes;
                        }
                        catch {
                            applicableTypes = undefined;
                        }
                    }
                    if (isDimensionApplicableToFile(applicableTypes, file.path || file.name)) {
                        formattedDimensionTags.push({
                            dimension: tItem.dimensionName || String(tItem.dimension || ''),
                            tag: tItem.tag
                        });
                    }
                }
                for (const ct of contentTags) {
                    if (ct && ct.name) {
                        formattedDimensionTags.push({
                            dimension: t('内容标签'),
                            tag: ct.name
                        });
                    }
                }
                filesWithTags.push({
                    id: file.id,
                    name: file.name,
                    smartName: file.smartName,
                    rawSmartName,
                    path: file.path,
                    type: file.type || '',
                    size: file.size,
                    author: file.author,
                    language: file.language,
                    modifiedAt: file.modifiedAt,
                    createdAt: file.createdAt,
                    metadata: parsedMeta,
                    qualityScore: file.qualityScore,
                    tags: contentTags.map(t => t.name),
                    dimensionTags: formattedDimensionTags,
                    description: file.description
                });
            }
            return filesWithTags;
        }
        catch (error) {
            logger.error(LogCategory.FILE_ORGANIZATION, '获取已分析文件失败', {
                error: error.message
            });
            throw error;
        }
    }
    async getSavedVirtualDirectories(workspaceDirectoryPath) {
        try {
            const directories = this.db
                .prepare(`
        SELECT id, name, description, filters, parent_id, workspace_id, created_at, updated_at
        FROM analyzed_directories
        WHERE workspace_id = (SELECT workspace_id FROM workspaces WHERE path = ?)
        ORDER BY created_at DESC
      `)
                .all(workspaceDirectoryPath);
            return directories.map(dir => ({
                id: dir.id,
                name: dir.name,
                description: dir.description || undefined,
                filter: JSON.parse(dir.filters),
                parentId: dir.parent_id || null,
                workspaceId: dir.workspace_id,
                createdAt: new Date(dir.created_at),
                updatedAt: new Date(dir.updated_at)
            }));
        }
        catch (error) {
            logger.error(LogCategory.FILE_ORGANIZATION, '获取已保存的虚拟目录失败', {
                workspaceDirectoryPath,
                error: error.message
            });
            return [];
        }
    }
}
//# sourceMappingURL=DatabaseHelper.js.map