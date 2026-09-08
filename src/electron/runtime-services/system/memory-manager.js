/**
 * Memory Manager - 内存管理服务
 *
 * 实现智能模型内存管理机制、内存使用监控和自动优化、
 * 以及内存不足时的降级策略。
 *
 * NOTE: 此服务已重构为 Electron-agnostic。
 * llama-server-service, llama-model-manager, config-service 等服务保留在 apps/desktop 中。
 * 如需使用这些功能,请通过依赖注入或配置传入。
 */
import { EventEmitter } from 'events';
import os from 'os';
import { performance } from 'perf_hooks';
import { loggingService } from './logging-service';
import { LogCategory } from '@firefly/shared';
/**
 * 内存使用状态枚举
 */
export var MemoryStatus;
(function (MemoryStatus) {
    /** 正常状态 */
    MemoryStatus["NORMAL"] = "normal";
    /** 警告状态 */
    MemoryStatus["WARNING"] = "warning";
    /** 危险状态 */
    MemoryStatus["CRITICAL"] = "critical";
    /** 内存不足 */
    MemoryStatus["OUT_OF_MEMORY"] = "out-of-memory";
})(MemoryStatus || (MemoryStatus = {}));
/**
 * 内存管理服务
 *
 * NOTE: 此类已重构为 Electron-agnostic,不再直接依赖 llama-server 相关服务。
 * 模型相关的内存估算功能已被简化或移除,应在 apps/desktop 层实现。
 */
