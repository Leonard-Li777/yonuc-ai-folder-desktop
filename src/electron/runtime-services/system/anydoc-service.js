import { LogCategory, logger } from '@firefly/shared';
import { omniService } from './omni-service';
export class AnydocService {
    static instance;
    constructor() { }
    static getInstance() {
        if (!AnydocService.instance) {
            AnydocService.instance = new AnydocService();
        }
        return AnydocService.instance;
    }
    /**
     * 提取文档文本与 Markdown 内容 (全面由 Omni Rust 原生微服务接管)
     */
    async extract(filePath, _timeoutMs = 60000) {
        try {
            const omniData = await omniService.extract(filePath);
            const rawContent = omniData?.markdown_content || '';
            const isBinaryNulSkip = rawContent.includes('[Binary File] NUL byte detected');
            return {
                content: isBinaryNulSkip ? '' : rawContent,
                assets: [],
                metadata: omniData?.metadata,
                phash: omniData?.phash,
                benchmark: omniData?.benchmark
            };
        }
        catch (error) {
            logger.warn(LogCategory.ANALYSIS_QUEUE, `[AnydocService] 提取异常 (${filePath}):`, error?.message || error);
            return {
                content: '',
                assets: []
            };
        }
    }
    /**
     * 原生多模态感知 (聚合元数据 + 物理事实 + 视觉标签 + 语音转录 + 逆地理)
     * 若 Omni 原生感知失败，平滑降级执行标准 extract
     */
    async perceive(filePath, options) {
        try {
            const perception = await omniService.perceive(filePath, options);
            if (perception) {
                const rawContent = perception.markdown_content || '';
                const isBinaryNulSkip = rawContent.includes('[Binary File] NUL byte detected');
                return {
                    content: isBinaryNulSkip ? '' : rawContent,
                    assets: [],
                    metadata: perception.metadata,
                    phash: perception.phash,
                    benchmark: perception.benchmark
                        ? {
                            total_ms: perception.benchmark.total_ms,
                            magika_ms: perception.benchmark.magika_ms,
                            metadata_ms: perception.benchmark.metadata_ms,
                            tag_ms: perception.benchmark.tag_ms,
                            text_ms: perception.benchmark.text_ms,
                            ocr_ms: perception.benchmark.ocr_ms
                        }
                        : undefined,
                    perception
                };
            }
        }
        catch (error) {
            logger.warn(LogCategory.ANALYSIS_QUEUE, `[AnydocService] 原生多模态感知异常 (${filePath})，回退至基础提取:`, error?.message || error);
        }
        return this.extract(filePath, options?.timeoutMs);
    }
}
export const anydocService = AnydocService.getInstance();
//# sourceMappingURL=anydoc-service.js.map