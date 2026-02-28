import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

import {
  FileOperation,
  FileOrganizeResult,
  DirectoryNode,
  OrganizeStatistics,
  FileConflict,
  ConflictResolutionOptions,
  FileInfoForAI,
  AIDirectoryStructure
} from '@yonuc/types/organize-types'
import { encode } from '@toon-format/toon'
import { logger, LogCategory } from '@yonuc/shared'
import { SavedVirtualDirectory } from '@yonuc/types'
import { platformAdapter } from '../system/platform-adapter'
import { QuickOrganizeService, type QuickOrganizeOptions } from '@yonuc/core-engine'
import { AIServiceAdapter } from '../ai/ai-service-adapter'
import { configService } from '../config'
import { ModelConfigService } from '../analysis/model-config-service'

const VIRTUAL_DIRECTORY_FOLDER = '.VirtualDirectory'

/**
 * 整理真实目录服务
 */
export class OrganizeRealDirectoryService {
  private quickOrganizeService!: QuickOrganizeService
  private aiServiceAdapter?: AIServiceAdapter

  constructor(private db: Database.Database) {
    // AI服务适配器将在需要时创建
  }

  /**
   * 获取或创建AI服务适配器
   */
  private async getAIServiceAdapter(): Promise<AIServiceAdapter> {
    if (!this.aiServiceAdapter) {
      const { createCoreEngineAdapters } = await import('../../adapters')
      const adapters = await createCoreEngineAdapters()
      this.aiServiceAdapter = new AIServiceAdapter()

    }
    return this.aiServiceAdapter
  }

  /**
   * 获取或创建快速整理服务
   */
  private async getQuickOrganizeService(): Promise<QuickOrganizeService> {
    if (!this.quickOrganizeService) {
      const { createCoreEngineAdapters } = await import('../../adapters')
      const adapters = await createCoreEngineAdapters()
      // llamaRuntime 实现了 IAIService 接口
      this.quickOrganizeService = new QuickOrganizeService(adapters.llamaRuntime as any)
    }
    return this.quickOrganizeService
  }

  /**
   * 按虚拟目录整理真实目录
   */
  async organizeByVirtualDirectory(
    workspaceDirectoryPath: string,
    savedDirectories: SavedVirtualDirectory[]
  ): Promise<OrganizeStatistics> {
    const startTime = Date.now()
    const overallStatistics: OrganizeStatistics = {
      totalFiles: 0,
      movedFiles: 0,
      failedFiles: 0,
      createdDirectories: 0,
      elapsedTime: 0,
      errors: [],
      deletedVirtualDirectoryIds: [] // Initialized
    }

    try {
      logger.info(LogCategory.FILE_ORGANIZATION, '开始按虚拟目录整理真实目录', {
        workspaceDirectoryPath,
        virtualDirectoryCount: savedDirectories.length
      })

      for (const virtualDir of savedDirectories) {
        const singleDirStats = {
          total: 0,
          success: 0,
          failed: 0
        }

        // 1. Get files for this virtual directory
        const files = await this.getVirtualDirectoryFiles(workspaceDirectoryPath, virtualDir)
        if (files.length === 0) {
          // If no files, still delete the virtual directory as it's "processed"
          await this._deleteVirtualDirectory(virtualDir.id, workspaceDirectoryPath)
          overallStatistics.deletedVirtualDirectoryIds?.push(virtualDir.id) // Add ID
          continue
        }
        singleDirStats.total = files.length
        overallStatistics.totalFiles += files.length

        // 2. Generate file operations for this virtual directory
        const targetDirPath = this.buildVirtualDirectoryPath(workspaceDirectoryPath, virtualDir)
        this.ensureDirectoryExists(targetDirPath)
        overallStatistics.createdDirectories++

        const fileOperations: FileOperation[] = files.map((file) => {
          const smartName = file.smartName || file.name
          const newPath = path.join(targetDirPath, smartName)
          return { fileId: file.id, oldPath: file.path, newPath, smartName }
        })

        // 3. Detect and resolve conflicts for this batch
        const conflicts = this.detectConflicts(fileOperations)
        if (conflicts.length > 0) {
          // Simple rename strategy
          for (const conflict of conflicts) {
            const operation = fileOperations.find((op) => op.newPath === conflict.targetPath)
            if (operation) {
              operation.newPath = this.generateNewPath(operation.newPath, 'number')
            }
          }
        }

        // 4. Execute file moves for this batch
        for (const operation of fileOperations) {
          try {
            const result = await this.organizeFileWithHardlinks(operation)
            if (result.success) {
              singleDirStats.success++
            } else {
              singleDirStats.failed++
              overallStatistics.errors.push({
                filePath: operation.oldPath,
                error: result.error || '未知错误'
              })
            }
          } catch (error: any) {
            singleDirStats.failed++
            overallStatistics.errors.push({
              filePath: operation.oldPath,
              error: error.message
            })
          }
        }

        overallStatistics.movedFiles += singleDirStats.success
        overallStatistics.failedFiles += singleDirStats.failed

        // 5. If all files in this virtual directory were moved successfully, delete it.
        if (singleDirStats.failed === 0) {
          await this._deleteVirtualDirectory(virtualDir.id, workspaceDirectoryPath)
          overallStatistics.deletedVirtualDirectoryIds?.push(virtualDir.id) // Add ID
        }
      }

      overallStatistics.elapsedTime = Date.now() - startTime
      logger.info(LogCategory.FILE_ORGANIZATION, '整理完成', overallStatistics)
      return overallStatistics
    } catch (error: any) {
      overallStatistics.elapsedTime = Date.now() - startTime
      logger.error(LogCategory.FILE_ORGANIZATION, '整理过程出错', {
        error: error.message,
        statistics: overallStatistics
      })
      throw error
    }
  }

