/**
 * 日志记录器适配器实现
 * 将日志功能适配到核心引擎
 */
import { logger } from '@firefly/shared';
/**
 * 日志记录器适配器
 */
export class LoggerAdapter {
    info(category, message, ...args) {
        logger.info(this.mapCategory(category), message, ...args);
    }
    warn(category, message, ...args) {
        logger.warn(this.mapCategory(category), message, ...args);
    }
    error(category, message, ...args) {
        logger.error(this.mapCategory(category), message, ...args);
    }
    debug(category, message, ...args) {
        logger.debug(this.mapCategory(category), message, ...args);
    }
    /**
     * 映射日志类别
     */
    mapCategory(category) {
        // 标准 LogCategory 枚举直接透传
        return category;
    }
}
/**
 * 创建日志记录器适配器实例
 */
export function createLoggerAdapter() {
    return new LoggerAdapter();
}
//# sourceMappingURL=logger-adapter.js.map