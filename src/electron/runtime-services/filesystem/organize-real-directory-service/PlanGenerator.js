import { LogCategory, logger } from '@firefly/shared';
import { ConfigOrchestrator } from '@app/electron/config/config-orchestrator';
import { t } from '@app/languages';
import { buildOrganizeSystemPrompt, buildOrganizeUserPrompt } from '@firefly/core-engine';
import { databaseService } from '../../database/database-service';
import { createCoreEngineAdapters } from '../../../adapters';
export class PlanGenerator {
    db;
    getQuickOrganizeService;
    constructor(db, getQuickOrganizeService) {
        this.db = db;
        this.getQuickOrganizeService = getQuickOrganizeService;
    }
    /**
     * 构建整理方案提示词（不调用本地 AI）
     * 返回的 systemPrompt 和 userPrompt 可提交给外部 AI 进行推理
     */
    async buildOrganizePrompts(workspaceDirectoryPath, userInstruction = '', 
    /** 可选的待整理文件列表，如提供则仅提取这些文件的文件名和标签 */
    analyzedFiles) {
        const ws = await databaseService.getWorkspaceDirectoryByPath(workspaceDirectoryPath);
        if (!ws || ws.id === undefined)
            throw new Error('Workspace not found');
        // 1. 获取样本已分析文件列表（优先使用调用方传入的待整理文件）
        const files = analyzedFiles && analyzedFiles.length > 0
            ? analyzedFiles
            : await databaseService.getAnalyzedFilesByWorkspace(ws.id, 50);
        // 2. 收集这些文件的标签，用于过滤参考目录树
        const relevantTags = new Set();
        for (const f of files) {
            if (f.tags)
                f.tags.forEach((t) => relevantTags.add(t));
            if (f.dimensionTags)
                f.dimensionTags.forEach((dt) => relevantTags.add(dt.tag));
        }
        // 3. 准备维度信息（基于这些文件实际拥有的标签）
        const dimensionInfo = this.prepareDimensionInfo(undefined, relevantTags);
        // 4. 准备目录分析
        const directoryAnalysis = this.prepareDirectoryAnalysis(workspaceDirectoryPath);
        const adapters = await createCoreEngineAdapters();
        // 5. 构建提示词
        const language = ConfigOrchestrator.getInstance().getValue('DEFAULT_LANGUAGE');
        const systemPrompt = await buildOrganizeSystemPrompt(files, {
            dimensionInfo,
            directoryAnalysis,
            userInstruction,
            templateMode: true,
            language
        });
        const userPrompt = await buildOrganizeUserPrompt(files, {
            aiHelper: adapters.aiHelper,
            namesOnly: false
        });
        return { systemPrompt, userPrompt };
    }
    async generateOrganizePlan(workspaceDirectoryPath, analyzedFiles, options) {
        try {
            logger.info(LogCategory.FILE_ORGANIZATION, '开始生成一键整理方案', {
                workspaceDirectoryPath,
                options: { ...options, onProgress: undefined }
            });
            if (analyzedFiles.length === 0) {
                throw new Error(options?.filePaths && options.filePaths.length > 0
                    ? t('选中的文件中没有AI分析过的文件，请先进行AI分析')
                    : t('当前没有AI分析过的文件，请先在真实目录中勾选文件进行AI分析'));
            }
            let dimensionInfo = options?.dimensionInfo;
            if (!dimensionInfo) {
                // 收集待整理文件真实拥有的标签，用于过滤参考目录树
                const relevantTags = new Set();
                for (const f of analyzedFiles) {
                    if (f.tags)
                        f.tags.forEach((t) => relevantTags.add(t));
                    if (f.dimensionTags)
                        f.dimensionTags.forEach((dt) => relevantTags.add(dt.tag));
                }
                dimensionInfo = this.prepareDimensionInfo(options, relevantTags);
            }
            let directoryAnalysis = options?.directoryAnalysis;
            if (!directoryAnalysis) {
                directoryAnalysis = this.prepareDirectoryAnalysis(workspaceDirectoryPath);
            }
            const adapters = await createCoreEngineAdapters();
            const aiServiceMode = ConfigOrchestrator.getInstance().getValue('AI_SERVICE_MODE') || 'local';
            const contextLength = await adapters.aiHelper.getMaxContentLength();
            let historyWindowSize = 10;
            if (aiServiceMode === 'cloud') {
                historyWindowSize = 100;
            }
            const batchSize = ConfigOrchestrator.getInstance().getValue('QUEUE_BATCH_SIZE') || 10;
            const temperature = ConfigOrchestrator.getInstance().getValue('MODEL_TEMPERATURE') || 0.3;
            let isSpeedy = false;
            try {
                const row = this.db
                    .prepare(`
          SELECT w.type FROM workspaces w
          JOIN workspace_directories wd ON wd.workspace_id = w.workspace_id
          WHERE wd.path = ? LIMIT 1
        `)
                    .get(workspaceDirectoryPath);
                if (row?.type === 'SPEEDY')
                    isSpeedy = true;
            }
            catch (_e) {
                /* 忽略查询工作区类型失败 */
            }
            const quickOrganizeService = await this.getQuickOrganizeService();
            const structure = await quickOrganizeService.generateOrganizePlan(analyzedFiles, {
                batchSize,
                temperature,
                maxTokens: 4096,
                contextLength,
                historyWindowSize,
                dimensionInfo,
                directoryAnalysis,
                isSpeedy,
                ...options
            });
            return structure;
        }
        catch (error) {
            if (error.message !== 'CancellationRequested') {
                logger.error(LogCategory.FILE_ORGANIZATION, '生成一键整理方案失败', {
                    error: error.message
                });
            }
            throw error;
        }
    }
    prepareDimensionInfo(options, relevantTags) {
        try {
            const dimensions = this.db
                .prepare('SELECT id, name, level, tags, trigger_conditions FROM file_dimensions ORDER BY level ASC')
                .all();
            const panDimensionIds = ConfigOrchestrator.getInstance().getValue('PAN_DIMENSION_IDS') || [];
            const panIdSet = new Set(panDimensionIds);
            const specialDimensions = ['题材'];
            let sharedDefinitions = '';
            const extractedDimNames = new Set();
            for (const dimName of specialDimensions) {
                const dim = dimensions.find(d => d.name === dimName);
                if (dim) {
                    const allTags = dim.tags ? JSON.parse(dim.tags) : [];
                    const tags = relevantTags ? allTags.filter((t) => relevantTags.has(t)) : allTags;
                    if (tags.length > 0) {
                        sharedDefinitions += `${dimName}目录集合 = [${tags.join(',')}]`;
                        extractedDimNames.add(dimName);
                    }
                }
            }
            const baseDimensions = dimensions.filter(d => d.level === 1);
            const potentialSubDimensions = dimensions.filter(d => d.level > 1);
            const getTriggeredDimensions = (parentDimName, tagName) => {
                return potentialSubDimensions.filter(d => {
                    try {
                        const triggers = d.trigger_conditions ? JSON.parse(d.trigger_conditions) : [];
                        if (Array.isArray(triggers) && triggers.length > 0) {
                            return triggers.some((t) => t.parentDimension === parentDimName && t.triggerTags.includes(tagName));
                        }
                    }
                    catch (_e) {
                        /* 解析触发条件失败 */
                    }
                    if (d.name.includes(tagName) && d.level > 1)
                        return true;
                    return false;
                });
            };
            const allDirectoryGroups = [];
            const dimensionMap = {};
            const topLevelDirs = [];
            const collectDirectories = (dim, parentTag = '', depth = 0) => {
                if (depth > 5)
                    return;
                const isPan = panIdSet.has(dim.id);
                const safeParent = parentTag || '';
                if (extractedDimNames.has(dim.name)) {
                    allDirectoryGroups.push({ name: [`{${dim.name}目录集合}`], parent: safeParent });
                    const allParsedTags = dim.tags ? JSON.parse(dim.tags) : [];
                    const tags = relevantTags
                        ? allParsedTags.filter((t) => relevantTags.has(t))
                        : allParsedTags;
                    tags.forEach((tag) => {
                        if (safeParent)
                            dimensionMap[tag] = safeParent;
                        else
                            topLevelDirs.push(tag);
                    });
                    return;
                }
                if (isPan) {
                    allDirectoryGroups.push({ name: [`<${dim.name}>`], parent: safeParent });
                    return;
                }
                const allParsedTags = dim.tags ? JSON.parse(dim.tags) : [];
                const tags = relevantTags
                    ? allParsedTags.filter((t) => relevantTags.has(t))
                    : allParsedTags;
                const tagsToShow = tags.slice(0, 20);
                const displayTags = [...tagsToShow];
                if (tags.length > 20)
                    displayTags.push(`... (共${tags.length}个标签)`);
                if (displayTags.length > 0) {
                    allDirectoryGroups.push({ name: displayTags, parent: safeParent });
                    tags.forEach((tag) => {
                        if (safeParent)
                            dimensionMap[tag] = safeParent;
                        else
                            topLevelDirs.push(tag);
                    });
                }
                for (const tag of tagsToShow) {
                    const subDims = getTriggeredDimensions(dim.name, tag);
                    for (const subDim of subDims) {
                        collectDirectories(subDim, tag, depth + 1);
                    }
                }
            };
            for (const dim of baseDimensions)
                collectDirectories(dim, '');
            let treeDesc = '';
            if (allDirectoryGroups.length > 0) {
                const rows = [];
                for (const group of allDirectoryGroups) {
                    const namesStr = group.name.join(', ');
                    rows.push(`| ${namesStr} | ${group.parent || '根目录'} |`);
                }
                treeDesc = '| 目录候选名称 | 父级目录 |\n| --- | --- |\n' + rows.join('\n');
            }
            if (options) {
                options.dimensionMap = dimensionMap;
                options.topLevelDirs = topLevelDirs;
            }
            return `
#### 共享目录定义
${sharedDefinitions}

#### 参考目录和层级结构
可以从中选取个别name作为目录，所择name必须匹配文件名，否则不能选择。
${treeDesc}
`;
        }
        catch (error) {
            logger.warn(LogCategory.FILE_ORGANIZATION, '[一键整理] 自动获取维度信息失败', {
                error: error.message
            });
            return '';
        }
    }
    prepareDirectoryAnalysis(workspaceDirectoryPath) {
        try {
            const dirResult = this.db
                .prepare(`
         SELECT context_analysis FROM workspace_directories
         WHERE path = ? OR REPLACE(path, '\\', '/') = REPLACE(?, '\\', '/')
       `)
                .get(workspaceDirectoryPath, workspaceDirectoryPath);
            if (dirResult && dirResult.context_analysis) {
                const analysis = JSON.parse(dirResult.context_analysis);
                if (analysis.directoryType) {
                    return {
                        directoryType: analysis.directoryType,
                        recommendedDimensions: analysis.recommendedDimensions || [],
                        recommendedTags: analysis.recommendedTags || {},
                        analysisStrategy: analysis.analysisStrategy || '标准策略',
                        namingPattern: analysis.namingPattern || '[领域]内容描述',
                        confidence: analysis.confidence || 0.5
                    };
                }
            }
        }
        catch (error) {
            logger.warn(LogCategory.FILE_ORGANIZATION, '[一键整理] 自动获取目录分析信息失败', {
                error: error.message
            });
        }
        return null;
    }
}
//# sourceMappingURL=PlanGenerator.js.map