  /**
   * 获取虚拟目录中的文件
   */
  private async getVirtualDirectoryFiles(
    workspaceDirectoryPath: string,
    virtualDir: SavedVirtualDirectory
  ): Promise<Array<{ id: number; path: string; name: string; smartName?: string }>> {
    // 构建查询条件
    const selectedTags = virtualDir.filter?.selectedTags
    if (!selectedTags || selectedTags.length === 0) {
      return []
    }

    // 构建SQL查询
    let query = `
      SELECT DISTINCT 
        f.id,
        f.path,
        f.name,
        f.smart_name as smartName
      FROM files f
      INNER JOIN file_tag_relations ftr ON ftr.file_id = f.id
      INNER JOIN file_tags ft ON ft.id = ftr.tag_id
      WHERE f.is_analyzed = 1
        AND f.workspace_id = (
          SELECT id FROM workspace_directories WHERE path = ?
        )
    `

    const params: any[] = [workspaceDirectoryPath]

    // 添加维度标签过滤
    for (let i = 0; i < selectedTags.length; i++) {
      const tag = selectedTags[i]
      query += `
        AND EXISTS (
          SELECT 1 FROM file_tag_relations ftr${i}
          INNER JOIN file_tags ft${i} ON ft${i}.id = ftr${i}.tag_id
          WHERE ftr${i}.file_id = f.id
            AND ft${i}.dimension_id = ?
            AND ft${i}.name = ?
        )
      `
      params.push(tag.dimensionName, tag.tagValue)
    }

    const files = this.db.prepare(query).all(...params) as any[]
    return files
  }

  /**
   * 从标签信息构建层级目录路径
   */
  private buildTagBasedDirectoryPath(
    workspaceDirectoryPath: string,
    fileTags: Array<{ dimension: string; tag: string }>
  ): string {
    // The order of tags in fileTags is the desired directory hierarchy,
    // as it's derived directly from the virtual directory's filters.
    const dirParts = fileTags.map((tagInfo) => tagInfo.tag)

    // 如果dirParts为空，使用默认目录名
    if (dirParts.length === 0) {
      dirParts.push('其他')
    }

    return path.join(workspaceDirectoryPath, ...dirParts)
  }

  /**
   * 构建虚拟目录路径
   */
  private buildVirtualDirectoryPath(
    workspaceDirectoryPath: string,
    virtualDir: SavedVirtualDirectory
  ): string {
    const dimensionTags = (virtualDir.filter?.selectedTags || []).map((tag) => ({
      dimension: tag.dimensionName,
      tag: tag.tagValue
    }))

    // 如果有维度标签，使用基于标签的路径
    if (dimensionTags.length > 0) {
      const targetPath = this.buildTagBasedDirectoryPath(workspaceDirectoryPath, dimensionTags)
      return targetPath
    } else {
      // 如果没有维度标签，使用默认的虚拟目录名
      const dirName = virtualDir.name
      return path.join(workspaceDirectoryPath, dirName)
    }
  }

  /**
   * 确保目录存在
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
      logger.debug(LogCategory.FILE_ORGANIZATION, '创建目录', { dirPath })
    }
  }

  /**
   * 检测文件冲突
   */
  private detectConflicts(fileOperations: FileOperation[]): FileConflict[] {
    const conflicts: FileConflict[] = []

    for (const op of fileOperations) {
      if (fs.existsSync(op.newPath)) {
        try {
          if (!fs.existsSync(op.oldPath)) {
            logger.warn(
              LogCategory.FILE_ORGANIZATION,
              '检测冲突时发现源文件不存在，无法比较',
              { operation: op }
            )
            continue
          }
          const existingStats = fs.statSync(op.newPath)
          const newStats = fs.statSync(op.oldPath)

          // 如果源文件和目标文件是同一个文件（通过inode和device判断），则不是冲突
          if (existingStats.ino === newStats.ino && existingStats.dev === newStats.dev) {
            continue
          }

          conflicts.push({
            targetPath: op.newPath,
            existingFile: {
              path: op.newPath,
              size: existingStats.size,
              modifiedAt: existingStats.mtime
            },
            newFile: {
              path: op.oldPath,
              size: newStats.size,
              modifiedAt: newStats.mtime
            },
            conflictType: 'name'
          })
        } catch (error: any) {
          logger.error(LogCategory.FILE_ORGANIZATION, '检测冲突时出错', {
            operation: op,
            error: error.message
          })
        }
      }
    }

    return conflicts
  }

