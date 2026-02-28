import path from 'path';
import { app as electronApp } from 'electron';
import { logger, LogCategory } from '@yonuc/shared';

/**
 * 数据库配置接口定义
 */
export interface IDatabaseConfig {
  type: 'sqlite';
  path: string;
  migrations: boolean;
  backup: {
    enabled: boolean;
    maxBackups: number;
    backupPath: string;
  };
  pragma: {
    journal_mode: string;
    synchronous: string;
    cache_size: number;
    foreign_keys: boolean;
  };
}

/**
 * 数据库迁移配置
 */
export interface IMigrationConfig {
  version: number;
  name: string;
  description?: string;
  up: string;
  down: string;
}

/**
 * 数据库迁移列表
 * 整合所有迁移为单一版本，完全重新建数据库
 */
export const migrations: IMigrationConfig[] = [
  {
    version: 1,
    name: 'unified_tag_system_schema',
    description: '全局一致性标签系统架构（Hash ID + 语言隔离 + 精简字段）',
    up: `
      -- 工作目录表
      CREATE TABLE IF NOT EXISTS workspace_directories (
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- 主键ID
        path TEXT NOT NULL UNIQUE, -- 工作目录的完整路径
        name TEXT NOT NULL, -- 目录显示名称
        type TEXT NOT NULL DEFAULT 'SPEEDY', -- 目录类型: 'SPEEDY' | 'PRIVATE'
        recursive BOOLEAN NOT NULL DEFAULT 1, -- 是否递归监控子目录
        is_active BOOLEAN NOT NULL DEFAULT 1, -- 是否启用监控
        auto_watch BOOLEAN NOT NULL DEFAULT 0, -- 是否自动监听文件变化（新增/删除/修改）
        last_scan_at DATETIME, -- 最后扫描时间
        context_analysis TEXT, -- 目录上下文分析结果（JSON格式）
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 创建时间
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP -- 更新时间
      );

      -- 文件信息表
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY, -- 唯一标识 (Path + WorkspaceId 的 Hash)
        content_hash TEXT NOT NULL, -- 文件内容Hash (SHA256)
        path TEXT NOT NULL, -- 文件完整路径
        name TEXT NOT NULL, -- 文件名
        smart_name TEXT, -- 智能文件名（用户自定义）
        size INTEGER NOT NULL, -- 文件大小（字节）
        type TEXT NOT NULL, -- 文件类型扩展名
        mime_type TEXT NOT NULL, -- MIME类型
        created_at DATETIME NOT NULL, -- 文件创建时间
        modified_at DATETIME NOT NULL, -- 文件修改时间
        accessed_at DATETIME NOT NULL, -- 文件访问时间
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 数据表更新时间

        -- AI分析结果
        author TEXT, -- 作者信息
        description TEXT, -- 文件描述
        content TEXT, -- AI提取的文件内容
        language TEXT, -- 文件自身语言（如文件是用英文写的）
        quality_score REAL, -- 质量评分（1-10）
        quality_confidence REAL, -- 质量评分置信度（0-1）
        quality_criteria TEXT, -- 详细评分标准（JSON格式：{technical, aesthetic, content, completeness, timeliness}）
        quality_reasoning TEXT, -- 评分理由说明
        grouping_reason TEXT DEFAULT 'collection', -- 分组原因
        grouping_confidence REAL DEFAULT 0.5, -- 分组置信度（0-1）
        
        -- 关联关系
        unit_id INTEGER, -- 所属最小单元ID
        parent_archive TEXT, -- 父压缩包路径
        thumbnail_path TEXT, -- 缩略图相对路径（格式：.VirtualDirectory\\.thumbnail\\{id}_{smart_name}.jpg）
        multimodal_content TEXT, -- AI生成的多模态内容描述

        -- 状态信息
        is_analyzed BOOLEAN NOT NULL DEFAULT 0, -- 是否已分析
        analysis_error TEXT, -- 分析错误信息
        last_analyzed_at DATETIME, -- 最后分析时间
        metadata TEXT, -- 文件元数据 (JSON)
        sync_status INTEGER NOT NULL DEFAULT 0, -- 同步状态: 0-待同步, 1-同步中, 2-已同步
        
        -- 工作目录ID
        workspace_id INTEGER NOT NULL, -- 所属工作目录ID

        FOREIGN KEY (workspace_id) REFERENCES workspace_directories(id) ON DELETE CASCADE,
        FOREIGN KEY (unit_id) REFERENCES file_units(id) ON DELETE SET NULL,
        UNIQUE(path, workspace_id)
      );

      -- 最小单元表（文件分组管理）
      CREATE TABLE IF NOT EXISTS file_units (
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- 主键ID
        name TEXT NOT NULL, -- 单元名称
        description TEXT, -- 单元描述
        type TEXT NOT NULL, -- 单元类型：'album', 'series', 'chapter', 'collection'
        path TEXT, -- 单元路径
        grouping_reason TEXT DEFAULT 'collection', -- 分组原因
        grouping_confidence REAL DEFAULT 0.5, -- 分组置信度（0-1）
        author TEXT, -- 作者信息
        title TEXT, -- 标题
        tags TEXT, -- 标签（JSON数组）
        quality_score REAL, -- 质量评分（1-10）
        parent_unit_id TEXT, -- 父单元ID
        is_analyzed BOOLEAN DEFAULT 0, -- 是否已分析
        analyzed_at DATETIME, -- 分析时间
        analysis_error TEXT, -- 分析错误信息
        workspace_id INTEGER NOT NULL, -- 所属工作目录ID
        sync_status INTEGER NOT NULL DEFAULT 0, -- 同步状态
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 创建时间
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 更新时间

        FOREIGN KEY (workspace_id) REFERENCES workspace_directories(id) ON DELETE CASCADE
      );

      -- 文件维度表
      CREATE TABLE IF NOT EXISTS file_dimensions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- 维度唯一标识 (自增整数)
        name TEXT NOT NULL UNIQUE, -- 维度名称（用户当前语言的维度名称，如 '风格' 或 'style'）
        level INTEGER NOT NULL, -- 维度层级 (1-3)
        tags TEXT NOT NULL, -- 该维度下的标签定义数组（JSON格式）
        trigger_conditions TEXT, -- 触发条件（JSON格式）
        is_ai_generated BOOLEAN DEFAULT 0, -- 是否为AI生成的维度
        description TEXT, -- 维度描述
        applicable_file_types TEXT, -- 适用文件类型（JSON数组）
        context_hints TEXT, -- 上下文提示
        sync_status INTEGER NOT NULL DEFAULT 0, -- 同步状态: 0-待同步, 1-同步中, 2-已同步
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 维度扩展提案表
      CREATE TABLE IF NOT EXISTS dimension_expansions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        name TEXT NOT NULL UNIQUE,
        level INTEGER NOT NULL,
        tags TEXT NOT NULL,
        trigger_conditions TEXT,
        description TEXT,
        applicable_file_types TEXT,
        context_hints TEXT,
        sync_status INTEGER NOT NULL DEFAULT 0, -- 同步状态
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 文件标签实例表
      CREATE TABLE IF NOT EXISTS file_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- 标签唯一标识 (自增整数)
        name TEXT NOT NULL, -- 标签名称
        dimension_id INTEGER NOT NULL, -- 所属维度ID (整数)
        sync_status INTEGER NOT NULL DEFAULT 0, -- 同步状态
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 创建时间
        UNIQUE(dimension_id, name) -- 同一维度下标签名唯一
      );

      -- 标签扩展提案表
      CREATE TABLE IF NOT EXISTS tag_expansions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        name TEXT NOT NULL, 
        dimension_id INTEGER NOT NULL, 
        sync_status INTEGER NOT NULL DEFAULT 0, -- 同步状态
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(dimension_id, name)
      );

      -- 系统配置表 (用于存储云端同步的全局配置)
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT, -- JSON 格式
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 文件标签关联表 (精简版)
      CREATE TABLE IF NOT EXISTS file_tag_relations (
        file_id TEXT NOT NULL, -- 文件ID (Hash)
        tag_id INTEGER NOT NULL, -- 标签ID (整数)
        sync_status INTEGER NOT NULL DEFAULT 0, -- 同步状态
        
        PRIMARY KEY (file_id, tag_id),
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES file_tags(id) ON DELETE CASCADE
      );

      -- 文件与最小单元关联表
      CREATE TABLE IF NOT EXISTS file_unit_relations (
        file_id TEXT NOT NULL, -- 文件ID (Hash)
        unit_id INTEGER NOT NULL, -- 单元ID
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 

        PRIMARY KEY (file_id, unit_id),
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
        FOREIGN KEY (unit_id) REFERENCES file_units(id) ON DELETE CASCADE
      );

      -- AI分析队列表
      CREATE TABLE IF NOT EXISTS analysis_queue (
        id TEXT PRIMARY KEY, -- 队列项唯一ID
        file_path TEXT NOT NULL, -- 文件完整路径
        file_name TEXT NOT NULL, -- 文件名
        file_type TEXT NOT NULL, -- 文件类型
        status TEXT NOT NULL DEFAULT 'pending', -- 状态：pending, analyzing, completed, failed
        progress INTEGER NOT NULL DEFAULT 0, -- 分析进度（0-100）
        error TEXT, -- 错误信息
        start_time TEXT, -- 开始时间
        end_time TEXT, -- 结束时间
        result TEXT, -- 分析结果（JSON格式）
        priority INTEGER NOT NULL DEFAULT 0, -- 优先级（数字越大优先级越高）
        retry_count INTEGER NOT NULL DEFAULT 0, -- 重试次数
        max_retries INTEGER NOT NULL DEFAULT 3, -- 最大重试次数
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 创建时间
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP -- 更新时间
      );

      -- 虚拟目录表（基于标签筛选的虚拟文件夹）
      CREATE TABLE IF NOT EXISTS virtual_directories (
        id TEXT PRIMARY KEY, -- 虚拟目录唯一ID
        name TEXT NOT NULL, -- 虚拟目录名称
        description TEXT, -- 描述
        filters TEXT NOT NULL, -- 筛选条件（JSON格式）
        parent_id TEXT, -- 上级虚拟目录ID
        workspace_id INTEGER NOT NULL, -- 所属工作目录ID
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 创建时间
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 更新时间

        FOREIGN KEY (workspace_id) REFERENCES workspace_directories(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES virtual_directories(id) ON DELETE CASCADE
      );

      -- 索引
      CREATE INDEX IF NOT EXISTS idx_files_workspace_id ON files(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
      CREATE INDEX IF NOT EXISTS idx_files_is_analyzed ON files(is_analyzed);
      
      CREATE INDEX IF NOT EXISTS idx_file_units_workspace_id ON file_units(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_file_tags_dimension_id ON file_tags(dimension_id);
      CREATE INDEX IF NOT EXISTS idx_file_tags_name ON file_tags(name);
      CREATE INDEX IF NOT EXISTS idx_file_tag_relations_file_id ON file_tag_relations(file_id);
      CREATE INDEX IF NOT EXISTS idx_file_tag_relations_tag_id ON file_tag_relations(tag_id);
      CREATE INDEX IF NOT EXISTS idx_file_dimensions_level ON file_dimensions(level);
    `,
    down: `
      DROP TABLE IF EXISTS virtual_directories;
      DROP TABLE IF EXISTS file_unit_relations;
      DROP TABLE IF EXISTS dimension_expansions;
      DROP TABLE IF EXISTS tag_expansions;
      DROP TABLE IF EXISTS file_tag_relations;
      DROP TABLE IF EXISTS file_tags;
      DROP TABLE IF EXISTS file_dimensions;
      DROP TABLE IF EXISTS file_units;
      DROP TABLE IF EXISTS files;
      DROP TABLE IF EXISTS workspace_directories;
      DROP TABLE IF EXISTS analysis_queue;
    `
  }
];

/**
 * 获取数据库配置
 * @param language 语言代码
 */
export function getDatabaseConfig(language?: string): IDatabaseConfig {
  const dbName = language ? `yonuc-ai-folder_${language}.db` : 'yonuc-ai-folder.db';
  return {
    type: 'sqlite',
    path: path.join(electronApp.getPath('userData'), dbName),
    migrations: true,
    backup: {
      enabled: true,
      maxBackups: 10,
      backupPath: path.join(electronApp.getPath('userData'), 'backups')
    },
    pragma: {
      journal_mode: 'WAL',
      synchronous: 'NORMAL',
      cache_size: -64000,
      foreign_keys: true
    }
  };
}

/**
 * 获取备份数据库路径
 */
export function getBackupPath(timestamp?: string, language?: string): string {
  const config = getDatabaseConfig(language);
  const backupTimestamp = timestamp || new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(config.backup.backupPath, `backup-${backupTimestamp}.db`);
}