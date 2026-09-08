/**
 * 配置适配器实现
 * 将配置服务 API 适配到核心引擎
 */
import { ConfigOrchestrator } from '@app/electron/config/config-orchestrator';
import { logger, LogCategory, ResourceLocator } from '@firefly/shared';
/**
 * 配置适配器
 */
export class ConfigAdapter {
    get(key) {
        return ConfigOrchestrator.getInstance().getConfig()[key];
    }
    set(key, value) {
        ConfigOrchestrator.getInstance().updateConfig({ [key]: value });
    }
    getLanguage() {
        // 优先从统一配置中获取语言设置 (ConfigKey: DEFAULT_LANGUAGE)
        // 这是为了解决首次启动或配置迁移后，Unified Config 已更新但 rendererConfig 仍为默认值的问题
        const unifiedLanguage = ConfigOrchestrator.getInstance().getValue('DEFAULT_LANGUAGE');
        if (unifiedLanguage) {
            return unifiedLanguage;
        }
        try {
            const rendererLanguage = ConfigOrchestrator.getInstance().getConfig().language;
            if (rendererLanguage) {
                return rendererLanguage;
            }
        }
        catch (error) {
            logger.warn(LogCategory.CONFIG, '读取renderer语言失败，将回退至默认语言', error);
        }
        return 'zh-CN';
    }
    getResourcesPath() {
        return ResourceLocator.getBaseResourceDir();
    }
}
export function getResourcesPath() {
    return ResourceLocator.getBaseResourceDir();
}
/**
 * 创建配置适配器实例
 */
export function createConfigAdapter() {
    return new ConfigAdapter();
}
//# sourceMappingURL=config-adapter.js.map