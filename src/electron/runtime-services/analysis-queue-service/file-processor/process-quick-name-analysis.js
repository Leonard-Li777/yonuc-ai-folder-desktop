import { LogCategory, logger } from '@firefly/shared';
import { t } from '@app/languages';
/**
 * 处理快速命名模式下的本地 AI 分析任务
 * 单步生成智能文件名与维度标签，跳过 Stage 3 质量评分与 Stage 4 复杂描述分析
 */
export async function processQuickNameAnalysis(item, fileFingerprint, fileInfo, thumbnailRelativePath, rootWorkspaceDirPath, timer, deps, options, updateItemStatus, processNewDimensionSuggestions) {
    const { language, directoryContext, magikaCategory, isSpeedy } = options;
    // ========== 快速命名阶段：跳过 Stage 3 质量评分，直接执行 Stage 4 智能命名与维度分析 ==========
    updateItemStatus(item.id, 'analyzing', 25, undefined, { analysisStage: 4 });
    if (!deps.dimensionAnalyzer || !deps.fileDimensionService) {
        throw new Error(t('AI 服务未就绪'));
    }
    const existingDimensions = await deps.fileDimensionService.getDimensionsByLanguage(language);
    const filePath = fileInfo.path;
    const fileType = fileInfo.type;
    const processResult = {
        content: fileInfo.content || '',
        metadata: fileInfo.metadata || {},
        qualityScore: undefined,
        qualityConfidence: undefined,
        qualityReasoning: undefined,
        qualityCriteria: undefined,
        multimodalContent: undefined,
        lrc: undefined
    };
    timer.start('dimensionAnalysis');
    logger.info(LogCategory.ANALYSIS_QUEUE, `[快速命名] 执行快速AI分析分支: ${item.name}`);
    const dimResult = await deps.dimensionAnalyzer.quickAnalyzeFile(filePath, item.name, fileType, fileInfo.size, processResult.content, processResult.metadata, existingDimensions, directoryContext, magikaCategory, isSpeedy);
    if (dimResult) {
        await deps.dimensionAnalyzer.saveDimensionAnalysisResults(fileFingerprint, filePath, dimResult, processResult.metadata, magikaCategory);
        if (dimResult.newDimensions) {
            await processNewDimensionSuggestions(dimResult.newDimensions, fileFingerprint);
        }
    }
    timer.end('dimensionAnalysis');
    return { processResult, dimResult };
}
//# sourceMappingURL=process-quick-name-analysis.js.map