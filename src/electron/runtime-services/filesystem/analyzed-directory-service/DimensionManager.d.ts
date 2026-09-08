import { DimensionGroupsResponse, GetDimensionGroupsOptions } from '@firefly/types';
import Database from 'better-sqlite3';
export interface LogicPanItem {
    zh: string;
    en: string;
    dimensionId: number;
    dimensionName: string;
    logicPanDimension: string;
}
export declare class DimensionManager {
    private db;
    private _extensionMap;
    private static _logicPanProjectionsCache;
    constructor(db: Database.Database);
    /**
     * 加载离线 RAM++ 细粒度实体与逻辑泛维度投影关系表
     * 优先从 pro / presetResources / extraResources 多级目录检索
     */
    private loadLogicPanProjections;
    /**
     * 从 L3 扩展名维度动态构建 tagValue → extensions 映射
     * 通过 triggerConditions 向上追溯，收集触发链上所有标签
     */
    private buildExtensionMap;
    /**
     * 收集从指定维度向上到 L1 的触发链上中间层标签名（不含 L1 根标签）
     * 只收集 L2 及更高层的维度自身 tags 和 triggerTags
     */
    private collectTriggerChainTags;
    /**
     * 安全解析 JSON 数组
     */
    private parseJsonArray;
    /**
     * 根据标签值获取允许的文件扩展名
     * 通过 L3 扩展名维度动态构建的映射查找
     */
    getExtensionsForTag(tagValue: string): string[];
    /**
     * 根据父标签推断扩展名
     * 统一使用 extensionMap 查找
     */
    private getExtsForParentTag;
    getDimensionGroups(options?: GetDimensionGroupsOptions | string, _language?: string): Promise<DimensionGroupsResponse>;
    /**
     * 递归移除 fileCount 为 0 且没有子标签的标签
     * 从叶子节点向上处理，确保父标签在子标签被移除后也能被正确清理
     */
    private removeEmptyTagsRecursive;
    getFileTagsWithDimensions(fileId: string): Array<{
        dimensionId: number;
        dimensionName: string;
        tagValue: string;
        level: number;
    }>;
}
//# sourceMappingURL=DimensionManager.d.ts.map