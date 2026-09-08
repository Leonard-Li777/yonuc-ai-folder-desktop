/**
 * Performance Optimizer - 性能优化服务
 *
 * 实现模型预热机制、智能批处理、并发控制和性能监控自动调优功能。
 */
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { memoryManager } from './memory-manager';
// TODO: 实现这些模块
// import { concurrencyController } from './concurrency-controller';
// import { ConfigOrchestrator } from '@app/electron/config/config-orchestrator'
import { loggingService } from './logging-service';
import { LogCategory } from '@firefly/shared';
import { t } from '@app/languages';
// 临时占位符 - TODO: 实现 concurrencyController
// 注意：getStats 必须返回 queuedRequests 字段，与 getCurrentMetrics 的读取保持一致
const concurrencyController = {
    getStats: () => ({ activeRequests: 0, queuedRequests: 0, maxConcurrency: 4 }),
    updateMaxConcurrency: (_) => { },
    clearQueue: () => { },
    reset: () => { }
};
/**
 * 性能优化服务
 */
export class PerformanceOptimizer extends EventEmitter {
    performanceThresholds;
    warmupConfig;
    batchOptimizationConfig;
    concurrencyOptimizationConfig;
    optimizationStrategies;
    metricsHistory = [];
    statistics;
    monitoringTimer = null;
    isOptimizing = false;
    isWarmedUp = false;
    lastCpuUsage = process.cpuUsage();
    requestTimes = [];
    requestStartTimes = new Map();
    /** 当前生效的并发数（动态调整值，独立于配置中的 minConcurrency/maxConcurrency 边界） */
    currentConcurrency = 4;
    constructor() {
        super();
        // 初始化默认配置
        this.performanceThresholds = {
            maxLatency: 5000, // 5秒
            minThroughput: 1, // 1请求/秒
            maxMemoryUsage: 0.8, // 80%
            maxCpuUsage: 0.8, // 80%
            maxErrorRate: 0.1, // 10%
            maxQueueLength: 50 // 50个请求
        };
        this.warmupConfig = {
            enabled: true,
            requestCount: 5,
            requestInterval: 1000, // 1秒
            timeout: 30000, // 30秒
            requestTemplate: {
                model: 'default',
                messages: [
                    {
                        role: 'user',
                        content: 'Hello, this is a warmup request.'
                    }
                ],
                temperature: 0.4,
                maxTokens: 50
            }
        };
        this.batchOptimizationConfig = {
            enabled: true,
            dynamicBatchSize: true,
            minBatchSize: 2,
            maxBatchSize: 10,
            batchTimeout: 100, // 100毫秒
            similarityThreshold: 0.8
        };
        this.concurrencyOptimizationConfig = {
            enabled: true,
            minConcurrency: 1,
            maxConcurrency: 10,
            adjustmentStep: 1,
            evaluationWindow: 10,
            adjustmentInterval: 30000 // 30秒
        };
        this.optimizationStrategies = [
            {
                name: 'reduce-concurrency',
                description: '降低并发数以减少延迟',
                trigger: metrics => metrics.requestLatency > this.performanceThresholds.maxLatency &&
                    // 边界余量守卫：已处于最小并发数时无需触发，避免策略空跑
                    this.currentConcurrency > this.concurrencyOptimizationConfig.minConcurrency,
                action: async () => this.reduceConcurrency(),
                priority: 1,
                cooldown: 30000,
                lastExecuted: 0,
                enabled: true
            },
            {
                name: 'increase-concurrency',
                description: '增加并发数以提高吞吐量',
                trigger: metrics => metrics.throughput < this.performanceThresholds.minThroughput &&
                    metrics.requestLatency < this.performanceThresholds.maxLatency * 0.5 &&
                    // 边界余量守卫：已达到最大并发数时无需触发，避免策略空跑
                    this.currentConcurrency < this.concurrencyOptimizationConfig.maxConcurrency,
                action: async () => this.increaseConcurrency(),
                priority: 2,
                cooldown: 30000,
                lastExecuted: 0,
                enabled: true
            },
            {
                name: 'optimize-memory',
                description: '优化内存使用',
                trigger: metrics => metrics.memoryUsage > this.performanceThresholds.maxMemoryUsage,
                action: async () => this.optimizeMemory(),
                priority: 3,
                cooldown: 60000,
                lastExecuted: 0,
                enabled: true
            },
            {
                name: 'clear-queue',
                description: '清理过长的请求队列',
                trigger: metrics => metrics.queueLength > this.performanceThresholds.maxQueueLength,
                action: async () => this.clearQueue(),
                priority: 4,
                cooldown: 10000,
                lastExecuted: 0,
                enabled: true
            }
        ];
        this.statistics = {
            avgLatency: 0,
            minLatency: Infinity,
            maxLatency: 0,
            avgThroughput: 0,
            peakThroughput: 0,
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            optimizationCount: 0,
            startTime: new Date(),
            lastUpdate: new Date()
        };
        this.initializeService();
    }
    /**
     * 初始化服务
     */
    async initializeService() {
        try {
            // 从配置加载设置
            await this.loadConfiguration();
            // 启动性能监控
            this.startPerformanceMonitoring();
            loggingService.info(LogCategory.PERFORMANCE_OPTIMIZER, '性能优化服务初始化完成');
            this.emit('service-initialized');
        }
        catch (error) {
            loggingService.error(LogCategory.PERFORMANCE_OPTIMIZER, '服务初始化失败', error);
            this.emit('service-error', error);
        }
    }
    /**
     * 执行模型预热
     */
    async warmupModel() {
        if (!this.warmupConfig.enabled) {
            return {
                success: false,
                duration: 0,
                requestCount: 0,
                successfulRequests: 0,
                failedRequests: 0,
                avgResponseTime: 0,
                errors: ['预热功能未启用']
            };
        }
        const startTime = performance.now();
        const errors = [];
        let successfulRequests = 0;
        let failedRequests = 0;
        const responseTimes = [];
        try {
            loggingService.info(LogCategory.PERFORMANCE_OPTIMIZER, '开始模型预热');
            this.emit('warmup-started');
            for (let i = 0; i < this.warmupConfig.requestCount; i++) {
                try {
                    const requestStart = performance.now();
                    // 发送预热请求
                    await this.sendWarmupRequest();
                    const requestTime = performance.now() - requestStart;
                    responseTimes.push(requestTime);
                    successfulRequests++;
                    loggingService.debug(LogCategory.PERFORMANCE_OPTIMIZER, `预热请求 ${i + 1}/${this.warmupConfig.requestCount} 完成，耗时: ${requestTime.toFixed(2)}ms`);
                    // 等待间隔
                    if (i < this.warmupConfig.requestCount - 1) {
                        await new Promise(resolve => setTimeout(resolve, this.warmupConfig.requestInterval));
                    }
                }
                catch (error) {
                    failedRequests++;
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    errors.push(`预热请求 ${i + 1} 失败: ${errorMessage}`);
                    loggingService.warn(LogCategory.PERFORMANCE_OPTIMIZER, `预热请求 ${i + 1} 失败`, error);
                }
            }
            const duration = performance.now() - startTime;
            const avgResponseTime = responseTimes.length > 0
                ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
                : 0;
            const result = {
                success: successfulRequests > 0,
                duration,
                requestCount: this.warmupConfig.requestCount,
                successfulRequests,
                failedRequests,
                avgResponseTime,
                errors
            };
            if (result.success) {
                this.isWarmedUp = true;
                loggingService.info(LogCategory.PERFORMANCE_OPTIMIZER, `模型预热完成，成功: ${successfulRequests}/${this.warmupConfig.requestCount}，平均响应时间: ${avgResponseTime.toFixed(2)}ms`);
            }
            else {
                loggingService.error(LogCategory.PERFORMANCE_OPTIMIZER, '模型预热失败', { errors });
            }
            this.emit('warmup-completed', result);
            return result;
        }
        catch (error) {
            const duration = performance.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            const result = {
                success: false,
                duration,
                requestCount: this.warmupConfig.requestCount,
                successfulRequests,
                failedRequests: this.warmupConfig.requestCount - successfulRequests,
                avgResponseTime: 0,
                errors: [errorMessage]
            };
            loggingService.error(LogCategory.PERFORMANCE_OPTIMIZER, '模型预热异常', error);
            this.emit('warmup-failed', result);
            return result;
        }
    }
    /**
     * 获取当前性能指标
     */
    async getCurrentMetrics() {
        const startTime = performance.now();
        try {
            // 获取内存信息
            const memoryInfo = await memoryManager.getCurrentMemoryInfo();
            // 获取并发统计
            const concurrencyStats = concurrencyController.getStats();
            // 计算CPU使用率
            const cpuUsage = this.calculateCpuUsage();
            // 计算请求延迟
            const requestLatency = this.calculateAverageLatency();
            // 计算吞吐量
            const throughput = this.calculateThroughput();
            // 计算错误率
            const errorRate = this.calculateErrorRate();
            const metrics = {
                requestLatency,
                throughput,
                memoryUsage: memoryInfo.systemMemoryUsage,
                cpuUsage,
                errorRate,
                queueLength: concurrencyStats.queuedRequests,
                activeRequests: concurrencyStats.activeRequests,
                timestamp: new Date()
            };
            const executionTime = performance.now() - startTime;
            // trace 级别：仅在全量跟踪日志时查看，避免每轮定时检查刷屏
            loggingService.trace(LogCategory.PERFORMANCE_OPTIMIZER, `性能指标获取完成，耗时: ${executionTime.toFixed(2)}ms`);
            return metrics;
        }
        catch (error) {
            loggingService.error(LogCategory.PERFORMANCE_OPTIMIZER, '获取性能指标失败', error);
            throw error;
        }
    }
    /**
     * 启动性能监控
     */
    startPerformanceMonitoring() {
        if (this.monitoringTimer) {
            this.stopPerformanceMonitoring();
        }
        const monitoringInterval = 10000; // 10秒
        this.monitoringTimer = setInterval(async () => {
            try {
                await this.performPerformanceCheck();
            }
            catch (error) {
                loggingService.error(LogCategory.PERFORMANCE_OPTIMIZER, '性能检查失败', error);
            }
        }, monitoringInterval);
        loggingService.info(LogCategory.PERFORMANCE_OPTIMIZER, `性能监控已启动，间隔: ${monitoringInterval}ms`);
        this.emit('monitoring-started');
    }
    /**
     * 停止性能监控
     */
    stopPerformanceMonitoring() {
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = null;
            loggingService.info(LogCategory.PERFORMANCE_OPTIMIZER, '性能监控已停止');
            this.emit('monitoring-stopped');
        }
    }
    /**
     * 执行性能优化
     * @param forceOptimization 是否强制优化（忽略冷却时间）
     * @param metrics 已获取的性能指标（由调用方传入可避免重复获取，为空时内部获取）
     */
    async optimizePerformance(forceOptimization = false, metrics) {
        if (this.isOptimizing && !forceOptimization) {
            throw new Error(t('性能优化正在进行中'));
        }
        this.isOptimizing = true;
        const executed = [];
        const skipped = [];
        const errors = [];
        try {
            loggingService.info(LogCategory.PERFORMANCE_OPTIMIZER, '开始性能优化');
            this.emit('optimization-started');
            // 获取当前性能指标（复用调用方已获取的指标，避免重复计算）
            const currentMetrics = metrics ?? (await this.getCurrentMetrics());
            // 选择适用的优化策略
            const applicableStrategies = this.optimizationStrategies
                .filter(strategy => strategy.enabled && strategy.trigger(currentMetrics))
                .sort((a, b) => a.priority - b.priority);
            if (applicableStrategies.length === 0) {
                loggingService.info(LogCategory.PERFORMANCE_OPTIMIZER, '没有需要执行的优化策略');
                return { executed, skipped, errors };
            }
            // 执行优化策略
            for (const strategy of applicableStrategies) {
                const now = Date.now();
                // 检查冷却时间
                if (!forceOptimization && now - strategy.lastExecuted < strategy.cooldown) {
                    skipped.push(strategy.name);
                    loggingService.debug(LogCategory.PERFORMANCE_OPTIMIZER, `跳过策略 ${strategy.name}，仍在冷却期`);
                    continue;
                }
                try {
                    const success = await strategy.action();
                    strategy.lastExecuted = now;
                    if (success) {
                        executed.push(strategy.name);
                        loggingService.info(LogCategory.PERFORMANCE_OPTIMIZER, `优化策略执行成功: ${strategy.name}`);
                    }
                    else {
                        errors.push(`策略 ${strategy.name} 执行失败`);
                        loggingService.warn(LogCategory.PERFORMANCE_OPTIMIZER, `优化策略执行失败: ${strategy.name}`);
                    }
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    errors.push(`策略 ${strategy.name} 执行异常: ${errorMessage}`);
                    loggingService.error(LogCategory.PERFORMANCE_OPTIMIZER, `优化策略执行异常: ${strategy.name}`, error);
                }
            }
            // 更新统计信息
            this.statistics.optimizationCount++;
            this.statistics.lastUpdate = new Date();
            loggingService.info(LogCategory.PERFORMANCE_OPTIMIZER, `性能优化完成，执行: ${executed.length}，跳过: ${skipped.length}，错误: ${errors.length}`);
            this.emit('optimization-completed', { executed, skipped, errors });
            return { executed, skipped, errors };
        }
        catch (error) {
            loggingService.error(LogCategory.PERFORMANCE_OPTIMIZER, '性能优化失败', error);
            this.emit('optimization-failed', { error });
            throw error;
        }
        finally {
            this.isOptimizing = false;
        }
    }
    /**
     * 记录请求开始时间
     */
    recordRequestStart(requestId) {
        this.requestStartTimes.set(requestId, performance.now());
    }
    /**
     * 记录请求完成时间
     */
    recordRequestEnd(requestId, success) {
        const startTime = this.requestStartTimes.get(requestId);
        if (startTime) {
            const duration = performance.now() - startTime;
            this.requestTimes.push(duration);
            this.requestStartTimes.delete(requestId);
            // 保持请求时间数组在合理大小
            if (this.requestTimes.length > 1000) {
                this.requestTimes = this.requestTimes.slice(-1000);
            }
            // 更新统计信息
            this.statistics.totalRequests++;
            if (success) {
                this.statistics.successfulRequests++;
            }
            else {
                this.statistics.failedRequests++;
            }
            // 更新延迟统计
            if (duration < this.statistics.minLatency) {
                this.statistics.minLatency = duration;
            }
            if (duration > this.statistics.maxLatency) {
                this.statistics.maxLatency = duration;
            }
            this.statistics.lastUpdate = new Date();
        }
    }
    /**
     * 获取性能统计信息
     */
    getPerformanceStatistics() {
        // 计算平均延迟
        if (this.requestTimes.length > 0) {
            this.statistics.avgLatency =
                this.requestTimes.reduce((sum, time) => sum + time, 0) / this.requestTimes.length;
        }
        return { ...this.statistics };
    }
    /**
     * 获取性能历史
     */
    getPerformanceHistory(limit) {
        const history = [...this.metricsHistory];
        return limit ? history.slice(-limit) : history;
    }
    /**
     * 更新性能阈值
     */
    updatePerformanceThresholds(thresholds) {
        this.performanceThresholds = { ...this.performanceThresholds, ...thresholds };
        this.saveConfiguration();
        loggingService.info(LogCategory.PERFORMANCE_OPTIMIZER, '性能阈值已更新', thresholds);
        this.emit('thresholds-updated', this.performanceThresholds);
    }
    /**
     * 更新预热配置
     */
    updateWarmupConfig(config) {
        this.warmupConfig = { ...this.warmupConfig, ...config };
        this.saveConfiguration();
        loggingService.info(LogCategory.PERFORMANCE_OPTIMIZER, '预热配置已更新', config);
        this.emit('warmup-config-updated', this.warmupConfig);
    }
    /**
     * 获取当前配置
     */
    getConfiguration() {
        return {
            thresholds: { ...this.performanceThresholds },
            warmup: { ...this.warmupConfig },
            batchOptimization: { ...this.batchOptimizationConfig },
            concurrencyOptimization: { ...this.concurrencyOptimizationConfig },
            strategies: [...this.optimizationStrategies]
        };
    }
    /**
     * 检查是否已预热
     */
    isModelWarmedUp() {
        return this.isWarmedUp;
    }
    /**
     * 执行性能检查
     */
    async performPerformanceCheck() {
        try {
            const metrics = await this.getCurrentMetrics();
            // 添加到历史记录
            this.addToHistory(metrics);
            // 发送性能指标更新事件
            this.emit('metrics-updated', metrics);
            // 检查是否需要自动优化（复用本次已获取的指标，避免重复计算）
            if (this.shouldTriggerAutoOptimization(metrics)) {
                try {
                    await this.optimizePerformance(false, metrics);
                }
                catch (error) {
                    loggingService.warn(LogCategory.PERFORMANCE_OPTIMIZER, '自动性能优化失败', error);
                }
            }
        }
        catch (error) {
            loggingService.error(LogCategory.PERFORMANCE_OPTIMIZER, '性能检查执行失败', error);
        }
    }
    /**
     * 发送预热请求
     */
    async sendWarmupRequest() {
        // 这里应该调用实际的HTTP客户端发送请求
        // 为了简化，我们模拟一个请求
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    }
    /**
     * 计算CPU使用率
     */
    calculateCpuUsage() {
        const currentUsage = process.cpuUsage(this.lastCpuUsage);
        this.lastCpuUsage = process.cpuUsage();
        const totalUsage = currentUsage.user + currentUsage.system;
        const totalTime = 1000000; // 1秒 = 1,000,000微秒
        return Math.min(totalUsage / totalTime, 1);
    }
    /**
     * 计算平均延迟
     */
    calculateAverageLatency() {
        if (this.requestTimes.length === 0)
            return 0;
        const recentTimes = this.requestTimes.slice(-10); // 最近10个请求
        return recentTimes.reduce((sum, time) => sum + time, 0) / recentTimes.length;
    }
    /**
     * 计算吞吐量
     */
    calculateThroughput() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000; // 1分钟前
        // 计算最近1分钟内完成的请求数
        const recentRequests = this.requestTimes.filter((_, index) => {
            const requestTime = now - (this.requestTimes.length - index) * 1000; // 粗略估算
            return requestTime > oneMinuteAgo;
        });
        return recentRequests.length / 60; // 请求/秒
    }
    /**
     * 计算错误率
     */
    calculateErrorRate() {
        if (this.statistics.totalRequests === 0)
            return 0;
        return this.statistics.failedRequests / this.statistics.totalRequests;
    }
    /**
     * 降低并发数
     *
     * 注意：仅调整当前生效并发数（currentConcurrency），
     * 不修改配置中的 maxConcurrency 上限，避免上限被永久性下调后无法回升。
     */
    async reduceConcurrency() {
        try {
            const previous = this.currentConcurrency;
            const newCurrent = Math.max(previous - this.concurrencyOptimizationConfig.adjustmentStep, this.concurrencyOptimizationConfig.minConcurrency);
            if (newCurrent < previous) {
                concurrencyController.updateMaxConcurrency(newCurrent);
                this.currentConcurrency = newCurrent;
                loggingService.info(LogCategory.PERFORMANCE_OPTIMIZER, `并发数已降低: ${previous} -> ${newCurrent}`);
                return true;
            }
            // 已处于最小并发数，属于正常边界情况而非失败
            loggingService.debug(LogCategory.PERFORMANCE_OPTIMIZER, '并发数已处于下限，无需降低');
            return true;
        }
        catch (error) {
            loggingService.error(LogCategory.PERFORMANCE_OPTIMIZER, '降低并发数失败', error);
            return false;
        }
    }
    /**
     * 增加并发数
     *
     * 注意：以配置的 maxConcurrency 作为固定上限，
     * 基于 currentConcurrency 递增；原实现误将上限同时当作当前值参与运算，
     * 导致 newMax 恒等于 currentMax、策略永远返回 false 而周期性报错。
     */
    async increaseConcurrency() {
        try {
            const previous = this.currentConcurrency;
            const newCurrent = Math.min(previous + this.concurrencyOptimizationConfig.adjustmentStep, this.concurrencyOptimizationConfig.maxConcurrency);
            if (newCurrent > previous) {
                concurrencyController.updateMaxConcurrency(newCurrent);
                this.currentConcurrency = newCurrent;
                loggingService.info(LogCategory.PERFORMANCE_OPTIMIZER, `并发数已增加: ${previous} -> ${newCurrent}`);
                return true;
            }
            // 已达到最大并发数上限，属于正常边界情况而非失败
            loggingService.debug(LogCategory.PERFORMANCE_OPTIMIZER, '并发数已处于上限，无需增加');
            return true;
        }
        catch (error) {
            loggingService.error(LogCategory.PERFORMANCE_OPTIMIZER, '增加并发数失败', error);
            return false;
        }
    }
    /**
     * 优化内存
     */
    async optimizeMemory() {
        try {
            const result = (await memoryManager.optimizeMemory?.()) || [];
            const totalMemoryReleased = result.reduce((sum, r) => sum + (r.success ? r.memoryReleased : 0), 0);
            loggingService.info(LogCategory.PERFORMANCE_OPTIMIZER, `内存优化完成，释放内存: ${totalMemoryReleased}MB`);
            return totalMemoryReleased > 0;
        }
        catch (error) {
            loggingService.error(LogCategory.PERFORMANCE_OPTIMIZER, '内存优化失败', error);
            return false;
        }
    }
    /**
     * 清理队列
     */
    async clearQueue() {
        try {
            const statsBefore = concurrencyController.getStats();
            concurrencyController.clearQueue();
            const statsAfter = concurrencyController.getStats();
            const clearedRequests = statsBefore.queuedRequests - statsAfter.queuedRequests;
            loggingService.info(LogCategory.PERFORMANCE_OPTIMIZER, `队列已清理，清除请求数: ${clearedRequests}`);
            return clearedRequests > 0;
        }
        catch (error) {
            loggingService.error(LogCategory.PERFORMANCE_OPTIMIZER, '清理队列失败', error);
            return false;
        }
    }
    /**
       * 是否存在可立即执行的自动优化策略（触发条件满足且已过冷却期）
       */
    shouldTriggerAutoOptimization(metrics) {
        const now = Date.now();
        return this.optimizationStrategies.some(strategy => strategy.enabled &&
            strategy.trigger(metrics) &&
            now - strategy.lastExecuted >= strategy.cooldown);
    }
    /**
     * 添加到历史记录
     */
    addToHistory(metrics) {
        this.metricsHistory.push(metrics);
        // 保持历史记录在合理大小
        if (this.metricsHistory.length > 1000) {
            this.metricsHistory = this.metricsHistory.slice(-1000);
        }
    }
    /**
     * 加载配置
     */
    async loadConfiguration() {
        try {
            // 从配置中加载性能相关设置（如果存在）
            // 这里我们使用默认配置，实际项目中可以扩展AppConfig或使用单独的配置文件
            loggingService.debug(LogCategory.PERFORMANCE_OPTIMIZER, '配置加载完成');
        }
        catch (error) {
            loggingService.warn(LogCategory.PERFORMANCE_OPTIMIZER, '加载配置失败，使用默认配置', error);
        }
    }
    /**
     * 保存配置
     */
    saveConfiguration() {
        try {
            // 这里可以将配置保存到单独的文件或扩展AppConfig
            // 暂时跳过保存，使用内存中的配置
            loggingService.debug(LogCategory.PERFORMANCE_OPTIMIZER, '配置保存完成');
        }
        catch (error) {
            loggingService.error(LogCategory.PERFORMANCE_OPTIMIZER, '保存配置失败', error);
        }
    }
    /**
     * 清理资源
     */
    async dispose() {
        this.stopPerformanceMonitoring();
        this.removeAllListeners();
        this.metricsHistory = [];
        this.requestTimes = [];
        this.requestStartTimes.clear();
        loggingService.info(LogCategory.PERFORMANCE_OPTIMIZER, '性能优化服务已清理');
    }
}
/**
 * 单例实例
 */
export const performanceOptimizer = new PerformanceOptimizer();
//# sourceMappingURL=performance-optimizer.js.map