  /**
   * 生成新的文件路径（处理冲突）
   */
  private generateNewPath(
    originalPath: string,
    pattern: 'number' | 'timestamp' | 'source'
  ): string {
    const dir = path.dirname(originalPath)
    const ext = path.extname(originalPath)
    const basename = path.basename(originalPath, ext)

    switch (pattern) {
      case 'number': {
        let counter = 1
        let newPath = originalPath
        while (fs.existsSync(newPath)) {
          newPath = path.join(dir, `${basename} (${counter})${ext}`)
          counter++
        }
        return newPath
      }
      case 'timestamp': {
        const timestamp =
          new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] +
          '_' +
          new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '')
        return path.join(dir, `${basename}_${timestamp}${ext}`)
      }
      case 'source': {
        const sourceDir = path.basename(path.dirname(originalPath))
        return path.join(dir, `${basename}_${sourceDir}${ext}`)
      }
      default:
        return originalPath
    }
  }

  /**
   * 整理文件并维护硬链接关系
   */
  private async organizeFileWithHardlinks(operation: FileOperation): Promise<FileOrganizeResult> {
    try {
      if (!fs.existsSync(operation.oldPath)) {
        const errorMessage = '源文件不存在，跳过移动'
        logger.warn(LogCategory.FILE_ORGANIZATION, errorMessage, { operation })
        return {
          fileId: operation.fileId,
          oldPath: operation.oldPath,
          newPath: operation.newPath,
          inode: 0,
          success: false,
          error: errorMessage
        }
      }
      // 1. 获取原始文件的inode
      const oldStats = fs.statSync(operation.oldPath)
      const inode = oldStats.ino

      // 2. 移动文件 (如果路径不同)
      if (path.resolve(operation.oldPath) !== path.resolve(operation.newPath)) {
        fs.renameSync(operation.oldPath, operation.newPath)
      } else {
        logger.debug(LogCategory.FILE_ORGANIZATION, '源路径与目标路径相同，跳过移动', {
          path: operation.oldPath
        })
      }

      // 3. 更新数据库中的文件路径、名称和修改时间，以确保数据一致性
      this.db
        .prepare(
          'UPDATE files SET path = ?, name = ?, modified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        )
        .run(operation.newPath, operation.smartName, operation.fileId)

      // 4. 验证虚拟目录中的硬链接
      await this.verifyAndFixHardlinks(operation.fileId, operation.newPath, inode)

      logger.debug(LogCategory.FILE_ORGANIZATION, '文件移动成功', {
        fileId: operation.fileId,
        oldPath: operation.oldPath,
        newPath: operation.newPath
      })

      return {
        fileId: operation.fileId,
        oldPath: operation.oldPath,
        newPath: operation.newPath,
        inode,
        success: true
      }
    } catch (error: any) {
      logger.error(LogCategory.FILE_ORGANIZATION, '文件移动失败', {
        operation,
        error: error.message
      })
      return {
        fileId: operation.fileId,
        oldPath: operation.oldPath,
        newPath: operation.newPath,
        inode: 0,
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 验证并修复虚拟目录中的硬链接
   */
  private async verifyAndFixHardlinks(
    fileId: number,
    newPath: string,
    expectedInode: number
  ): Promise<void> {
    try {
      // 获取该文件在虚拟目录中的所有硬链接
      const virtualLinks = this.getVirtualDirectoryLinks(fileId)

      for (const linkPath of virtualLinks) {
        try {
          if (fs.existsSync(linkPath)) {
            const linkStats = fs.statSync(linkPath)
            if (linkStats.ino !== expectedInode) {
              // 硬链接失效，重新创建
              logger.warn(LogCategory.FILE_ORGANIZATION, '硬链接失效，重新创建', {
                linkPath,
                fileId
              })
              fs.unlinkSync(linkPath)
              fs.linkSync(newPath, linkPath)
            }
          } else {
            // 硬链接不存在，创建
            fs.linkSync(newPath, linkPath)
          }
        } catch (error: any) {
          logger.error(LogCategory.FILE_ORGANIZATION, '修复硬链接失败', {
            linkPath,
            error: error.message
          })
        }
      }
    } catch (error: any) {
      logger.error(LogCategory.FILE_ORGANIZATION, '验证硬链接时出错', {
        fileId,
        error: error.message
      })
    }
  }

  /**
   * 获取文件在虚拟目录中的硬链接路径
   */
  private getVirtualDirectoryLinks(fileId: number): string[] {
    try {
      // 获取文件的路径
      const file = this.db.prepare('SELECT path, workspace_id FROM files WHERE id = ?').get(fileId) as any

      if (!file) {
        return []
      }

      // 获取工作目录路径
      const directory = this.db
        .prepare('SELECT path FROM workspace_directories WHERE id = ?')
        .get(file.workspace_id) as any

      if (!directory) {
        return []
      }

      const virtualDirRoot = path.join(directory.path, VIRTUAL_DIRECTORY_FOLDER)

      if (!fs.existsSync(virtualDirRoot)) {
        return []
      }

      // 获取文件的inode
      const fileStats = fs.statSync(file.path)
      const targetInode = fileStats.ino

      // 递归搜索虚拟目录中的所有硬链接
      const links: string[] = []

      const searchDirectory = (dirPath: string) => {
        try {
          const entries = fs.readdirSync(dirPath, { withFileTypes: true })

          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name)

            if (entry.isDirectory()) {
              // 跳过ReadMe文件所在目录，递归搜索子目录
              if (!entry.name.match(/^ReadMe_[a-zA-Z\-]{5}\.txt$/)) {
                searchDirectory(fullPath)
              }
            } else if (entry.isFile()) {
              try {
                const stats = fs.statSync(fullPath)
                // 比较inode，如果相同则是硬链接
                if (stats.ino === targetInode) {
                  links.push(fullPath)
                }
              } catch (error) {
                // 忽略无法访问的文件
              }
            }
          }
        } catch (error) {
          // 忽略无法访问的目录
        }
      }

      searchDirectory(virtualDirRoot)

      logger.debug(LogCategory.FILE_ORGANIZATION, `找到 ${links.length} 个虚拟目录硬链接`, {
        fileId,
        links
      })

      return links
    } catch (error: any) {
      logger.error(LogCategory.FILE_ORGANIZATION, '获取虚拟目录链接失败', {
        fileId,
        error: error.message
      })
      return []
    }
  }

  /**
   * 应用冲突解决方案
   */
  async resolveConflicts(
    fileOperations: FileOperation[],
    conflicts: FileConflict[],
    resolution: ConflictResolutionOptions
  ): Promise<FileOperation[]> {
    try {
      logger.info(LogCategory.FILE_ORGANIZATION, '应用冲突解决方案', {
        conflictCount: conflicts.length,
        action: resolution.action,
        applyToAll: resolution.applyToAll
      })

      const resolvedOperations = [...fileOperations]

      if (resolution.applyToAll) {
        // 应用于所有冲突
        for (const conflict of conflicts) {
          const operation = resolvedOperations.find((op) => op.newPath === conflict.targetPath)
          if (operation) {
            switch (resolution.action) {
              case 'rename':
                operation.newPath = this.generateNewPath(
                  operation.newPath,
                  resolution.renamePattern || 'number'
                )
                break
              case 'skip':
                // 标记为跳过（从列表中移除）
                const index = resolvedOperations.indexOf(operation)
                resolvedOperations.splice(index, 1)
                break
              case 'overwrite':
                // 覆盖：先备份现有文件
                const backupPath = this.createBackup(conflict.existingFile.path)
                logger.info(LogCategory.FILE_ORGANIZATION, '备份现有文件', {
                  original: conflict.existingFile.path,
                  backup: backupPath
                })
                break
            }
          }
        }
      } else {
        // TODO: 逐个处理冲突（需要UI支持）
        // 目前仅支持应用于所有
      }

      return resolvedOperations
    } catch (error: any) {
      logger.error(LogCategory.FILE_ORGANIZATION, '应用冲突解决方案失败', {
        error: error.message
      })
      throw error
    }
  }

  /**
   * 创建文件备份
   */
  private createBackup(filePath: string): string {
    try {
      const dir = path.dirname(filePath)
      const ext = path.extname(filePath)
      const basename = path.basename(filePath, ext)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_')
      const backupPath = path.join(dir, `.backup_${basename}_${timestamp}${ext}`)

      fs.copyFileSync(filePath, backupPath)
      return backupPath
    } catch (error: any) {
      logger.error(LogCategory.FILE_ORGANIZATION, '创建备份失败', {
        filePath,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 打开整理后的目录
   */
  async openOrganizedDirectory(directoryPath: string): Promise<void> {
    try {
      await platformAdapter.openPath(directoryPath)
      logger.info(LogCategory.FILE_ORGANIZATION, '打开目录', { directoryPath })
    } catch (error: any) {
      logger.error(LogCategory.FILE_ORGANIZATION, '打开目录失败', {
        directoryPath,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 导出错误日志到文件
   */
  async exportErrorLog(statistics: OrganizeStatistics, outputPath: string): Promise<void> {
    try {
      const log = {
        timestamp: new Date().toISOString(),
        summary: {
          totalFiles: statistics.totalFiles,
          movedFiles: statistics.movedFiles,
          failedFiles: statistics.failedFiles,
          createdDirectories: statistics.createdDirectories,
          elapsedTime: statistics.elapsedTime,
          successRate:
            statistics.totalFiles > 0
              ? ((statistics.movedFiles / statistics.totalFiles) * 100).toFixed(2) + '%'
              : '0%'
        },
        errors: statistics.errors.map((error, index) => ({
          index: index + 1,
          filePath: error.filePath,
          error: error.error
        }))
      }

      const logContent = JSON.stringify(log, null, 2)
      fs.writeFileSync(outputPath, logContent, 'utf-8')

      logger.info(LogCategory.FILE_ORGANIZATION, '导出错误日志成功', { outputPath })
    } catch (error: any) {
      logger.error(LogCategory.FILE_ORGANIZATION, '导出错误日志失败', {
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取已保存的虚拟目录列表
   */
  async getSavedVirtualDirectories(
    workspaceDirectoryPath: string
  ): Promise<SavedVirtualDirectory[]> {
    try {
      // 使用与 VirtualDirectoryService 相同的查询逻辑
      const directories = this.db
        .prepare(
          `
        SELECT id, name, description, filters, parent_id, workspace_id, created_at, updated_at
        FROM virtual_directories 
        WHERE workspace_id = (SELECT id FROM workspace_directories WHERE path = ?)
        ORDER BY created_at DESC
      `
        )
        .all(workspaceDirectoryPath) as any[]

      return directories.map((dir) => ({
        id: dir.id,
        name: dir.name,
        description: dir.description || undefined,
        filter: JSON.parse(dir.filters),
        parentId: dir.parent_id || null,
        workspaceId: dir.workspace_id,
        createdAt: new Date(dir.created_at),
        updatedAt: new Date(dir.updated_at)
      }))
    } catch (error: any) {
      logger.error(LogCategory.FILE_ORGANIZATION, '获取已保存的虚拟目录失败', {
        workspaceDirectoryPath,
        error: error.message
      })
      return []
    }
  }

  /**
   * 删除所有虚拟目录及其硬链接
   */
  async deleteAllVirtualDirectories(workspaceDirectoryPath: string): Promise<void> {
    try {
      logger.info(LogCategory.FILE_ORGANIZATION, '开始删除所有虚拟目录', {
        workspaceDirectoryPath
      })

      // 获取虚拟目录根路径
      const virtualDirRoot = path.join(workspaceDirectoryPath, VIRTUAL_DIRECTORY_FOLDER)

      if (fs.existsSync(virtualDirRoot)) {
        // 递归删除虚拟目录文件夹
        fs.rmSync(virtualDirRoot, { recursive: true, force: true })
        logger.info(LogCategory.FILE_ORGANIZATION, '删除虚拟目录文件夹', { virtualDirRoot })
      }

      // 删除数据库中的虚拟目录记录
      this.db
        .prepare('DELETE FROM virtual_directories WHERE directory_path = ?')
        .run(workspaceDirectoryPath)

      logger.info(LogCategory.FILE_ORGANIZATION, '删除虚拟目录记录完成')
    } catch (error: any) {
      logger.error(LogCategory.FILE_ORGANIZATION, '删除虚拟目录失败', {
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取整理预览信息
   */
  async getOrganizePreview(
    workspaceDirectoryPath: string,
    savedDirectories: SavedVirtualDirectory[]
  ): Promise<{ fileCount: number; directoryStructure: DirectoryNode[] }> {
    try {
      // 参数验证
      if (!savedDirectories || !Array.isArray(savedDirectories)) {
        logger.warn(LogCategory.FILE_ORGANIZATION, '保存的虚拟目录参数无效', {
          savedDirectories
        })
        return {
          fileCount: 0,
          directoryStructure: []
        }
      }

      let totalFileCount = 0
      const directoryStructure: DirectoryNode[] = []

      for (const virtualDir of savedDirectories) {
        const files = await this.getVirtualDirectoryFiles(workspaceDirectoryPath, virtualDir)
        const fileNames = files.map((f) => f.smartName || f.name)

        directoryStructure.push({
          name: virtualDir.name,
          parent: '', // 虚拟目录整理时都是顶级目录
          files: fileNames,
          fileCount: fileNames.length,
        })

        totalFileCount += fileNames.length
      }

      return {
        fileCount: totalFileCount,
        directoryStructure
      }
    } catch (error: any) {
      logger.error(LogCategory.FILE_ORGANIZATION, '获取整理预览失败', {
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取已分析的文件列表（用于一键整理）
   */
  async getAnalyzedFiles(workspaceDirectoryPath: string): Promise<FileInfoForAI[]> {
    try {
      // 规范化路径，确保使用统一的路径分隔符
      const normalizedPath = workspaceDirectoryPath.replace(/\\/g, '/')
      
      // 使用路径匹配查询所有已分析的文件（包括子目录）
      // 因为 workspace_id 指向的是文件所在的具体目录，不是工作目录
      const files = this.db
        .prepare(
          `
        SELECT 
          f.id,
          f.name,
          f.smart_name as smartName,
          f.path,
          f.type,
          f.description
        FROM files f
        WHERE f.is_analyzed = 1
          AND (
            f.path LIKE ? || '%'
            OR REPLACE(f.path, '\\', '/') LIKE ? || '%'
          )
      `
        )
        .all(workspaceDirectoryPath + '\\', normalizedPath + '/') as any[]

      logger.info(LogCategory.FILE_ORGANIZATION, `[一键整理] 查询到 ${files.length} 个已分析文件（包含所有子目录）`, {
        workspaceDirectoryPath,
        normalizedPath
      })

      // 统计文件分布
      if (files.length > 0) {
        // 按目录层级统计
        const pathDepths = files.map(f => {
          const relativePath = f.path.replace(workspaceDirectoryPath, '').replace(normalizedPath, '')
          const depth = relativePath.split(/[/\\]/).filter(Boolean).length - 1
          return depth
        })
        
        const maxDepth = Math.max(...pathDepths)
        const minDepth = Math.min(...pathDepths)
        
        logger.info(LogCategory.FILE_ORGANIZATION, '[一键整理] 文件分布统计:', {
          totalFiles: files.length,
          maxDepth,
          minDepth,
          samples: files.slice(0, 5).map(f => ({ 
            name: f.name, 
            smartName: f.smartName,
            path: f.path 
          }))
        })
      } else {
        logger.warn(LogCategory.FILE_ORGANIZATION, '[一键整理] 警告：没有找到任何已分析的文件！')
        
        // 调试：查询该路径下所有文件（不管是否已分析）
        const allFiles = this.db
          .prepare(
            `
          SELECT 
            f.id,
            f.name,
            f.path,
            f.is_analyzed
          FROM files f
          WHERE f.path LIKE ? || '%'
             OR REPLACE(f.path, '\\', '/') LIKE ? || '%'
          LIMIT 20
        `
          )
          .all(workspaceDirectoryPath + '\\', normalizedPath + '/') as any[]
        
        logger.info(LogCategory.FILE_ORGANIZATION, '[一键整理] 该路径下的所有文件（前20个）:', {
          total: allFiles.length,
          files: allFiles.map(f => ({
            name: f.name,
            path: f.path,
            isAnalyzed: f.is_analyzed
          }))
        })
      }

      const filesWithTags: FileInfoForAI[] = []

      for (const file of files) {
        // 获取维度标签
        const dimensionTagsArray = this.db
          .prepare(
            `
          SELECT 
            ft.dimension_id as dimension,
            ft.name as tag
          FROM file_tag_relations ftr
          INNER JOIN file_tags ft ON ft.id = ftr.tag_id
          WHERE ftr.file_id = ?
            AND ft.dimension_id IS NOT NULL
        `
          )
          .all(file.id) as any[]

        // 获取内容标签
        const contentTags = this.db
          .prepare(
            `
          SELECT ft.name
          FROM file_tag_relations ftr
          INNER JOIN file_tags ft ON ft.id = ftr.tag_id
          WHERE ftr.file_id = ?
            AND ft.dimension_id IS NULL
        `
          )
          .all(file.id) as any[]

        filesWithTags.push({
          id: file.id,
          name: file.name,
          smartName: file.smartName,
          path: file.path,
          type: file.type || '',
          tags: contentTags.map((t) => t.name),
          dimensionTags: dimensionTagsArray.map((t) => ({
            dimension: t.dimension,
            tag: t.tag
          })),
          description: file.description
        })
      }

      logger.info(LogCategory.FILE_ORGANIZATION, `[一键整理] 准备传递给AI的文件数: ${filesWithTags.length}`)

      return filesWithTags
    } catch (error: any) {
      logger.error(LogCategory.FILE_ORGANIZATION, '获取已分析文件失败', {
        error: error.message
      })
      throw error
    }
  }

  /**
   * 生成一键整理方案
   */
  async generateOrganizePlan(
    workspaceDirectoryPath: string,
    options?: QuickOrganizeOptions
  ): Promise<AIDirectoryStructure> {
    try {
      logger.info(LogCategory.FILE_ORGANIZATION, '开始生成一键整理方案', {
        workspaceDirectoryPath,
        options: { ...options, onProgress: undefined } // 避免日志打印函数
      })

      // 获取已分析的文件
      const analyzedFiles = await this.getAnalyzedFiles(workspaceDirectoryPath)

      if (analyzedFiles.length === 0) {
        throw new Error('当前没有AI分析过的文件，请先在真实目录中勾选文件进行AI分析')
      }

      logger.info(LogCategory.FILE_ORGANIZATION, `[一键整理] 将处理 ${analyzedFiles.length} 个文件`, {
        fileNames: analyzedFiles.map(f => f.smartName || f.name)
      })

      // 1. 准备维度信息 (如果options未提供)
      let dimensionInfo = options?.dimensionInfo
      if (!dimensionInfo) {
        try {
          // 获取所有维度
          const dimensions = this.db.prepare('SELECT id, name, level, tags, trigger_conditions FROM file_dimensions ORDER BY level ASC').all() as any[]
          
          // 获取泛维度配置
          const panDimensionIds = (configService.getValue<number[]>('PAN_DIMENSION_IDS') || [])
          const panIdSet = new Set(panDimensionIds)

          // 提取特殊维度（如“题材”）进行共享定义，避免重复展开
          const specialDimensions = ['题材']
          let sharedDefinitions = ''
          const extractedDimNames = new Set<string>()

          for (const dimName of specialDimensions) {
             const dim = dimensions.find(d => d.name === dimName)
             if (dim) {
                const tags = dim.tags ? JSON.parse(dim.tags) : []
                if (tags.length > 0) {
                   sharedDefinitions += `${dimName}目录集合 = [${tags.join(',')}]`
                   extractedDimNames.add(dimName)
                }
             }
          }

          // 格式化维度信息 (改为树状结构)
          const baseDimensions = dimensions.filter(d => {
             const triggers = d.trigger_conditions ? JSON.parse(d.trigger_conditions) : []
             return triggers.length === 0
          })
          const triggerDimensions = dimensions.filter(d => {
             const triggers = d.trigger_conditions ? JSON.parse(d.trigger_conditions) : []
             return triggers.length > 0
          })

          // 辅助函数：获取被特定父维度标签触发的子维度
          const getTriggeredDimensions = (parentDimName: string, tagName: string) => {
             return triggerDimensions.filter(d => {
                const triggers = JSON.parse(d.trigger_conditions || '[]')
                return triggers.some((t: any) => t.parentDimension === parentDimName && t.triggerTags.includes(tagName))
             })
          }

          const allDirectoryGroups: { name: string[], parent: string }[] = []
          const dimensionMap: Record<string, string> = {}
          const topLevelDirs: string[] = []

          // 递归收集目录结构
          const collectDirectories = (dim: any, parentTag: string = '', depth: number = 0) => {
             if (depth > 5) return // 防止死循环

             const isPan = panIdSet.has(dim.id)

             // 如果是已提取的共享维度，直接引用
             if (extractedDimNames.has(dim.name)) {
                allDirectoryGroups.push({
                    name: [`{${dim.name}目录集合}`],
                    parent: parentTag
                })
                
                // 同时将共享维度内的标签添加到映射表中
                const tags = dim.tags ? JSON.parse(dim.tags) : []
                tags.forEach((tag: string) => {
                    if (parentTag) {
                        dimensionMap[tag] = parentTag
                    } else {
                        topLevelDirs.push(tag)
                    }
                })
                return
             }

             // 如果是泛维度，保留维度名作为提示
             if (isPan) {
                allDirectoryGroups.push({
                    name: [`<${dim.name}>`],
                    parent: parentTag
                })
                return
             }

             const tags = dim.tags ? JSON.parse(dim.tags) : []
             const limit = 20
             const tagsToShow = tags.slice(0, limit)
             const displayTags = [...tagsToShow]
             
             if (tags.length > limit) {
                displayTags.push(`... (共${tags.length}个标签)`)
             }

             if (displayTags.length > 0) {
                 // 添加当前维度的所有标签作为一组兄弟目录
                 allDirectoryGroups.push({
                     name: displayTags,
                     parent: parentTag
                 })
                 
                 // 更新映射表和顶级目录列表
                 tags.forEach((tag: string) => {
                     if (parentTag) {
                         dimensionMap[tag] = parentTag
                     } else {
                         topLevelDirs.push(tag)
                     }
                 })
             }

             // 处理子维度触发
             for (const tag of tagsToShow) {
                const subDims = getTriggeredDimensions(dim.name, tag)
                for (const subDim of subDims) {
                    collectDirectories(subDim, tag, depth + 1)
                }
             }
          }

          // 从基础维度开始收集
          for (const dim of baseDimensions) {
              collectDirectories(dim, "")
          }

          const treeDesc = encode({ directories: allDirectoryGroups })

          dimensionInfo = `
#### 共享目录定义
${sharedDefinitions}

#### 参考目录和层级结构
可以从中选取个别name作为目录，所择name必须匹配文件名，否则不能选择。
${treeDesc}
`
          logger.info(LogCategory.FILE_ORGANIZATION, '[一键整理] 自动注入维度信息', { length: dimensionInfo.length })
          
          // 将生成的映射表保存到 options 中以便传递给 QuickOrganizeService
          if (!options) options = {}
          options.dimensionMap = dimensionMap
          options.topLevelDirs = topLevelDirs
        } catch (error: any) {
          logger.warn(LogCategory.FILE_ORGANIZATION, '[一键整理] 自动获取维度信息失败', { error: error.message })
        }
      }

      // 2. 准备目录分析信息 (如果options未提供)
      let directoryAnalysis = options?.directoryAnalysis
      if (!directoryAnalysis) {
        try {
           const dirResult = this.db.prepare('SELECT context_analysis FROM workspace_directories WHERE path = ?').get(workspaceDirectoryPath) as any
           if (dirResult && dirResult.context_analysis) {
             const analysis = JSON.parse(dirResult.context_analysis)
             // 转换为 QuickOrganizeOptions 需要的格式
             // 注意: 数据库里的字段可能和 Options 定义的不完全一致，需要适配
             if (analysis.directoryType) {
               directoryAnalysis = {
                 directoryType: analysis.directoryType,
                 recommendedDimensions: analysis.recommendedDimensions || [],
                 recommendedTags: analysis.recommendedTags || {},
                 analysisStrategy: analysis.analysisStrategy || '标准策略',
                 namingPattern: analysis.namingPattern || '序号_内容描述',
                 confidence: analysis.confidence || 0.5
               }
               logger.info(LogCategory.FILE_ORGANIZATION, '[一键整理] 自动注入目录分析信息', { type: directoryAnalysis.directoryType })
             }
           }
        } catch (error: any) {
           logger.warn(LogCategory.FILE_ORGANIZATION, '[一键整理] 自动获取目录分析信息失败', { error: error.message })
        }
      }

      // 获取配置中的单次处理大小和AI参数
      const batchSize = configService.getValue<number>('QUEUE_BATCH_SIZE') || 10
      const temperature = configService.getValue<number>('MODEL_TEMPERATURE') || 0.3
      const maxTokens = configService.getValue<number>('MODEL_MAX_TOKENS') || 4000
      
      // 获取模型上下文长度（用于动态计算批次大小）
      const aiServiceMode = configService.getValue<string>('AI_SERVICE_MODE') || 'local'
      let contextLength: number
      let historyWindowSize = 10 // 默认为本地模型的小窗口
      
      if (aiServiceMode === 'cloud') {
        // 云端模型默认给予 16k 上下文长度（如果没有特别指定）
        // 大多数现代云端模型至少支持 16k-128k
        contextLength = 16384 
        // 云端模型上下文充足，可以保留更多历史文件
        historyWindowSize = 100
      } else {
        // 本地模型：尝试从当前模型配置中获取精确的 contextLength
        const modelConfigService = ModelConfigService.getInstance()
        const currentModelId = configService.getValue<string>('SELECTED_MODEL_ID')
        const platform = configService.getValue<string>('AI_PLATFORM')
        
        // loadModelConfig 会根据当前的 AI_PLATFORM (ollama/llama.cpp) 加载对应的模型列表
        const models = modelConfigService.loadModelConfig()
        const currentModel = models.find(m => m.id === currentModelId)

        logger.info(LogCategory.FILE_ORGANIZATION, `[一键整理] 模型配置检查: platform=${platform}, modelId=${currentModelId}, found=${!!currentModel}`)

        if (currentModel && currentModel.contextLength) {
          // 本地模型通常显存受限，且KV Cache占用随长度平方/线性增长
          // 为了稳定性，将可用上下文取1/4长度使用
          contextLength = Math.floor(currentModel.contextLength / 4)
          logger.info(LogCategory.FILE_ORGANIZATION, `[一键整理] 使用当前模型(${currentModelId})的上下文长度(1/4): ${contextLength} (原配置: ${currentModel.contextLength})`)
        } else {
           // 回退到全局默认配置
           contextLength = configService.getValue<number>('CONTEXT_SIZE') || 4096
           logger.info(LogCategory.FILE_ORGANIZATION, `[一键整理] 未找到当前模型(${currentModelId})配置或未设置contextLength，使用全局默认值: ${contextLength}`)
        }
      }

      // 调用一键整理服务生成方案
      const quickOrganizeService = await this.getQuickOrganizeService()
      const structure = await quickOrganizeService.generateOrganizePlan(
        analyzedFiles,
        { 
          batchSize,
          temperature,
          maxTokens: contextLength,
          contextLength,
          historyWindowSize, // 注入滑动窗口大小
          dimensionInfo,     // 注入
          directoryAnalysis, // 注入
          ...options 
        }
      )

      // 统计最终结构中的文件数
      const totalFilesInStructure = structure.directories.reduce(
        (sum, dir) => sum + (dir.files?.length || 0),
        0
      )

      logger.info(LogCategory.FILE_ORGANIZATION, '一键整理方案生成完成', {
        inputFileCount: analyzedFiles.length,
        outputFileCount: totalFilesInStructure,
        directoryCount: structure.directories.length
      })

      if (totalFilesInStructure !== analyzedFiles.length) {
        logger.warn(LogCategory.FILE_ORGANIZATION, `[一键整理] 警告: 输入文件数(${analyzedFiles.length})与输出文件数(${totalFilesInStructure})不匹配！`)
      }

      return structure
    } catch (error: any) {
      logger.error(LogCategory.FILE_ORGANIZATION, '生成一键整理方案失败', {
        error: error.message
      })
      throw error
    }
  }

  /**
   * 快速整理真实目录（AI驱动）
   * @deprecated 使用 generateOrganizePlan + quickOrganize 组合
   */
  async quickOrganize(
    workspaceDirectoryPath: string,
    aiGeneratedStructure: AIDirectoryStructure
  ): Promise<OrganizeStatistics> {
    const startTime = Date.now()
    const statistics: OrganizeStatistics = {
      totalFiles: 0,
      movedFiles: 0,
      failedFiles: 0,
      createdDirectories: 0,
      elapsedTime: 0,
      errors: []
    }

    try {
      logger.info(LogCategory.FILE_ORGANIZATION, '开始快速整理真实目录', {
        workspaceDirectoryPath,
        directoryCount: aiGeneratedStructure.directories.length
      })

      // 收集所有文件操作
      const fileOperations: FileOperation[] = []
      const processedFileIds = new Set<number>()

      // 构建目录路径映射（从目录名到完整路径）
      const buildDirectoryPaths = (directories: DirectoryNode[]): Map<string, string> => {
        const pathMap = new Map<string, string>()
        
        // 先处理所有顶级目录（parent为空）
        for (const dir of directories) {
          if (!dir.parent || dir.parent === '') {
            pathMap.set(dir.name, dir.name)
          }
        }
        
        // 迭代处理子目录，直到所有目录都有路径
        let maxIterations = 10 // 最多3层，10次迭代足够
        let lastProcessedCount = 0
        
        while (maxIterations > 0 && pathMap.size < directories.length) {
          for (const dir of directories) {
            // 跳过已处理的目录
            if (pathMap.has(dir.name)) {
              continue
            }
            
            // 如果父目录已有路径，构建当前目录路径
            if (dir.parent && pathMap.has(dir.parent)) {
              const parentPath = pathMap.get(dir.parent)!
              pathMap.set(dir.name, path.join(parentPath, dir.name))
            }
          }
          
          // 如果没有新的目录被处理，避免死循环
          if (pathMap.size === lastProcessedCount) {
            break
          }
          lastProcessedCount = pathMap.size
          maxIterations--
        }
        
        return pathMap
      }

      const directoryPaths = buildDirectoryPaths(aiGeneratedStructure.directories)
      
      // 获取所有已分析的文件信息，构建文件名到文件信息的映射
      const allFiles = this.db
        .prepare(
          `
        SELECT 
          f.id,
          f.name,
          f.smart_name as smartName,
          f.path
        FROM files f
        WHERE f.is_analyzed = 1
          AND f.workspace_id = (
            SELECT id FROM workspace_directories WHERE path = ?
          )
      `
        )
        .all(workspaceDirectoryPath) as any[]
      
      // 构建文件名到文件信息的映射（同时建立name和smartName两个键）
      const fileNameToInfoMap = new Map<string, {id: number, path: string, smartName: string}>()
      for (const file of allFiles) {
        const fileInfo = {
          id: file.id,
          path: file.path,
          smartName: file.smartName || file.name
        }
        // 同时使用name和smartName作为键，确保能找到文件
        fileNameToInfoMap.set(file.name, fileInfo)
        if (file.smartName && file.smartName !== file.name) {
          fileNameToInfoMap.set(file.smartName, fileInfo)
        }
      }
      
      // 遍历所有目录，创建目录并生成文件操作
      for (const dir of aiGeneratedStructure.directories) {
        const relativePath = directoryPaths.get(dir.name)
        if (!relativePath) {
          logger.warn(LogCategory.FILE_ORGANIZATION, '无法构建目录路径', { 
            dirName: dir.name,
            parent: dir.parent 
          })
          continue
        }
        
        const targetDirPath = path.join(workspaceDirectoryPath, relativePath)

        // 创建目录
        this.ensureDirectoryExists(targetDirPath)
        statistics.createdDirectories++

        // 为每个文件生成移动操作（files数组现在存储的是文件名）
        if (dir.files) {
          for (const fileItem of dir.files) {
            const fileName = typeof fileItem === 'string' ? fileItem : fileItem.name
            // 从文件名查找文件信息
            const fileInfo = fileNameToInfoMap.get(fileName)
          if (!fileInfo) {
            logger.warn(LogCategory.FILE_ORGANIZATION, '找不到文件信息', { fileName })
            continue
          }
          
          if (processedFileIds.has(fileInfo.id)) {
            logger.warn(LogCategory.FILE_ORGANIZATION, '文件重复，跳过', { 
              fileId: fileInfo.id,
              fileName 
            })
            continue // 跳过已处理的文件（去重）
          }
          processedFileIds.add(fileInfo.id)

          const newPath = path.join(targetDirPath, fileInfo.smartName)

          fileOperations.push({
            fileId: fileInfo.id,
            oldPath: fileInfo.path,
            newPath,
            smartName: fileInfo.smartName
          })
          }
        }
      }
      statistics.totalFiles = fileOperations.length

      // 检测文件冲突
      const conflicts = this.detectConflicts(fileOperations)
      if (conflicts.length > 0) {
        logger.warn(LogCategory.FILE_ORGANIZATION, `检测到 ${conflicts.length} 个文件冲突`)
        // 使用默认的重命名策略
        for (const conflict of conflicts) {
          const operation = fileOperations.find((op) => op.newPath === conflict.targetPath)
          if (operation) {
            operation.newPath = this.generateNewPath(operation.newPath, 'number')
          }
        }
      }

      // 执行文件移动
      for (const operation of fileOperations) {
        try {
          const result = await this.organizeFileWithHardlinks(operation)
          if (result.success) {
            statistics.movedFiles++
          } else {
            statistics.failedFiles++
            statistics.errors.push({
              filePath: operation.oldPath,
              error: result.error || '未知错误'
            })
          }
        } catch (error: any) {
          statistics.failedFiles++
          statistics.errors.push({
            filePath: operation.oldPath,
            error: error.message
          })
          logger.error(LogCategory.FILE_ORGANIZATION, '文件移动失败', {
            operation,
            error: error.message
          })
        }
      }

      statistics.elapsedTime = Date.now() - startTime

      logger.info(LogCategory.FILE_ORGANIZATION, '快速整理完成', statistics)

      return statistics
    } catch (error: any) {
      statistics.elapsedTime = Date.now() - startTime
      logger.error(LogCategory.FILE_ORGANIZATION, '快速整理过程出错', {
        error: error.message,
        statistics
      })
      throw error
    }
  }

  private async _deleteVirtualDirectory(id: string, workspaceDirectoryPath: string): Promise<void> {
    try {
      const dirInfo = this.db
        .prepare('SELECT filters FROM virtual_directories WHERE id = ?')
        .get(id) as any

      this.db.prepare('DELETE FROM virtual_directories WHERE id = ?').run(id)

      if (dirInfo) {
        const filters = JSON.parse(dirInfo.filters)
        await this._deleteTopLevelTagDirectory(workspaceDirectoryPath, filters.selectedTags)
      }
      logger.info(LogCategory.FILE_ORGANIZATION, '虚拟目录已删除', { id })
    } catch (error: any) {
      logger.error(LogCategory.FILE_ORGANIZATION, '删除虚拟目录失败', { id, error: error.message })
      // Do not re-throw, as the main operation (file moving) was successful.
    }
  }

  private async _deleteTopLevelTagDirectory(
    workspaceDirectoryPath: string,
    selectedTags: unknown[]
  ): Promise<void> {
    try {
      const virtualDirPath = path.join(workspaceDirectoryPath, VIRTUAL_DIRECTORY_FOLDER)

      if (!fs.existsSync(virtualDirPath)) {
        return
      }

      if (!selectedTags || selectedTags.length === 0) {
        return
      }

      const allVirtualDirectories = this.db
        .prepare(
          `
          SELECT filters FROM virtual_directories 
          WHERE workspace_id = (SELECT id FROM workspace_directories WHERE path = ?)
        `
        )
        .all(workspaceDirectoryPath) as unknown[]

      const otherTagChains: string[][] = allVirtualDirectories.map((dir: any) => {
        const filters = JSON.parse(dir.filters)
        return filters.selectedTags.map((tag: any) => tag.tagValue)
      })

      const tagChain = (selectedTags as any[]).map((tag: any) => tag.tagValue)

      await this._deleteTagChainRecursively(virtualDirPath, tagChain, otherTagChains)
    } catch (error: unknown) {
      logger.error(
        LogCategory.VIRTUAL_DIRECTORY,
        '[VirtualDirectory] 删除tag目录链失败:',
        error
      )
    }
  }

  private async _deleteTagChainRecursively(
    virtualDirPath: string,
    tagChain: string[],
    otherTagChains: string[][]
  ): Promise<void> {
    if (tagChain.length === 0) {
      return
    }

    const currentPath = path.join(virtualDirPath, ...tagChain)

    if (!fs.existsSync(currentPath)) {
      return
    }

    const isUsedByOthers = otherTagChains.some((otherChain) => {
      if (otherChain.length < tagChain.length) {
        return false
      }
      return tagChain.every((tag, index) => tag === otherChain[index])
    })

    if (isUsedByOthers) {
      return
    }

    fs.rmSync(currentPath, { recursive: true, force: true })

    const parentTagChain = tagChain.slice(0, -1)
    if (parentTagChain.length > 0) {
      await this._deleteTagChainRecursively(virtualDirPath, parentTagChain, otherTagChains)
    }
  }
}