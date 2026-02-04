/**
 * 文件清理服务
 * 负责删除文件时同步清理所有关联信息
 */

import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { logger, LogCategory } from '@yonuc/shared'
import { t } from '@app/languages'

export class FileCleanupService {
  constructor(private db: Database.Database) {}

  /**
   * 删除文件并清理所有关联信息
   * @param fileId 文件ID
   * @returns 清理统计信息
   */
  async deleteFileAndCleanup(fileId: string): Promise<{
    success: boolean
    deletedHardlinks: number
    removedFromAnalysisQueue: boolean
    recalculatedTags: number
  }> {
    try {
      logger.info(LogCategory.DATABASE_SERVICE, `开始删除文件及清理关联信息: ${fileId}`)

      // 1. 获取文件信息
      const file = this.db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as any
      if (!file) {
        throw new Error(t('文件ID { fileId } 不存在', { fileId }))
      }

      logger.info(LogCategory.DATABASE_SERVICE, `文件信息: ${file.path}`)

      // 获取文件的inode（用于识别硬链接）
      let fileInode: number | null = null
      try {
        const stats = fs.statSync(file.path)
        fileInode = stats.ino
        logger.info(LogCategory.DATABASE_SERVICE, `文件inode: ${fileInode}`)
      } catch (error) {
        logger.warn(LogCategory.DATABASE_SERVICE, `无法获取文件inode，文件可能已被删除: ${file.path}`)
      }

      // 2. 使用事务确保原子性
      const transaction = this.db.transaction(() => {
        // 2.1 删除虚拟目录中的硬链接
        let deletedHardlinks = 0
        if (fileInode !== null) {
          deletedHardlinks = this.cleanupVirtualDirectoryHardlinks(file.path, fileInode)
        }

        // 2.2 获取受影响的tags（用于重新计算计数）
        const affectedTags = this.db
          .prepare(
            `
            SELECT DISTINCT ft.id, ft.name, ft.dimension_id as dimension
            FROM file_tags ft
            INNER JOIN file_tag_relations ftr ON ftr.tag_id = ft.id
            WHERE ftr.file_id = ?
          `
          )
          .all(fileId) as any[]

        logger.info(LogCategory.DATABASE_SERVICE, `受影响的tags数量: ${affectedTags.length}`)

        // 2.3 删除数据库记录（外键级联删除会自动处理file_tag_relations等关联表）
        this.db.prepare('DELETE FROM files WHERE id = ?').run(fileId)
        logger.info(LogCategory.DATABASE_SERVICE, `已删除数据库记录: ${fileId}`)

        // 2.4 清理分析队列
        const queueResult = this.db
          .prepare('DELETE FROM analysis_queue WHERE file_path = ?')
          .run(file.path)
        const removedFromAnalysisQueue = queueResult.changes > 0
        if (removedFromAnalysisQueue) {
          logger.info(LogCategory.DATABASE_SERVICE, `已从分析队列删除: ${file.path}`)
        }

        // 2.5 重新计算tag计数（这里不需要显式操作，因为getDimensionGroups会动态计算）
        // 但我们返回受影响的tags数量供日志使用
        const recalculatedTags = affectedTags.length

        return {
          deletedHardlinks,
          removedFromAnalysisQueue,
          recalculatedTags,
        }
      })

      const result = transaction()

      logger.info(LogCategory.DATABASE_SERVICE, '文件删除及清理完成', {
        fileId,
        filePath: file.path,
        ...result,
      })

      return {
        success: true,
        ...result,
      }
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, `删除文件失败: ${fileId}`, error)
      throw error
    }
  }

  /**
   * 清理虚拟目录中的硬链接
   * @param originalPath 原始文件路径
   * @param fileInode 文件inode
   * @returns 删除的硬链接数量
   */
  private cleanupVirtualDirectoryHardlinks(originalPath: string, fileInode: number): number {
    let deletedCount = 0

    try {
      // 获取文件所属的工作目录
      const file = this.db
        .prepare(
          `
        SELECT md.path as workspace_path
        FROM files f
        INNER JOIN workspace_directories md ON md.id = f.workspace_id
        WHERE f.path = ?
      `
        )
        .get(originalPath) as any

      if (!file) {
        logger.warn(LogCategory.DATABASE_SERVICE, `未找到文件的工作目录: ${originalPath}`)
        return 0
      }

      const virtualDirRoot = path.join(file.workspace_path, '.VirtualDirectory')

      // 检查虚拟目录是否存在
      if (!fs.existsSync(virtualDirRoot)) {
        logger.info(LogCategory.DATABASE_SERVICE, `虚拟目录不存在: ${virtualDirRoot}`)
        return 0
      }

      // 递归扫描虚拟目录，查找并删除硬链接
      deletedCount = this.scanAndDeleteHardlinks(virtualDirRoot, fileInode, originalPath)

      logger.info(LogCategory.DATABASE_SERVICE, `清理硬链接完成，删除数量: ${deletedCount}`)
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, '清理虚拟目录硬链接失败', error)
    }

    return deletedCount
  }

  /**
   * 递归扫描目录并删除匹配的硬链接
   * @param dirPath 目录路径
   * @param targetInode 目标文件inode
   * @param originalPath 原始文件路径（用于日志）
   * @returns 删除的硬链接数量
   */
  private scanAndDeleteHardlinks(
    dirPath: string,
    targetInode: number,
    originalPath: string
  ): number {
    let deletedCount = 0

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        // 跳过ReadMe文件（特殊保护文件）
        if (/^ReadMe_[a-zA-Z\-]{5}\.txt$/.test(entry.name)) {
          continue
        }

        if (entry.isDirectory()) {
          // 递归处理子目录
          deletedCount += this.scanAndDeleteHardlinks(fullPath, targetInode, originalPath)

          // 删除硬链接后，检查目录是否为空，如果为空则删除
          try {
            const remainingEntries = fs.readdirSync(fullPath)
            if (remainingEntries.length === 0) {
              fs.rmdirSync(fullPath)
              logger.info(LogCategory.DATABASE_SERVICE, `删除空目录: ${fullPath}`)
            }
          } catch (error) {
            // 忽略删除空目录的错误
          }
        } else if (entry.isFile()) {
          try {
            const stats = fs.statSync(fullPath)
            
            // 比较inode，如果相同则是硬链接
            if (stats.ino === targetInode) {
              fs.unlinkSync(fullPath)
              deletedCount++
              logger.info(LogCategory.DATABASE_SERVICE, `删除硬链接: ${fullPath}`)
            }
          } catch (error) {
            logger.warn(LogCategory.DATABASE_SERVICE, `检查文件失败: ${fullPath}`, error)
          }
        }
      }
    } catch (error) {
      logger.error(LogCategory.DATABASE_SERVICE, `扫描目录失败: ${dirPath}`, error)
    }

    return deletedCount
  }

  /**
   * 批量删除文件
   * @param fileIds 文件ID数组
   * @returns 删除结果统计
   */
  async batchDeleteFiles(
    fileIds: string[]
  ): Promise<{
    successCount: number
    failedCount: number
    totalDeletedHardlinks: number
    errors: Array<{ fileId: string; error: string }>
  }> {
    let successCount = 0
    let failedCount = 0
    let totalDeletedHardlinks = 0
    const errors: Array<{ fileId: string; error: string }> = []

    logger.info(LogCategory.DATABASE_SERVICE, `开始批量删除文件，数量: ${fileIds.length}`)

    for (const fileId of fileIds) {
      try {
        const result = await this.deleteFileAndCleanup(fileId)
        if (result.success) {
          successCount++
          totalDeletedHardlinks += result.deletedHardlinks
        } else {
          failedCount++
        }
      } catch (error: any) {
        failedCount++
        errors.push({
          fileId,
          error: error.message || String(error),
        })
        logger.error(LogCategory.DATABASE_SERVICE, `批量删除失败: fileId=${fileId}`, error)
      }
    }

    logger.info(LogCategory.DATABASE_SERVICE, `批量删除完成`, {
      total: fileIds.length,
      successCount,
      failedCount,
      totalDeletedHardlinks,
    })

    return {
      successCount,
      failedCount,
      totalDeletedHardlinks,
      errors,
    }
  }
}

