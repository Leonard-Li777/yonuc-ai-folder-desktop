import { LogLevel, LogEntry, AppError, ErrorType } from '@firefly/types';
import { LogCategory } from '@firefly/shared';
/**
 * 日志服务类
 */
export declare class LoggingService {
    private static instance;
    private logEntries;
    private config;
    private constructor();
    /**
     * 动态设置日志过滤级别
     */
    setLevel(level: LogLevel): void;
    private suppressDuplicates;
    private suppressWindowMs;
    private suppressionMap;
    private stableSerialize;
    private makeSuppressionKey;
    /**
     * 获取单例实例
     */
    static getInstance(): LoggingService;
    /**
     * 设置全局错误处理
     */
    private setupGlobalErrorHandling;
    /**
     * 记录错误级别日志
     */
    error(category: LogCategory, message: string, data?: any, stack?: string): void;
    /**
     * 记录警告级别日志
     */
    warn(category: LogCategory, message: string, data?: any): void;
    /**
     * 记录信息级别日志
     */
    info(category: LogCategory, message: string, data?: any): void;
    /**
     * 记录调试级别日志
     */
    debug(category: LogCategory, message: string, data?: any): void;
    /**
     * 记录跟踪级别日志
     */
    trace(category: LogCategory, message: string, data?: any): void;
    /**
     * 记录应用错误
     */
    logAppError(error: AppError): void;
    /**
     * 记录日志
     */
    log(level: LogLevel, category: LogCategory, message: string, data?: any, stack?: string): void;
    /**
     * 递归对日志数据中的字符串值做脱敏处理（文件名 + API Key）
     */
    private sanitizeData;
    /**
     * 格式化数据用于控制台输出（将对象转为带换行缩进的 JSON）
     */
    private formatDataForOutput;
    /**
     * 控制台输出日志
     */
    private logToConsole;
    /**
     * 格式化彩色控制台日志前缀（时间戳 + 级别 + 分类）
     */
    private formatConsolePrefix;
    /**
     * 文件输出日志
     */
    private logToFile;
    /**
     * 轮转日志文件
     */
    private rotateLogFile;
    /**
     * 获取日志条目
     */
    getLogEntries(options?: {
        level?: LogLevel;
        category?: string;
        startTime?: Date;
        endTime?: Date;
        limit?: number;
        offset?: number;
    }): LogEntry[];
    /**
     * 获取错误日志
     */
    getErrorLogs(options?: {
        category?: string;
        startTime?: Date;
        endTime?: Date;
        limit?: number;
    }): LogEntry[];
    /**
     * 获取日志统计信息
     */
    getLogStatistics(): {
        total: number;
        byLevel: Record<string, number>;
        byCategory: Record<string, number>;
        recentErrors: LogEntry[];
    };
    /**
     * 清除日志
     */
    clearLogs(): void;
    /**
     * 清除旧日志
     */
    clearOldLogs(olderThan: Date): void;
    /**
     * 导出日志到文件
     */
    exportLogs(filePath: string, options?: {
        level?: LogLevel;
        category?: string;
        startTime?: Date;
        endTime?: Date;
    }): boolean;
    /**
     * 更新配置
     */
    updateConfig(config: Partial<typeof this.config>): void;
    /**
     * 获取配置
     */
    getConfig(): typeof this.config;
    /**
     * 创建应用错误对象
     */
    createAppError(type: ErrorType, code: string, message: string, details?: any, recoverable?: boolean, context?: any): AppError;
    /**
     * 包装异步函数以添加错误处理和日志记录
     */
    wrapAsyncFunction<T>(fn: () => Promise<T>, category: LogCategory, context?: any): Promise<T>;
    /**
     * 包装同步函数以添加错误处理和日志记录
     */
    wrapSyncFunction<T>(fn: () => T, category: LogCategory, context?: any): T;
}
export declare const loggingService: LoggingService;
//# sourceMappingURL=logging-service.d.ts.map