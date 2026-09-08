/**
 * AI适配器工厂
 * 提供统一的适配器创建和管理接口
 * 实现依赖注入机制的工厂模式
 */
import { LlamaIndexAIService } from '@firefly/electron-llamaIndex-service';
import fixPath from 'fix-path';
// 在 macOS 和 Linux 上修复 PATH 环境变量
if (process.platform !== 'win32') {
    try {
        const fixPathFunc = typeof fixPath === 'function' ? fixPath : fixPath.default;
        if (typeof fixPathFunc === 'function') {
            fixPathFunc();
        }
    }
    catch (e) {
        console.error('Failed to fix PATH in AIAdapterFactory:', e);
    }
}
import { LlamaIndexAIAdapter, CoreEngineAIAdapter } from './llama-index-ai-adapter';
import { logger, LogCategory, isTestEnvironment } from '@firefly/shared';
import { t } from '@app/languages';
/**
 * AI适配器工厂实现类
 * 确保所有适配器都基于同一个LlamaIndexAIService单例
 */
export class AIAdapterFactory {
    static instance = null;
    aiService;
    coreEngineAdapter = null;
    constructor() {
        // 延迟获取LlamaIndexAIService单例实例，避免在单例未初始化时调用
        logger.debug(LogCategory.AI_SERVICE, '[AIAdapterFactory] AI适配器工厂已创建');
    }
    /**
     * 获取AI服务实例（延迟获取，确保单例已初始化）
     */
    getAIServiceInstance() {
        if (!this.aiService) {
            const instance = LlamaIndexAIService.getInstance();
            if (instance) {
                this.aiService = instance;
            }
            else {
                logger.warn(LogCategory.AI_SERVICE, '[AIAdapterFactory] AI服务单例尚未就绪，将在后续重试');
                // 返回一个提示性错误，避免阻塞其他服务的初始化
                throw new Error(t('AI服务未就绪，请稍后重试'));
            }
        }
        return this.aiService;
    }
    /**
     * 获取工厂单例实例
     */
    static getInstance() {
        if (!AIAdapterFactory.instance) {
            AIAdapterFactory.instance = new AIAdapterFactory();
        }
        return AIAdapterFactory.instance;
    }
    /**
     * 创建AI服务适配器
     * @deprecated 使用 getAIService 直接获取服务
     */
    createServiceAdapter() {
        return {
            getAIService: () => this.getAIService()
        };
    }
    /**
     * 创建LlamaIndex AI适配器
     */
    createLlamaAdapter() {
        const llamaAdapter = new LlamaIndexAIAdapter(this.getAIServiceInstance());
        logger.debug(LogCategory.AI_SERVICE, '[AIAdapterFactory] LlamaIndex AI适配器已创建');
        return llamaAdapter;
    }
    /**
     * 创建Core Engine AI适配器
     */
    createCoreEngineAdapter() {
        if (!this.coreEngineAdapter) {
            this.coreEngineAdapter = new CoreEngineAIAdapter();
            logger.debug(LogCategory.AI_SERVICE, '[AIAdapterFactory] Core Engine AI适配器已创建');
        }
        return this.coreEngineAdapter;
    }
    /**
     * 获取AI服务单例
     */
    getAIService() {
        return this.getAIServiceInstance();
    }
    /**
     * 一键设置Core Engine的AI服务
     * 简化依赖注入过程
     */
    setupCoreEngineAI(coreEngine) {
        try {
            logger.info(LogCategory.AI_SERVICE, '[AIAdapterFactory] 开始设置Core Engine AI服务');
            const coreEngineAdapter = this.createCoreEngineAdapter();
            coreEngineAdapter.injectAIService(coreEngine);
            logger.info(LogCategory.AI_SERVICE, '[AIAdapterFactory] Core Engine AI服务设置完成');
        }
        catch (error) {
            logger.error(LogCategory.AI_SERVICE, '[AIAdapterFactory] Core Engine AI服务设置失败:', error);
            throw error;
        }
    }
    /**
     * 清理Core Engine的AI服务
     */
    cleanupCoreEngineAI(coreEngine) {
        try {
            logger.info(LogCategory.AI_SERVICE, '[AIAdapterFactory] 开始清理Core Engine AI服务');
            if (this.coreEngineAdapter) {
                this.coreEngineAdapter.removeAIService(coreEngine);
            }
            logger.info(LogCategory.AI_SERVICE, '[AIAdapterFactory] Core Engine AI服务清理完成');
        }
        catch (error) {
            logger.error(LogCategory.AI_SERVICE, '[AIAdapterFactory] Core Engine AI服务清理失败:', error);
            throw error;
        }
    }
    /**
     * 重置工厂实例（仅用于测试）
     */
    static __dangerouslyResetForTests() {
        if (isTestEnvironment()) {
            AIAdapterFactory.instance = null;
        }
    }
}
/**
 * 便捷函数：获取AI适配器工厂实例
 */
export function getAIAdapterFactory() {
    return AIAdapterFactory.getInstance();
}
/**
 * 便捷函数：快速设置Core Engine AI服务
 */
export function setupCoreEngineAI(coreEngine) {
    const factory = getAIAdapterFactory();
    factory.setupCoreEngineAI(coreEngine);
}
/**
 * 便捷函数：快速清理Core Engine AI服务
 */
export function cleanupCoreEngineAI(coreEngine) {
    const factory = getAIAdapterFactory();
    factory.cleanupCoreEngineAI(coreEngine);
}
//# sourceMappingURL=ai-adapter-factory.js.map