export class MemoryManager extends EventEmitter {
    memoryThresholds;
    monitoringConfig;
    optimizationStrategies;
    memoryHistory = [];
    statistics;
    monitoringTimer = null;
    isOptimizing = false;
    lastOptimizationTime = 0;
    gcForced = false;
    constructor() {
        super();
        // 初始化默认配置
        this.memoryThresholds = {
            warningThreshold: 0.75, // 75%
            criticalThreshold: 0.85, // 85%
            outOfMemoryThreshold: 512, // 512MB
            modelMemoryReserve: 1024, // 1GB
            systemMemoryReserve: 2048 // 2GB
        };
        this.monitoringConfig = {
            monitoringInterval: 5000, // 5秒
            enableAutoOptimization: true,
            historyRetentionTime: 3600000, // 1小时
            maxHistoryRecords: 720, // 最多720条记录（1小时，5秒间隔）
            enableDetailedLogging: false
        };
        this.optimizationStrategies = [
            {
                name: 'force-gc',
                description: '强制垃圾回收',
                trigger: MemoryStatus.WARNING,
                expectedMemoryRelease: 100,
                priority: 1,
                enabled: true
            },
            {
                name: 'clear-cache',
                description: '清理应用缓存',
                trigger: MemoryStatus.WARNING,
                expectedMemoryRelease: 200,
                priority: 2,
                enabled: true
            }
        ];
        this.statistics = {
            avgMemoryUsage: 0,
            peakMemoryUsage: 0,
            optimizationCount: 0,
            warningCount: 0,
            criticalCount: 0,
            outOfMemoryCount: 0,
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
            // 启动内存监控
            this.startMemoryMonitoring();
            loggingService.info(LogCategory.MEMORY_MANAGER, '内存管理服务初始化完成');
            this.emit('service-initialized');
        }
        catch (error) {
            loggingService.error(LogCategory.MEMORY_MANAGER, '服务初始化失败', error);
            this.emit('service-error', error);
        }
    }
    /**
     * 获取当前内存信息
     */
    async getCurrentMemoryInfo() {
        const startTime = performance.now();
        try {
            // 获取系统内存信息
            const totalSystemMemory = Math.round(os.totalmem() / (1024 * 1024));
            const freeSystemMemory = Math.round(os.freemem() / (1024 * 1024));
            const usedSystemMemory = totalSystemMemory - freeSystemMemory;
            const systemMemoryUsage = usedSystemMemory / totalSystemMemory;
            // 获取进程内存信息
            const processMemory = process.memoryUsage();
            const processMemoryUsage = Math.round(processMemory.rss / (1024 * 1024));
            // 模型内存使用设为0（需要在 apps/desktop 层通过依赖注入提供）
            const modelMemoryUsage = 0;
            // 计算可用内存
            const availableMemory = freeSystemMemory - this.memoryThresholds.systemMemoryReserve;
            // 确定内存状态
            const status = this.determineMemoryStatus(systemMemoryUsage, availableMemory, modelMemoryUsage);
            const memoryInfo = {
                totalSystemMemory,
                freeSystemMemory,
                usedSystemMemory,
                systemMemoryUsage,
                processMemoryUsage,
                modelMemoryUsage,
                availableMemory,
                status,
                timestamp: new Date()
            };
            const executionTime = performance.now() - startTime;
            if (this.monitoringConfig.enableDetailedLogging) {
                loggingService.debug(LogCategory.MEMORY_MANAGER, `内存信息获取完成，耗时: ${executionTime.toFixed(2)}ms`, memoryInfo);
            }
            return memoryInfo;
        }
        catch (error) {
            loggingService.error(LogCategory.MEMORY_MANAGER, '获取内存信息失败', error);
            throw error;
        }
    }
    /**
     * 启动内存监控
     */
    startMemoryMonitoring() {
        if (this.monitoringTimer) {
            this.stopMemoryMonitoring();
        }
        this.monitoringTimer = setInterval(async () => {
            try {
                await this.performMemoryCheck();
            }
            catch (error) {
                loggingService.error(LogCategory.MEMORY_MANAGER, '内存检查失败', error);
            }
        }, this.monitoringConfig.monitoringInterval);
        loggingService.info(LogCategory.MEMORY_MANAGER, `内存监控已启动，间隔: ${this.monitoringConfig.monitoringInterval}ms`);
        this.emit('monitoring-started');
    }
    /**
     * 停止内存监控
     */
    stopMemoryMonitoring() {
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = null;
            loggingService.info(LogCategory.MEMORY_MANAGER, '内存监控已停止');
            this.emit('monitoring-stopped');
        }
    }
    /**
     * 获取内存使用历史
     */
    getMemoryHistory(limit) {
        const history = [...this.memoryHistory];
        return limit ? history.slice(-limit) : history;
    }
    /**
     * 获取内存统计信息
     */
    getMemoryStatistics() {
        return { ...this.statistics };
    }
    /**
     * 更新内存阈值配置
     */
    updateMemoryThresholds(thresholds) {
        this.memoryThresholds = { ...this.memoryThresholds, ...thresholds };
        loggingService.info(LogCategory.MEMORY_MANAGER, '内存阈值配置已更新', thresholds);
        this.emit('thresholds-updated', this.memoryThresholds);
    }
    /**
     * 更新监控配置
     */
    updateMonitoringConfig(config) {
        const oldInterval = this.monitoringConfig.monitoringInterval;
        this.monitoringConfig = { ...this.monitoringConfig, ...config };
        // 如果监控间隔改变，重启监控
        if (config.monitoringInterval && config.monitoringInterval !== oldInterval) {
            this.startMemoryMonitoring();
        }
        loggingService.info(LogCategory.MEMORY_MANAGER, '监控配置已更新', config);
        this.emit('monitoring-config-updated', this.monitoringConfig);
    }
    /**
     * 获取当前配置
     */
    getConfiguration() {
        return {
            thresholds: { ...this.memoryThresholds },
            monitoring: { ...this.monitoringConfig },
            strategies: [...this.optimizationStrategies]
        };
    }
    /**
     * 执行内存检查
     */
    async performMemoryCheck() {
        try {
            const memoryInfo = await this.getCurrentMemoryInfo();
            // 添加到历史记录
            this.addToHistory(memoryInfo);
            // 更新统计信息
            this.updateStatistics(memoryInfo);
            // 发送内存状态事件
            this.emit('memory-status-updated', memoryInfo);
        }
        catch (error) {
            loggingService.error(LogCategory.MEMORY_MANAGER, '内存检查执行失败', error);
        }
    }
    /**
     * 确定内存状态
     */
    determineMemoryStatus(systemMemoryUsage, availableMemory, modelMemoryUsage) {
        // 检查内存不足
        if (availableMemory < this.memoryThresholds.outOfMemoryThreshold) {
            return MemoryStatus.OUT_OF_MEMORY;
        }
        // 检查危险状态
        if (systemMemoryUsage >= this.memoryThresholds.criticalThreshold) {
            return MemoryStatus.CRITICAL;
        }
        // 检查警告状态
        if (systemMemoryUsage >= this.memoryThresholds.warningThreshold) {
            return MemoryStatus.WARNING;
        }
        return MemoryStatus.NORMAL;
    }
    /**
     * 添加到历史记录
     */
    addToHistory(memoryInfo) {
        this.memoryHistory.push(memoryInfo);
        // 清理过期记录
        const now = Date.now();
        this.memoryHistory = this.memoryHistory.filter(info => now - info.timestamp.getTime() < this.monitoringConfig.historyRetentionTime);
        // 限制记录数量
        if (this.memoryHistory.length > this.monitoringConfig.maxHistoryRecords) {
            this.memoryHistory = this.memoryHistory.slice(-this.monitoringConfig.maxHistoryRecords);
        }
    }
    /**
     * 更新统计信息
     */
    updateStatistics(memoryInfo) {
        // 更新峰值使用率
        if (memoryInfo.systemMemoryUsage > this.statistics.peakMemoryUsage) {
            this.statistics.peakMemoryUsage = memoryInfo.systemMemoryUsage;
        }
        // 计算平均使用率
        const historyCount = this.memoryHistory.length;
        if (historyCount > 0) {
            const totalUsage = this.memoryHistory.reduce((sum, info) => sum + info.systemMemoryUsage, 0);
            this.statistics.avgMemoryUsage = totalUsage / historyCount;
        }
        // 更新状态计数
        switch (memoryInfo.status) {
            case MemoryStatus.WARNING:
                this.statistics.warningCount++;
                break;
            case MemoryStatus.CRITICAL:
                this.statistics.criticalCount++;
                break;
            case MemoryStatus.OUT_OF_MEMORY:
                this.statistics.outOfMemoryCount++;
                break;
        }
        this.statistics.lastUpdate = new Date();
    }
    /**
     * 清理资源
     */
    async dispose() {
        this.stopMemoryMonitoring();
        this.removeAllListeners();
        this.memoryHistory = [];
        loggingService.info(LogCategory.MEMORY_MANAGER, '内存管理服务已清理');
    }
}
/**
 * 单例实例
 */
export const memoryManager = new MemoryManager();
//# sourceMappingURL=memory-manager.js.map