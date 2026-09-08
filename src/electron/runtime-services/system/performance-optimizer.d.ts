/**
 * Performance Optimizer - 性能优化服务
 *
 * 实现模型预热机制、智能批处理、并发控制和性能监控自动调优功能。
 */
import { EventEmitter } from 'events';
import { IChatRequest } from '@firefly/types/llama-server';
/**
 * 性能指标接口
 */
export interface IPerformanceMetrics {
    /** 请求延迟（毫秒） */
    requestLatency: number;
    /** 吞吐量（请求/秒） */
    throughput: number;
    /** 内存使用率（0-1） */
    memoryUsage: number;
    /** CPU使用率（0-1） */
    cpuUsage: number;
    /** GPU使用率（0-1，可选） */
    gpuUsage?: number;
    /** 错误率（0-1） */
    errorRate: number;
    /** 队列长度 */
    queueLength: number;
    /** 活跃请求数 */
    activeRequests: number;
    /** 时间戳 */
    timestamp: Date;
}
/**
 * 性能阈值配置接口
 */
export interface IPerformanceThresholds {
    /** 最大延迟阈值（毫秒） */
    maxLatency: number;
    /** 最小吞吐量阈值（请求/秒） */
    minThroughput: number;
    /** 最大内存使用率阈值（0-1） */
    maxMemoryUsage: number;
    /** 最大CPU使用率阈值（0-1） */
    maxCpuUsage: number;
    /** 最大错误率阈值（0-1） */
    maxErrorRate: number;
    /** 最大队列长度阈值 */
    maxQueueLength: number;
}
/**
 * 预热配置接口
 */
export interface IWarmupConfig {
    /** 是否启用预热 */
    enabled: boolean;
    /** 预热请求数量 */
    requestCount: number;
    /** 预热请求间隔（毫秒） */
    requestInterval: number;
    /** 预热超时时间（毫秒） */
    timeout: number;
    /** 预热请求模板 */
    requestTemplate: IChatRequest;
}
/**
 * 批处理优化配置接口
 */
export interface IBatchOptimizationConfig {
    /** 是否启用智能批处理 */
    enabled: boolean;
    /** 动态批处理大小 */
    dynamicBatchSize: boolean;
    /** 最小批处理大小 */
    minBatchSize: number;
    /** 最大批处理大小 */
    maxBatchSize: number;
    /** 批处理超时时间（毫秒） */
    batchTimeout: number;
    /** 相似度阈值（用于请求分组） */
    similarityThreshold: number;
}
/**
 * 并发优化配置接口
 */
export interface IConcurrencyOptimizationConfig {
    /** 是否启用动态并发控制 */
    enabled: boolean;
    /** 最小并发数 */
    minConcurrency: number;
    /** 最大并发数 */
    maxConcurrency: number;
    /** 并发调整步长 */
    adjustmentStep: number;
    /** 性能评估窗口大小 */
    evaluationWindow: number;
    /** 调整间隔（毫秒） */
    adjustmentInterval: number;
}
/**
 * 性能优化策略接口
 */
export interface IOptimizationStrategy {
    /** 策略名称 */
    name: string;
    /** 策略描述 */
    description: string;
    /** 触发条件 */
    trigger: (metrics: IPerformanceMetrics) => boolean;
    /** 执行动作 */
    action: () => Promise<boolean>;
    /** 优先级（数字越小优先级越高） */
    priority: number;
    /** 冷却时间（毫秒） */
    cooldown: number;
    /** 最后执行时间 */
    lastExecuted: number;
    /** 是否启用 */
    enabled: boolean;
}
/**
 * 性能统计信息接口
 */
export interface IPerformanceStatistics {
    /** 平均延迟（毫秒） */
    avgLatency: number;
    /** 最小延迟（毫秒） */
    minLatency: number;
    /** 最大延迟（毫秒） */
    maxLatency: number;
    /** 平均吞吐量（请求/秒） */
    avgThroughput: number;
    /** 峰值吞吐量（请求/秒） */
    peakThroughput: number;
    /** 总请求数 */
    totalRequests: number;
    /** 成功请求数 */
    successfulRequests: number;
    /** 失败请求数 */
    failedRequests: number;
    /** 优化执行次数 */
    optimizationCount: number;
    /** 统计开始时间 */
    startTime: Date;
    /** 最后更新时间 */
    lastUpdate: Date;
}
/**
 * 预热结果接口
 */
