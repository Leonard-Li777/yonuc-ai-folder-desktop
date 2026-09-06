import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { t } from '@app/languages'
import { KeyRound } from 'lucide-react'
import { ActivationCodeSection } from './ActivationCodeSection'

interface ActivationCodeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onActivated?: () => void
}

export const ActivationCodeDialog: React.FC<ActivationCodeDialogProps> = ({
  open,
  onOpenChange,
  onActivated
}) => {
  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden border border-border/80 shadow-2xl rounded-3xl bg-background/95 backdrop-blur-2xl no-drag [&>button]:w-8 [&>button]:h-8 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button_svg]:w-4 [&>button_svg]:h-4 [&>button]:top-4 [&>button]:right-4 [&>button]:rounded-full [&>button]:bg-muted/50 hover:[&>button]:bg-muted">
        {/* 顶部企业版紫罗兰与深色渐变微光背景 */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-28 bg-gradient-to-r from-violet-500/15 via-purple-500/15 to-indigo-500/15 blur-3xl pointer-events-none rounded-full" />

        <DialogHeader className="p-6 pb-2 text-center space-y-2 relative z-10">
          <div className="flex flex-col items-center justify-center gap-2 mb-1">
            <div className="p-3 bg-gradient-to-br from-violet-500/15 via-purple-500/10 to-indigo-500/15 rounded-2xl ring-1 ring-violet-500/30 text-violet-500 shadow-inner">
              <KeyRound className="w-7 h-7" />
            </div>
            <span className="text-[10px] uppercase font-black tracking-widest px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
              {t('企业版专属')}
            </span>
          </div>
          <DialogTitle className="text-2xl font-black tracking-tight text-foreground leading-tight text-center">
            {t('兑换授权激活码')}
          </DialogTitle>
          <DialogDescription className="text-xs font-semibold text-muted-foreground max-w-md mx-auto leading-relaxed text-center">
            {t('在官网购买离线企业授权后，在此输入专属授权码，即时在本地离线校验激活')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 relative z-10">
          <ActivationCodeSection
            tier="enterprise"
            onActivated={() => {
              onActivated?.()
              setTimeout(() => onOpenChange(false), 2000)
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
