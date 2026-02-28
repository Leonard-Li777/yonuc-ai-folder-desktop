import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { t } from '@app/languages'
import { MaterialIcon } from '../../lib/utils'
import { toast } from '../common/Toast'

interface InvitationModalProps {
  isOpen: boolean
  onClose: () => void
  invitationCount: number
  machineId: string
  onRefresh: () => void
  isLoading?: boolean
}

export const InvitationModal: React.FC<InvitationModalProps> = ({
  isOpen,
  onClose,
  invitationCount,
  machineId,
  onRefresh,
  isLoading
}) => {
  const targetCount = 3
  const progress = Math.min((invitationCount / targetCount) * 100, 100)
  const isUnlocked = invitationCount >= targetCount

  // 邀请链接模板
  const inviteLink = `https://aifolder.iocn.cn?ref=${machineId}`
  
  const handleCopyLink = async () => {
    try {
      // 复制链接和话术
      const text = `${t('我发现一个超好用的开源免费AI文件整理工具，一键整理乱七八糟的桌面、下载目录等，文件自动打标！')}\n${inviteLink}`
      await navigator.clipboard.writeText(text)
      toast.success(t('邀请链接已复制'))
    } catch (err) {
      toast.error(t('复制失败'))
    }
  }

  // 自动关闭处理：如果已经解锁，可以考虑自动关闭或显示成功状态
  // 这里我们展示解锁成功的界面
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl bg-background text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            {isUnlocked ? (
              <MaterialIcon icon="check_circle" className="text-green-500 text-xl" />
            ) : (
              <MaterialIcon icon="lock" className="text-yellow-500 text-xl" />
            )}
            {isUnlocked ? t('恭喜！高级功能已解锁') : t('解锁高级功能')}
          </DialogTitle>
          <DialogDescription className="pt-2 text-muted-foreground">
            {isUnlocked 
              ? t('您已成功邀请 {count} 位好友，私有目录功能已永久解锁。', { count: targetCount })
              : t('私有目录是高级功能，邀请 {count} 位好友下载并安装应用后即可永久解锁。', { count: targetCount })
            }
          </DialogDescription>
        </DialogHeader>
        
        {!isUnlocked && (
        <div className="py-4 min-w-0">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">{t('当前进度')}</span>
            <span className="font-semibold text-foreground">{invitationCount} / {targetCount}</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
            <div 
              className="bg-primary h-full transition-all duration-500" 
              style={{ width: `${progress}%` }} 
            />
          </div>
          
          <div className="mt-6 bg-muted/50 p-4 rounded-md">
             <p className="text-sm text-muted-foreground mb-2">{t('您的专属邀请链接：')}</p>
             <div className="bg-background border border-border rounded px-3 py-2 text-sm text-foreground w-full overflow-hidden">
               <div className="truncate select-all" title={inviteLink}>
                 {inviteLink}
               </div>
             </div>
          </div>
        </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {isUnlocked ? (
            <Button onClick={onClose} className="w-full sm:w-auto bg-green-600 hover:bg-green-700">
              <MaterialIcon icon="check" className="mr-2" />
              {t('开始使用')}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onRefresh} disabled={isLoading} className="w-full sm:w-auto border-border text-foreground hover:bg-accent hover:text-accent-foreground">
                {isLoading ? (
                  <MaterialIcon icon="sync" className="animate-spin mr-2" />
                ) : (
                  <MaterialIcon icon="refresh" className="mr-2" />
                )}
                {t('刷新进度')}
              </Button>
              <Button onClick={handleCopyLink} className="w-full sm:w-auto">
                <MaterialIcon icon="content_copy" className="mr-2" />
                {t('复制链接')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
