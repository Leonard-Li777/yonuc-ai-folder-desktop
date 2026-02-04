import React, { useState } from 'react'
import { DirectoryNode, OrganizeType, FileInfoForAI } from '@yonuc/types/organize-types'
import { MaterialIcon } from '../../lib/utils'
import { DirectoryTreePreview } from './DirectoryTreePreview'
import { t } from '@app/languages'

interface ConfirmOrganizeDialogProps {
  organizeType: OrganizeType
  fileCount: number
  directoryStructure: DirectoryNode[]
  fileMap?: Map<number, FileInfoForAI>
  onConfirm: (createBackup: boolean) => void
  onCancel: () => void
}

/**
 * 确认整理对话框
 * 显示整理预览并让用户确认操作
 */
export const ConfirmOrganizeDialog: React.FC<ConfirmOrganizeDialogProps> = ({
  organizeType,
  fileCount,
  directoryStructure,
  fileMap,
  onConfirm,
  onCancel,
}) => {
  const [createBackup, setCreateBackup] = useState(false)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card text-card-foreground rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[80vh] flex flex-col border border-border">
        <div className="flex items-center mb-4">
          <MaterialIcon icon="warning" className="text-yellow-500 text-3xl mr-3" />
          <h2 className="text-xl font-bold">{t('整理真实目录')}</h2>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/50 rounded p-4 mb-4">
          <p className="text-yellow-800 dark:text-yellow-200 font-medium">
            {t('警告：此操作将改变真实目录的文件结构，操作不可撤销，请谨慎操作！')}
          </p>
        </div>
        <h3 className="font-semibold mb-2">{t('整理预览：')}</h3>

        <div className="flex-1 overflow-y-auto mb-4">
          <div className="border rounded p-3 bg-muted/30 dark:bg-muted">
            <DirectoryTreePreview directories={directoryStructure} fileMap={fileMap} />
          </div>
        </div>

        {organizeType === 'quickOrganize' && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/50 rounded p-3 mb-4 flex items-start">
            <MaterialIcon icon="info" className="text-blue-500 text-lg mr-2 mt-0.5 shrink-0" />
            <p className="text-blue-800 dark:text-blue-200 text-sm">
              {t('如果对结果不满意，请使用生成虚拟目录功能，你可以勾选标签，定制化的生成你需要的目录结构')}
            </p>
          </div>
        )}

        <p className="text-muted-foreground mt-2">
          {t('总计：')}<span className="font-bold">{t('{fileCount} 个文件将被移动到新位置', { fileCount })}</span>
        </p>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-input rounded hover:bg-accent hover:text-accent-foreground text-foreground transition-colors"
          >
            {t('取消')}
          </button>
          <button
            onClick={() => onConfirm(createBackup)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            {t('确认整理')}
          </button>
        </div>
      </div>
    </div>
  )
}

