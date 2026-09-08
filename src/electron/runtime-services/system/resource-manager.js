/**
 * Resource Manager - 资源管理服务
 *
 * 统一管理HTTP连接池、资源清理、生命周期管理和资源使用统计监控。
 */
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import os from 'os';
import { connectionPool, concurrencyController } from '@firefly/electron-llamaIndex-service';
import { memoryManager } from './memory-manager';
import { loggingService } from './logging-service';
import { LogCategory } from '@firefly/shared';
import { t } from '@app/languages';
import { ConfigOrchestrator } from '../../config/config-orchestrator';
/**
 * 资源类型枚举
 */
export var ResourceType;
(function (ResourceType) {
    /** HTTP连接 */
    ResourceType["CONNECTION"] = "connection";
    /** 内存 */
    ResourceType["MEMORY"] = "memory";
    /** CPU */
    ResourceType["CPU"] = "cpu";
    /** 文件句柄 */
    ResourceType["FILE_HANDLE"] = "file_handle";
    /** 网络带宽 */
    ResourceType["NETWORK"] = "network";
    /** 磁盘IO */
    ResourceType["DISK_IO"] = "disk_io";
})(ResourceType || (ResourceType = {}));
/**
 * 资源状态枚举
 */
export var ResourceStatus;
(function (ResourceStatus) {
    /** 正常 */
    ResourceStatus["NORMAL"] = "normal";
    /** 警告 */
    ResourceStatus["WARNING"] = "warning";
    /** 危险 */
    ResourceStatus["CRITICAL"] = "critical";
    /** 耗尽 */
    ResourceStatus["EXHAUSTED"] = "exhausted";
})(ResourceStatus || (ResourceStatus = {}));
/**
 * 资源管理服务
 */