export interface IWarmupResult {
    /** 是否成功 */
    success: boolean;
    /** 执行时间（毫秒） */
    duration: number;
    /** 预热请求数 */
    requestCount: number;
    /** 成功请求数 */
    successfulRequests: number;
    /** 失败请求数 */
    failedRequests: number;
    /** 平均响应时间（毫秒） */
    avgResponseTime: number;
    /** 错误信息 */
    errors: string[];
}
/**
 * 性能优化服务
 */
export declare class PerformanceOptimizer extends EventEmitter {
    private performanceThresholds;
    private warmupConfig;
    private batchOptimizationConfig;
    private concurrencyOptimizationConfig;
    private optimizationStrategies;
    private metricsHistory;
    private statistics;
    private monitoringTimer;
    private isOptimizing;
    private isWarmedUp;
    private lastCpuUsage;
    private requestTimes;
    private requestStartTimes;
    /** 当前生效的并发数（动态调整值，独立于配置中的 minConcurrency/maxConcurrency 边界） */
    private currentConcurrency;
    constructor();
    /**
     * 初始化服务
     */
    private initializeService;
    /**
     * 执行模型预热
     */
    warmupModel(): Promise<IWarmupResult>;
    /**
     * 获取当前性能指标
     */
    getCurrentMetrics(): Promise<IPerformanceMetrics>;
    /**
     * 启动性能监控
     */
    startPerformanceMonitoring(): void;
    /**
     * 停止性能监控
     */
    stopPerformanceMonitoring(): void;
    /**
     * 执行性能优化
     * @param forceOptimization 是否强制优化（忽略冷却时间）
     * @param metrics 已获取的性能指标（由调用方传入可避免重复获取，为空时内部获取）
     */
    optimizePerformance(forceOptimization?: boolean, metrics?: IPerformanceMetrics): Promise<{
        executed: string[];
        skipped: string[];
        errors: string[];
    }>;
    /**
     * 记录请求开始时间
     */
    recordRequestStart(requestId: string): void;
    /**
     * 记录请求完成时间
     */
    recordRequestEnd(requestId: string, success: boolean): void;
    /**
     * 获取性能统计信息
     */
    getPerformanceStatistics(): IPerformanceStatistics;
    /**
     * 获取性能历史
     */
    getPerformanceHistory(limit?: number): IPerformanceMetrics[];
    /**
     * 更新性能阈值
     */
    updatePerformanceThresholds(thresholds: Partial<IPerformanceThresholds>): void;
    /**
     * 更新预热配置
     */
    updateWarmupConfig(config: Partial<IWarmupConfig>): void;
    /**
     * 获取当前配置
     */
    getConfiguration(): {
        thresholds: IPerformanceThresholds;
        warmup: IWarmupConfig;
        batchOptimization: IBatchOptimizationConfig;
        concurrencyOptimization: IConcurrencyOptimizationConfig;
        strategies: IOptimizationStrategy[];
    };
    /**
     * 检查是否已预热
     */
    isModelWarmedUp(): boolean;
    /**
     * 执行性能检查
     */
    private performPerformanceCheck;
    /**
     * 发送预热请求
     */
    private sendWarmupRequest;
    /**
     * 计算CPU使用率
     */
    private calculateCpuUsage;
    /**
     * 计算平均延迟
     */
    private calculateAverageLatency;
    /**
     * 计算吞吐量
     */
    private calculateThroughput;
    /**
     * 计算错误率
     */
    private calculateErrorRate;
    /**
     * 降低并发数
     *
     * 注意：仅调整当前生效并发数（currentConcurrency），
     * 不修改配置中的 maxConcurrency 上限，避免上限被永久性下调后无法回升。
     */
    private reduceConcurrency;
    /**
     * 增加并发数
     *
     * 注意：以配置的 maxConcurrency 作为固定上限，
     * 基于 currentConcurrency 递增；原实现误将上限同时当作当前值参与运算，
     * 导致 newMax 恒等于 currentMax、策略永远返回 false 而周期性报错。
     */
    private increaseConcurrency;
    /**
     * 优化内存
     */
    private optimizeMemory;
    /**
     * 清理队列
     */
    private clearQueue;
    /**
       * 是否存在可立即执行的自动优化策略（触发条件满足且已过冷却期）
       */
    private shouldTriggerAutoOptimization;
    /**
     * 添加到历史记录
     */
    private addToHistory;
    /**
     * 加载配置
     */
    private loadConfiguration;
    /**
     * 保存配置
     */
    private saveConfiguration;
    /**
     * 清理资源
     */
    dispose(): Promise<void>;
}
/**
 * 单例实例
 */
export declare const performanceOptimizer: PerformanceOptimizer;
//# sourceMappingURL=performance-optimizer.d.ts.map