export class ResourceManager extends EventEmitter {
    monitoringConfig;
    cleanupStrategies;
    resourceHistory = new Map();
    resourceStatistics = new Map();
    monitoringTimer = null;
    isMonitoring = false;
    isCleaning = false;
    lastCleanupTime = 0;
    hardwareMonitoringEnabled = true;
    constructor() {
        super();
        // 初始化默认配置
        this.monitoringConfig = {
            monitoringInterval: 5000, // 5秒
            enableAutoCleanup: true,
            historyRetentionTime: 3600000, // 1小时
            maxHistoryRecords: 720, // 最多720条记录
            thresholds: {
                [ResourceType.CONNECTION]: {
                    warning: 0.7, // 70%
                    critical: 0.85, // 85%
                    exhausted: 0.95 // 95%
                },
                [ResourceType.MEMORY]: {
                    warning: 0.75, // 75%
                    critical: 0.85, // 85%
                    exhausted: 0.95 // 95%
                },
                [ResourceType.CPU]: {
                    warning: 0.7, // 70%
                    critical: 0.85, // 85%
                    exhausted: 0.95 // 95%
                },
                [ResourceType.FILE_HANDLE]: {
                    warning: 0.8, // 80%
                    critical: 0.9, // 90%
                    exhausted: 0.98 // 98%
                },
                [ResourceType.NETWORK]: {
                    warning: 0.7, // 70%
                    critical: 0.85, // 85%
                    exhausted: 0.95 // 95%
                },
                [ResourceType.DISK_IO]: {
                    warning: 0.7, // 70%
                    critical: 0.85, // 85%
                    exhausted: 0.95 // 95%
                }
            }
        };
        // 初始化清理策略
        this.cleanupStrategies = [
            {
                name: 'cleanup-idle-connections',
                description: '清理空闲的HTTP连接',
                resourceTypes: [ResourceType.CONNECTION],
                trigger: resource => resource.usage > this.monitoringConfig.thresholds[ResourceType.CONNECTION].warning,
                action: async () => this.cleanupIdleConnections(),
                priority: 1,
                enabled: true
            },
            {
                name: 'force-memory-gc',
                description: '强制内存垃圾回收',
                resourceTypes: [ResourceType.MEMORY],
                trigger: resource => resource.usage > this.monitoringConfig.thresholds[ResourceType.MEMORY].warning,
                action: async () => this.forceMemoryGC(),
                priority: 2,
                enabled: true
            },
            {
                name: 'reduce-concurrency',
                description: '降低并发请求数',
                resourceTypes: [ResourceType.CPU, ResourceType.MEMORY],
                trigger: resource => resource.usage > this.monitoringConfig.thresholds[resource.type].critical,
                action: async () => this.reduceConcurrency(),
                priority: 3,
                enabled: true
            },
            {
                name: 'clear-request-queue',
                description: '清理请求队列',
                resourceTypes: [ResourceType.MEMORY, ResourceType.CPU],
                trigger: resource => resource.usage > this.monitoringConfig.thresholds[resource.type].exhausted,
                action: async () => this.clearRequestQueue(),
                priority: 4,
                enabled: true
            }
        ];
        this.applyConfigFromSettings();
        this.registerConfigWatchers();
        // 初始化统计信息
        this.initializeStatistics();
        this.initializeService();
    }
    applyConfigFromSettings() {
        const interval = ConfigOrchestrator.getInstance().getValue('HARDWARE_CHECK_INTERVAL');
        if (typeof interval === 'number' && interval > 0) {
            this.monitoringConfig.monitoringInterval = interval;
        }
        const enableMonitoring = ConfigOrchestrator.getInstance().getValue('ENABLE_HARDWARE_MONITORING');
        this.hardwareMonitoringEnabled = enableMonitoring !== false;
        this.updateThresholdsFromSettings();
    }
    registerConfigWatchers() {
        ConfigOrchestrator.getInstance().onValueChange('ENABLE_HARDWARE_MONITORING', value => {
            const enabled = value !== false;
            this.hardwareMonitoringEnabled = enabled;
            if (enabled) {
                this.startResourceMonitoring();
            }
            else {
                this.stopResourceMonitoring();
            }
        });
        ConfigOrchestrator.getInstance().onValueChange('HARDWARE_CHECK_INTERVAL', value => {
            const interval = typeof value === 'number' && value > 0 ? value : this.monitoringConfig.monitoringInterval;
            this.monitoringConfig.monitoringInterval = interval;
            if (this.hardwareMonitoringEnabled && this.isMonitoring) {
                this.startResourceMonitoring();
            }
        });
        ConfigOrchestrator.getInstance().onValueChange('CPU_WARNING_THRESHOLD', value => {
            this.setThresholdPercent(ResourceType.CPU, 'warning', typeof value === 'number' ? value : undefined);
        });
        ConfigOrchestrator.getInstance().onValueChange('CPU_CRITICAL_THRESHOLD', value => {
            this.setThresholdPercent(ResourceType.CPU, 'critical', typeof value === 'number' ? value : undefined);
        });
        ConfigOrchestrator.getInstance().onValueChange('MEMORY_WARNING_THRESHOLD', value => {
            this.setThresholdPercent(ResourceType.MEMORY, 'warning', typeof value === 'number' ? value : undefined);
        });
        ConfigOrchestrator.getInstance().onValueChange('MEMORY_CRITICAL_THRESHOLD', value => {
            this.setThresholdPercent(ResourceType.MEMORY, 'critical', typeof value === 'number' ? value : undefined);
        });
        ConfigOrchestrator.getInstance().onValueChange('FILE_HANDLE_WARNING_THRESHOLD', value => {
            this.setThresholdPercent(ResourceType.FILE_HANDLE, 'warning', typeof value === 'number' ? value : undefined);
        });
        ConfigOrchestrator.getInstance().onValueChange('FILE_HANDLE_CRITICAL_THRESHOLD', value => {
            this.setThresholdPercent(ResourceType.FILE_HANDLE, 'critical', typeof value === 'number' ? value : undefined);
        });
    }
    updateThresholdsFromSettings() {
        this.setThresholdPercent(ResourceType.CPU, 'warning', ConfigOrchestrator.getInstance().getValue('CPU_WARNING_THRESHOLD'));
        this.setThresholdPercent(ResourceType.CPU, 'critical', ConfigOrchestrator.getInstance().getValue('CPU_CRITICAL_THRESHOLD'));
        this.setThresholdPercent(ResourceType.MEMORY, 'warning', ConfigOrchestrator.getInstance().getValue('MEMORY_WARNING_THRESHOLD'));
        this.setThresholdPercent(ResourceType.MEMORY, 'critical', ConfigOrchestrator.getInstance().getValue('MEMORY_CRITICAL_THRESHOLD'));
        this.setThresholdPercent(ResourceType.FILE_HANDLE, 'warning', ConfigOrchestrator.getInstance().getValue('FILE_HANDLE_WARNING_THRESHOLD'));
        this.setThresholdPercent(ResourceType.FILE_HANDLE, 'critical', ConfigOrchestrator.getInstance().getValue('FILE_HANDLE_CRITICAL_THRESHOLD'));
    }
    setThresholdPercent(resource, field, percent) {
        if (typeof percent !== 'number') {
            return;
        }
        const ratio = Math.min(Math.max(percent / 100, 0), 1);
        this.monitoringConfig.thresholds[resource][field] = ratio;
    }
    /**
     * 初始化服务
     */
    async initializeService() {
        try {
            // 启动资源监控
            if (this.hardwareMonitoringEnabled) {
                this.startResourceMonitoring();
            }
            else {
                loggingService.info(LogCategory.RESOURCE_MANAGER, '硬件监控已禁用，跳过资源监控启动');
            }
            loggingService.info(LogCategory.RESOURCE_MANAGER, '资源管理服务初始化完成');
            this.emit('service-initialized');
        }
        catch (error) {
            loggingService.error(LogCategory.RESOURCE_MANAGER, '服务初始化失败', error);
            this.emit('service-error', error);
        }
    }
    /**
     * 获取所有资源信息
     */
    async getAllResourceInfo() {
        const startTime = performance.now();
        try {
            const resources = [];
            // 获取连接池资源信息
            const connectionInfo = await this.getConnectionResourceInfo();
            resources.push(connectionInfo);
            // 获取内存资源信息
            const memoryInfo = await this.getMemoryResourceInfo();
            resources.push(memoryInfo);
            // 获取CPU资源信息
            const cpuInfo = await this.getCpuResourceInfo();
            resources.push(cpuInfo);
            // 获取文件句柄资源信息
            const fileHandleInfo = await this.getFileHandleResourceInfo();
            resources.push(fileHandleInfo);
            // 获取网络资源信息
            const networkInfo = await this.getNetworkResourceInfo();
            resources.push(networkInfo);
            // 获取磁盘IO资源信息
            const diskIOInfo = await this.getDiskIOResourceInfo();
            resources.push(diskIOInfo);
            const executionTime = performance.now() - startTime;
            loggingService.debug(LogCategory.RESOURCE_MANAGER, `资源信息获取完成，耗时: ${executionTime.toFixed(2)}ms`);
            return resources;
        }
        catch (error) {
            loggingService.error(LogCategory.RESOURCE_MANAGER, '获取资源信息失败', error);
            throw error;
        }
    }
    /**
     * 获取特定类型的资源信息
     */
    async getResourceInfo(type) {
        switch (type) {
            case ResourceType.CONNECTION:
                return this.getConnectionResourceInfo();
            case ResourceType.MEMORY:
                return this.getMemoryResourceInfo();
            case ResourceType.CPU:
                return this.getCpuResourceInfo();
            case ResourceType.FILE_HANDLE:
                return this.getFileHandleResourceInfo();
            case ResourceType.NETWORK:
                return this.getNetworkResourceInfo();
            case ResourceType.DISK_IO:
                return this.getDiskIOResourceInfo();
            default:
                throw new Error(t('不支持的资源类型: {type}', { type }));
        }
    }
    /**
     * 启动资源监控
     */
    startResourceMonitoring() {
        if (this.monitoringTimer) {
            this.stopResourceMonitoring();
        }
        this.isMonitoring = true;
        this.monitoringTimer = setInterval(async () => {
            try {
                await this.performResourceCheck();
            }
            catch (error) {
                loggingService.error(LogCategory.RESOURCE_MANAGER, '资源检查失败', error);
            }
        }, this.monitoringConfig.monitoringInterval);
        loggingService.info(LogCategory.RESOURCE_MANAGER, `资源监控已启动，间隔: ${this.monitoringConfig.monitoringInterval}ms`);
        this.emit('monitoring-started');
    }
    /**
     * 停止资源监控
     */
    stopResourceMonitoring() {
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = null;
            this.isMonitoring = false;
            loggingService.info(LogCategory.RESOURCE_MANAGER, '资源监控已停止');
            this.emit('monitoring-stopped');
        }
    }
    /**
     * 执行资源清理
     */
    async cleanupResources(resourceTypes, forceCleanup = false) {
        if (this.isCleaning && !forceCleanup) {
            throw new Error(t('资源清理正在进行中'));
        }
        // 防止频繁清理
        const now = Date.now();
        if (!forceCleanup && now - this.lastCleanupTime < 30000) {
            throw new Error(t('资源清理过于频繁，请稍后再试'));
        }
        this.isCleaning = true;
        this.lastCleanupTime = now;
        const results = [];
        try {
            loggingService.info(LogCategory.RESOURCE_MANAGER, '开始资源清理');
            this.emit('cleanup-started', { resourceTypes });
            // 获取当前资源状态
            const allResources = await this.getAllResourceInfo();
            const targetResources = resourceTypes
                ? allResources.filter(r => resourceTypes.includes(r.type))
                : allResources;
            // 选择适用的清理策略
            const applicableStrategies = this.cleanupStrategies
                .filter(strategy => strategy.enabled &&
                targetResources.some(resource => strategy.resourceTypes.includes(resource.type) && strategy.trigger(resource)))
                .sort((a, b) => a.priority - b.priority);
            if (applicableStrategies.length === 0) {
                loggingService.info(LogCategory.RESOURCE_MANAGER, '没有需要执行的清理策略');
                return results;
            }
            // 执行清理策略
            for (const strategy of applicableStrategies) {
                for (const resource of targetResources) {
                    if (strategy.resourceTypes.includes(resource.type) && strategy.trigger(resource)) {
                        try {
                            const result = await this.executeCleanupStrategy(strategy, resource);
                            results.push(result);
                            if (result.success) {
                                loggingService.info(LogCategory.RESOURCE_MANAGER, `清理策略执行成功: ${strategy.name}, 释放资源: ${result.resourceReleased}`);
                            }
                            else {
                                loggingService.warn(LogCategory.RESOURCE_MANAGER, `清理策略执行失败: ${strategy.name}, 错误: ${result.error}`);
                            }
                        }
                        catch (error) {
                            const errorResult = {
                                strategyName: strategy.name,
                                resourceType: resource.type,
                                success: false,
                                resourceReleased: 0,
                                executionTime: 0,
                                error: error instanceof Error ? error.message : String(error)
                            };
                            results.push(errorResult);
                            loggingService.error(LogCategory.RESOURCE_MANAGER, `清理策略执行异常: ${strategy.name}`, error);
                        }
                    }
                }
            }
            const totalResourceReleased = results.reduce((sum, result) => sum + (result.success ? result.resourceReleased : 0), 0);
            loggingService.info(LogCategory.RESOURCE_MANAGER, `资源清理完成，总释放资源: ${totalResourceReleased}，执行策略: ${results.length}`);
            this.emit('cleanup-completed', {
                results,
                totalResourceReleased,
                resourceTypes
            });
            return results;
        }
        catch (error) {
            loggingService.error(LogCategory.RESOURCE_MANAGER, '资源清理失败', error);
            this.emit('cleanup-failed', { error, resourceTypes });
            throw error;
        }
        finally {
            this.isCleaning = false;
        }
    }
    /**
     * 获取资源使用历史
     */
    getResourceHistory(type, limit) {
        const history = this.resourceHistory.get(type) || [];
        return limit ? history.slice(-limit) : [...history];
    }
    /**
     * 获取资源统计信息
     */
    getResourceStatistics(type) {
        if (type) {
            const stats = this.resourceStatistics.get(type);
            if (!stats) {
                throw new Error(t('资源类型 {type} 的统计信息不存在', { type }));
            }
            return { ...stats };
        }
        return new Map(this.resourceStatistics);
    }
    /**
     * 更新监控配置
     */
    updateMonitoringConfig(config) {
        const oldInterval = this.monitoringConfig.monitoringInterval;
        this.monitoringConfig = { ...this.monitoringConfig, ...config };
        // 如果监控间隔改变，重启监控
        if (config.monitoringInterval && config.monitoringInterval !== oldInterval) {
            this.startResourceMonitoring();
        }
        loggingService.info(LogCategory.RESOURCE_MANAGER, '监控配置已更新', config);
        this.emit('monitoring-config-updated', this.monitoringConfig);
    }
    /**
     * 更新清理策略
     */
    updateCleanupStrategies(strategies) {
        this.cleanupStrategies = [...strategies];
        loggingService.info(LogCategory.RESOURCE_MANAGER, '清理策略已更新');
        this.emit('strategies-updated', this.cleanupStrategies);
    }
    /**
     * 获取当前配置
     */
    getConfiguration() {
        return {
            monitoring: { ...this.monitoringConfig },
            strategies: [...this.cleanupStrategies]
        };
    }
    /**
     * 执行资源检查
     */
    async performResourceCheck() {
        try {
            const resources = await this.getAllResourceInfo();
            // 添加到历史记录
            for (const resource of resources) {
                this.addToHistory(resource);
                this.updateStatistics(resource);
            }
            // 发送资源状态更新事件
            this.emit('resources-updated', resources);
            // 检查是否需要自动清理
            if (this.monitoringConfig.enableAutoCleanup && this.shouldTriggerAutoCleanup(resources)) {
                try {
                    await this.cleanupResources();
                }
                catch (error) {
                    loggingService.warn(LogCategory.RESOURCE_MANAGER, '自动资源清理失败', error);
                }
            }
        }
        catch (error) {
            loggingService.error(LogCategory.RESOURCE_MANAGER, '资源检查执行失败', error);
        }
    }
    /**
     * 获取连接池资源信息
     */
    async getConnectionResourceInfo() {
        const stats = connectionPool.getStats();
        const maxConnections = 10; // 从配置获取
        return {
            type: ResourceType.CONNECTION,
            name: 'HTTP连接池',
            current: stats.activeConnections,
            maximum: maxConnections,
            usage: stats.activeConnections / maxConnections,
            status: this.determineResourceStatus(ResourceType.CONNECTION, stats.activeConnections / maxConnections),
            unit: '个',
            lastUpdate: new Date(),
            metadata: {
                totalConnections: stats.totalConnections,
                idleConnections: stats.idleConnections,
                hitRate: stats.hitRate,
                avgResponseTime: stats.avgResponseTime
            }
        };
    }
    /**
     * 获取内存资源信息
     */
    async getMemoryResourceInfo() {
        const memoryInfo = await memoryManager.getCurrentMemoryInfo();
        return {
            type: ResourceType.MEMORY,
            name: '系统内存',
            current: memoryInfo.usedSystemMemory,
            maximum: memoryInfo.totalSystemMemory,
            usage: memoryInfo.systemMemoryUsage,
            status: this.determineResourceStatus(ResourceType.MEMORY, memoryInfo.systemMemoryUsage),
            unit: 'MB',
            lastUpdate: new Date(),
            metadata: {
                processMemoryUsage: memoryInfo.processMemoryUsage,
                modelMemoryUsage: memoryInfo.modelMemoryUsage,
                availableMemory: memoryInfo.availableMemory
            }
        };
    }
    /**
     * 获取CPU资源信息
     */
    async getCpuResourceInfo() {
        const cpuUsage = this.calculateCpuUsage();
        const cpuCores = os.cpus().length;
        return {
            type: ResourceType.CPU,
            name: 'CPU使用率',
            current: cpuUsage * 100,
            maximum: 100,
            usage: cpuUsage,
            status: this.determineResourceStatus(ResourceType.CPU, cpuUsage),
            unit: '%',
            lastUpdate: new Date(),
            metadata: {
                cores: cpuCores,
                loadAverage: os.loadavg()
            }
        };
    }
    /**
     * 获取文件句柄资源信息
     */
    async getFileHandleResourceInfo() {
        // 简化的文件句柄统计
        const maxFileHandles = 1024; // 系统限制
        const currentFileHandles = 50; // 估算值
        return {
            type: ResourceType.FILE_HANDLE,
            name: '文件句柄',
            current: currentFileHandles,
            maximum: maxFileHandles,
            usage: currentFileHandles / maxFileHandles,
            status: this.determineResourceStatus(ResourceType.FILE_HANDLE, currentFileHandles / maxFileHandles),
            unit: '个',
            lastUpdate: new Date()
        };
    }
    /**
     * 获取网络资源信息
     */
    async getNetworkResourceInfo() {
        // 简化的网络带宽统计
        const maxBandwidth = 1000; // 1Gbps
        const currentBandwidth = 100; // 估算值
        return {
            type: ResourceType.NETWORK,
            name: '网络带宽',
            current: currentBandwidth,
            maximum: maxBandwidth,
            usage: currentBandwidth / maxBandwidth,
            status: this.determineResourceStatus(ResourceType.NETWORK, currentBandwidth / maxBandwidth),
            unit: 'Mbps',
            lastUpdate: new Date()
        };
    }
    /**
     * 获取磁盘IO资源信息
     */
    async getDiskIOResourceInfo() {
        // 简化的磁盘IO统计
        const maxIOPS = 1000; // 最大IOPS
        const currentIOPS = 100; // 估算值
        return {
            type: ResourceType.DISK_IO,
            name: '磁盘IO',
            current: currentIOPS,
            maximum: maxIOPS,
            usage: currentIOPS / maxIOPS,
            status: this.determineResourceStatus(ResourceType.DISK_IO, currentIOPS / maxIOPS),
            unit: 'IOPS',
            lastUpdate: new Date()
        };
    }
    /**
     * 确定资源状态
     */
    determineResourceStatus(type, usage) {
        const thresholds = this.monitoringConfig.thresholds[type];
        if (usage >= thresholds.exhausted) {
            return ResourceStatus.EXHAUSTED;
        }
        else if (usage >= thresholds.critical) {
            return ResourceStatus.CRITICAL;
        }
        else if (usage >= thresholds.warning) {
            return ResourceStatus.WARNING;
        }
        else {
            return ResourceStatus.NORMAL;
        }
    }
    /**
     * 执行清理策略
     */
    async executeCleanupStrategy(strategy, resource) {
        const startTime = performance.now();
        try {
            loggingService.debug(LogCategory.RESOURCE_MANAGER, `执行清理策略: ${strategy.name} for ${resource.type}`);
            const success = await strategy.action(resource);
            const executionTime = performance.now() - startTime;
            // 估算释放的资源量
            const resourceReleased = success ? resource.current * 0.1 : 0; // 简化估算
            return {
                strategyName: strategy.name,
                resourceType: resource.type,
                success,
                resourceReleased,
                executionTime,
                details: {
                    resourceBefore: resource.current,
                    resourceUsage: resource.usage
                }
            };
        }
        catch (error) {
            const executionTime = performance.now() - startTime;
            return {
                strategyName: strategy.name,
                resourceType: resource.type,
                success: false,
                resourceReleased: 0,
                executionTime,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    /**
     * 清理空闲连接
     */
    async cleanupIdleConnections() {
        try {
            connectionPool.cleanupIdleConnections();
            loggingService.debug(LogCategory.RESOURCE_MANAGER, '已清理空闲连接');
            return true;
        }
        catch (error) {
            loggingService.error(LogCategory.RESOURCE_MANAGER, '清理空闲连接失败', error);
            return false;
        }
    }
    /**
     * 强制内存垃圾回收
     */
    async forceMemoryGC() {
        try {
            if (global.gc) {
                global.gc();
                loggingService.debug(LogCategory.RESOURCE_MANAGER, '已执行强制垃圾回收');
                return true;
            }
            else {
                loggingService.warn(LogCategory.RESOURCE_MANAGER, '垃圾回收功能未启用');
                return false;
            }
        }
        catch (error) {
            loggingService.error(LogCategory.RESOURCE_MANAGER, '强制垃圾回收失败', error);
            return false;
        }
    }
    /**
     * 降低并发数
     */
    async reduceConcurrency() {
        try {
            const currentMax = 10; // 从配置获取
            const newMax = Math.max(currentMax - 1, 1);
            if (newMax < currentMax) {
                concurrencyController.setMaxConcurrency(newMax);
                loggingService.debug(LogCategory.RESOURCE_MANAGER, `并发数已降低: ${currentMax} -> ${newMax}`);
                return true;
            }
            return false;
        }
        catch (error) {
            loggingService.error(LogCategory.RESOURCE_MANAGER, '降低并发数失败', error);
            return false;
        }
    }
    /**
     * 清理请求队列
     */
    async clearRequestQueue() {
        try {
            const statsBefore = concurrencyController.getStats();
            concurrencyController.clearQueue();
            const statsAfter = concurrencyController.getStats();
            const clearedRequests = statsBefore.queuedRequests - statsAfter.queuedRequests;
            loggingService.debug(LogCategory.RESOURCE_MANAGER, `请求队列已清理，清除请求数: ${clearedRequests}`);
            return clearedRequests > 0;
        }
        catch (error) {
            loggingService.error(LogCategory.RESOURCE_MANAGER, '清理请求队列失败', error);
            return false;
        }
    }
    /**
     * 计算CPU使用率
     */
    calculateCpuUsage() {
        // 简化的CPU使用率计算
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;
        cpus.forEach(cpu => {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });
        return totalTick > 0 ? (totalTick - totalIdle) / totalTick : 0;
    }
    /**
     * 判断是否应该触发自动清理
     */
    shouldTriggerAutoCleanup(resources) {
        return resources.some(resource => resource.status === ResourceStatus.WARNING ||
            resource.status === ResourceStatus.CRITICAL ||
            resource.status === ResourceStatus.EXHAUSTED);
    }
    /**
     * 添加到历史记录
     */
    addToHistory(resource) {
        let history = this.resourceHistory.get(resource.type);
        if (!history) {
            history = [];
            this.resourceHistory.set(resource.type, history);
        }
        history.push(resource);
        // 清理过期记录
        const now = Date.now();
        const filteredHistory = history.filter(info => now - info.lastUpdate.getTime() < this.monitoringConfig.historyRetentionTime);
        // 限制记录数量
        if (filteredHistory.length > this.monitoringConfig.maxHistoryRecords) {
            filteredHistory.splice(0, filteredHistory.length - this.monitoringConfig.maxHistoryRecords);
        }
        this.resourceHistory.set(resource.type, filteredHistory);
    }
    /**
     * 更新统计信息
     */
    updateStatistics(resource) {
        let stats = this.resourceStatistics.get(resource.type);
        if (!stats) {
            stats = {
                type: resource.type,
                avgUsage: 0,
                peakUsage: 0,
                minUsage: 1,
                warningCount: 0,
                criticalCount: 0,
                exhaustedCount: 0,
                cleanupCount: 0,
                startTime: new Date(),
                lastUpdate: new Date()
            };
            this.resourceStatistics.set(resource.type, stats);
        }
        // 更新峰值和最低使用率
        if (resource.usage > stats.peakUsage) {
            stats.peakUsage = resource.usage;
        }
        if (resource.usage < stats.minUsage) {
            stats.minUsage = resource.usage;
        }
        // 计算平均使用率
        const history = this.resourceHistory.get(resource.type) || [];
        if (history.length > 0) {
            const totalUsage = history.reduce((sum, info) => sum + info.usage, 0);
            stats.avgUsage = totalUsage / history.length;
        }
        // 更新状态计数
        switch (resource.status) {
            case ResourceStatus.WARNING:
                stats.warningCount++;
                break;
            case ResourceStatus.CRITICAL:
                stats.criticalCount++;
                break;
            case ResourceStatus.EXHAUSTED:
                stats.exhaustedCount++;
                break;
        }
        stats.lastUpdate = new Date();
    }
    /**
     * 初始化统计信息
     */
    initializeStatistics() {
        for (const resourceType of Object.values(ResourceType)) {
            this.resourceStatistics.set(resourceType, {
                type: resourceType,
                avgUsage: 0,
                peakUsage: 0,
                minUsage: 1,
                warningCount: 0,
                criticalCount: 0,
                exhaustedCount: 0,
                cleanupCount: 0,
                startTime: new Date(),
                lastUpdate: new Date()
            });
        }
    }
    /**
     * 清理资源
     */
    async dispose() {
        this.stopResourceMonitoring();
        this.removeAllListeners();
        this.resourceHistory.clear();
        this.resourceStatistics.clear();
        loggingService.info(LogCategory.RESOURCE_MANAGER, '资源管理服务已清理');
    }
}
/**
 * 单例实例
 */
export const resourceManager = new ResourceManager();
//# sourceMappingURL=resource-manager.js.map