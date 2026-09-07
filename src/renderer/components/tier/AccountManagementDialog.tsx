import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { t } from '@app/languages'
import {
  Crown,
  Building2,
  Sparkles,
  ShieldCheck,
  Calendar,
  CreditCard,
  Mail,
  ExternalLink,
  Copy,
  Check,
  Clock,
  Flame as Firecores,
  MessageCircle,
  RefreshCw,
  Sparkle,
  Layers
} from 'lucide-react'
import { useTierStore } from '../../stores/tier-store'
import { useConfigStore } from '../../stores/config-store'
import { UserTier, formatDateOnly, encodeMachineIdToBase64 } from '@firefly/shared'
import { openExternalLink } from '../../lib/external-link'
import { resolveDevCreemUrl } from '../../lib/marketing-link'
import { EmailSvg } from '../ui/EmailSvg'
import { cn } from '../../lib/utils'

interface AccountManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const AccountManagementDialog: React.FC<AccountManagementDialogProps> = ({
  open,
  onOpenChange
}) => {
  const { tier, subscription, firecores, syncFromCloud, fetchProfile } = useTierStore()
  const config = useConfigStore(state => state.config)
  const paymentInfo = (config as any)?.PAYMENT_INFO

  const [identCode, setIdentCode] = useState<string>('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState<boolean>(false)

  const handleSyncStatus = async () => {
    setIsSyncing(true)
    try {
      if (syncFromCloud) {
        await syncFromCloud()
      } else if (fetchProfile) {
        await fetchProfile()
      }
    } catch (err) {
      console.warn('[AccountManagementDialog] 同步最新状态失败:', err)
    } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    const fetchIdent = async () => {
      try {
        let code = ''
        if (window.electronAPI?.license?.getIdentCode) {
          code = await window.electronAPI.license.getIdentCode()
        }
        if (!code && window.electronAPI?.getMachineId) {
          const mId = await window.electronAPI.getMachineId()
          if (mId) code = encodeMachineIdToBase64(mId)
        }
        setIdentCode(code)
      } catch (err) {
        console.warn('[AccountManagementDialog] 获取设备标识码失败:', err)
      }
    }
    if (open) {
      fetchIdent()
      // 打开账户管理弹窗时，主动触发一次云端最新订阅状态同步
      handleSyncStatus()
    }
  }, [open])

  if (!open) return null

  const portalUrl = paymentInfo?.cancellation_portal?.url || 'https://www.creem.io/portal'
  const supportEmail =
    paymentInfo?.support_email ||
    (paymentInfo?.method === 'creem' ? 'support@aifolder.net' : 'support@iocn.cn')
  const privacyUrl =
    paymentInfo?.legal_urls?.privacy_policy || 'https://www.aifolder.net/en-US/privacy'
  const termsUrl =
    paymentInfo?.legal_urls?.terms_of_service || 'https://www.aifolder.net/en-US/terms'

  const copyToClipboard = (text: string, key: string) => {
    try {
      navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => {
        setCopiedKey(null)
      }, 2000)
    } catch {}
  }

  // 动态等级视觉配置与专属权益映射（严格对齐官方方案权益承诺）
  const getTierTheme = (currentTier: UserTier) => {
    switch (currentTier) {
      case UserTier.ENTERPRISE:
        return {
          name: t('企业版'),
          subName: t('最高标准的隐私需求'),
          icon: <Building2 className="w-6 h-6 text-purple-500" />,
          glowClass: 'bg-purple-500/25',
          ringClass: 'ring-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400',
          badgeClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
          cardBgClass:
            'bg-gradient-to-br from-purple-500/[0.12] via-indigo-500/[0.04] to-transparent border-purple-500/30',
          accentText: 'text-purple-600 dark:text-purple-400',
          features: [
            t('Pro版所有权益'),
            t('可完全离线或内网使用'),
            t('支持离线进行新功能升级'),
            t('7*24专属技术支持通道')
          ]
        }
      case UserTier.AGENT:
        return {
          name: t('代理版'),
          subName: t('团队席位与授权分发'),
          icon: <ShieldCheck className="w-6 h-6 text-emerald-500" />,
          glowClass: 'bg-emerald-500/25',
          ringClass: 'ring-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
          badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
          cardBgClass:
            'bg-gradient-to-br from-emerald-500/[0.12] via-teal-500/[0.04] to-transparent border-emerald-500/30',
          accentText: 'text-emerald-600 dark:text-emerald-400',
          features: [
            t('Pro版所有权益'),
            t('多席位授权分发'),
            t('无限文件分析额度'),
            t('优先技术支持通道')
          ]
        }
      case UserTier.PRO:
        return {
          name: t('Pro 专业版'),
          subName: t('为生产力而生'),
          icon: <Crown className="w-6 h-6 text-amber-500" />,
          glowClass: 'bg-amber-500/25',
          ringClass: 'ring-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
          badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
          cardBgClass:
            'bg-gradient-to-br from-amber-500/[0.12] via-orange-500/[0.04] to-transparent border-amber-500/30',
          accentText: 'text-amber-600 dark:text-amber-400',
          features: [
            t('无限文件分析额度'),
            t('无限极速目录槽位'),
            t('无限私有目录槽位'),
            t('无限虚拟目录槽位'),
            t('无限导出'),
            t('专业技术支持')
          ]
        }
      default:
        return {
          name: t('免费版'),
          subName: t('适合个人轻量使用'),
          icon: <Sparkles className="w-6 h-6 text-muted-foreground" />,
          glowClass: 'bg-muted/40',
          ringClass: 'ring-border/60 bg-muted/40 text-muted-foreground',
          badgeClass: 'bg-secondary text-secondary-foreground border-border/60',
          cardBgClass:
            'bg-gradient-to-br from-muted/40 via-muted/15 to-transparent border-border/60',
          accentText: 'text-muted-foreground',
          features: [
            t('极速目录无限文件分析'),
            t('私有目录有限文件分析'),
            t('有限极速/私有/虚拟目录槽位'),
            t('有限导出'),
            t('收集萤火获取等同Pro的权益'),
            t('专业技术支持')
          ]
        }
    }
  }

  const theme = getTierTheme(tier)

  // 订阅有效期状态：临期（30天内）橙色提醒，已过期红色，正常绿色
  const expiryDate = subscription?.expires_at ? new Date(subscription.expires_at) : null
  const isExpired = expiryDate ? expiryDate.getTime() < Date.now() : false
  const isExpiringSoon = expiryDate
    ? !isExpired && expiryDate.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
    : false
  // 多档位独立有效期管理：判断当前是否是企业版并持有未过期的 Pro 版接续期
  const tierPeriods = subscription?.tier_periods
  const proPeriod = tierPeriods?.pro
  const proExpiresAt = proPeriod?.expires_at
  const hasProReserve =
    tier === UserTier.ENTERPRISE &&
    Boolean(
      proExpiresAt &&
        new Date(proExpiresAt).getTime() > Date.now() &&
        proPeriod?.status !== 'refunded'
    )

  const handleOpenBillingPortal = () => {
    openExternalLink(resolveDevCreemUrl(portalUrl))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden border border-border/80 shadow-2xl bg-background/98 backdrop-blur-2xl rounded-3xl no-drag">
        {/* 顶部视觉装饰微光背景 */}
        <div className="relative pt-7 pb-4 px-6 text-center overflow-hidden">
          <div
            className={cn(
              'absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full blur-3xl pointer-events-none opacity-40',
              theme.glowClass
            )}
          />

          <div className="relative z-10 flex flex-col items-center">
            <div
              className={cn(
                'p-3 rounded-2xl ring-4 shadow-sm mb-3 flex items-center justify-center transition-transform duration-300 hover:scale-105',
                theme.ringClass
              )}
            >
              {theme.icon}
            </div>

            <DialogTitle className="text-xl md:text-2xl font-black tracking-tight text-foreground">
              {t('账户与订阅中心')}
            </DialogTitle>
            <DialogDescription className="text-xs font-semibold text-muted-foreground mt-1 max-w-sm">
              {t('管理您当前生效的会员权益、计费周期与自动续订设置')}
            </DialogDescription>
          </div>
        </div>

        <div className="px-6 pb-6 space-y-4 relative z-10 max-h-[75vh] overflow-y-auto">
          {/* ── VIP 会员凭证卡面 (Membership Card) ── */}
          <div
            className={cn(
              'rounded-2xl border p-4.5 relative overflow-hidden transition-all duration-300 shadow-sm',
              theme.cardBgClass
            )}
          >
            {/* 卡片装饰水印徽标 */}
            <div className="absolute -right-4 -bottom-6 opacity-5 pointer-events-none select-none">
              <Sparkle className="w-36 h-36" />
            </div>

            {/* 卡片顶部：方案名称与生效状态指示器 */}
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-border/40 relative z-10">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base font-black tracking-tight text-foreground">
                    {theme.name}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] font-black uppercase px-2 py-0.5 rounded-full border shadow-2xs',
                      theme.badgeClass
                    )}
                  >
                    {t('当前计划')}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground font-medium mt-0.5 truncate">
                  {theme.subName}
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-1.5">
                {isExpired ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    <span>{t('已过期')}</span>
                  </span>
                ) : isExpiringSoon ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    <span>
                      {subscription?.auto_renew === false
                        ? t('即将到期 (不自动续费)')
                        : t('即将到期')}
                    </span>
                  </span>
                ) : subscription?.auto_renew === false ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-2xs" title={t('当前周期享有完整权益，到期后将不再自动扣费')}>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>{t('正常生效中 · 到期不自动续费')}</span>
                  </span>
                ) : subscription?.auto_renew ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-2xs" title={t('到期后将自动续订')}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{t('正常生效中 · 自动续费中')}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{t('正常生效中')}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSyncStatus}
                  disabled={isSyncing}
                  className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors cursor-pointer"
                  title={t('从云端立即刷新最新订阅状态')}
                >
                  <RefreshCw className={cn('w-3 h-3', isSyncing && 'animate-spin text-primary')} />
                </button>
              </div>
            </div>

            {/* 卡片中部：关键属性三列栅格 */}
            <div className="grid grid-cols-3 gap-2.5 py-3 relative z-10">
              {/* 有效期至 */}
              <div className="p-2.5 rounded-xl bg-background/60 border border-border/40 backdrop-blur-xs flex flex-col justify-between">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-primary/70" />
                  <span>{t('有效期至')}</span>
                </span>
                <div className="mt-1.5">
                  <span
                    className={cn(
                      'text-xs font-black tabular-nums tracking-tight',
                      isExpired
                        ? 'text-red-500'
                        : isExpiringSoon
                          ? 'text-amber-500'
                          : 'text-foreground'
                    )}
                  >
                    {subscription?.expires_at
                      ? formatDateOnly(subscription.expires_at)
                      : tier === UserTier.FREE
                        ? t('永久免费')
                        : t('永久有效')}
                  </span>
                  {hasProReserve && (
                    <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold block truncate mt-0.5">
                      {t('到期后接续 Pro')}
                    </span>
                  )}
                </div>
              </div>

              {/* 方案周期 */}
              <div className="p-2.5 rounded-xl bg-background/60 border border-border/40 backdrop-blur-xs flex flex-col justify-between">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3 h-3 text-primary/70" />
                  <span>{t('方案周期')}</span>
                </span>
                <div className="mt-1.5">
                  <span className="text-xs font-black text-foreground truncate block">
                    {subscription?.plan_id?.includes('yearly')
                      ? t('年付周期')
                      : subscription?.plan_id?.includes('half_year')
                        ? t('半年付周期')
                        : subscription?.plan_id?.includes('quarterly')
                          ? t('季付周期')
                          : subscription?.plan_id?.includes('monthly')
                            ? t('月付周期')
                            : tier !== UserTier.FREE
                              ? t('标准授权')
                              : t('基础版')}
                  </span>
                </div>
              </div>

              {/* 萤火点数 */}
              <div className="p-2.5 rounded-xl bg-background/60 border border-border/40 backdrop-blur-xs flex flex-col justify-between">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
                  <Firecores className="w-3 h-3 text-amber-500" />
                  <span>{t('萤火余额')}</span>
                </span>
                <div className="mt-1.5">
                  <span className="text-xs font-black tabular-nums text-foreground">
                    {firecores.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* 卡片下部：当前绑定的设备标识码 */}
            {identCode && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-background/50 border border-border/40 text-[11px] relative z-10 mb-3">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                  <span>{t('授权绑定标识：')}</span>
                  <span className="font-mono text-foreground font-bold tracking-wider">
                    {identCode.slice(0, 6)}...{identCode.slice(-6)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(identCode, 'ident')}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer transition-colors"
                >
                  {copiedKey === 'ident' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span className="text-emerald-500">{t('已复制')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>{t('复制完整标识码')}</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* 包含的核心特权标签 */}
            <div className="pt-2.5 border-t border-border/30 relative z-10">
              <div className="text-[10px] text-muted-foreground/80 font-semibold mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-primary/70" />
                <span>{t('当前方案生效的专属权益：')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {theme.features.map((feature, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-background/70 border border-border/40 text-foreground/80 shadow-2xs"
                  >
                    <Check className="w-2.5 h-2.5 text-primary" />
                    <span>{feature}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ── 多档位权益接续保障：已保留的 Pro 版有效期 ── */}
          {hasProReserve && proExpiresAt && (
            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30 space-y-2.5 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-black text-foreground">
                  <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span>{t('多档位接续保障：已保留的 Pro 版有效期')}</span>
                </div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25">
                  {t('待接续生效')}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-1.5 px-3 rounded-xl bg-background/70 border border-border/50">
                <span className="text-muted-foreground font-medium">{t('Pro 版保留到期日：')}</span>
                <span className="font-mono font-black text-foreground tabular-nums">
                  {formatDateOnly(proExpiresAt)}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {t(
                  '由于企业版与 Pro 版权益有所差异，充值企业版后已立即生效独立计算；您原有的 Pro 版有效期已被完整保留，待企业版到期后，系统将自动恢复并开始您的 Pro 版有效期，期间权益不受任何损耗。'
                )}
              </p>
            </div>
          )}

          {/* ── 账单与自动续订管理模块 ── */}
          {paymentInfo?.method === 'creem' ? (
            <div className="p-4 bg-muted/40 rounded-2xl space-y-3 border border-border/50 relative overflow-hidden">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div className="space-y-1 text-xs">
                  <p className="font-black text-foreground text-sm">
                    {t('自主账单与自动续费服务 (Customer Portal)')}
                  </p>
                  <p className="text-muted-foreground leading-relaxed text-[11px]">
                    {paymentInfo?.cancellation_portal?.instructions ||
                      t(
                        '您可以通过 Creem 国际客户门户随时下载往期发票收据、更新支付信用卡或关闭下期自动续费。关闭后当前计费周期内所有会员权益不受影响。'
                      )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleOpenBillingPortal}
                  variant="outline"
                  className="flex-1 flex items-center justify-center gap-2 font-bold text-xs h-10 rounded-xl border border-primary/25 bg-background/80 hover:bg-accent hover:border-primary/50 text-foreground transition-all duration-200 shadow-2xs hover:shadow-sm cursor-pointer"
                >
                  <CreditCard className="w-4 h-4 text-primary" />
                  <span>{t('前往国际结算门户管理账单与续订')}</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-60 ml-0.5" />
                </Button>
                <Button
                  onClick={handleSyncStatus}
                  disabled={isSyncing}
                  variant="outline"
                  className="h-10 px-3 flex items-center justify-center gap-1.5 font-bold text-xs rounded-xl border border-border/60 bg-background/80 hover:bg-accent text-foreground transition-all duration-200 shadow-2xs hover:shadow-sm cursor-pointer shrink-0"
                  title={t('从云端立即刷新最新订阅状态')}
                >
                  <RefreshCw className={cn('w-3.5 h-3.5 text-primary', isSyncing && 'animate-spin')} />
                  <span>{isSyncing ? t('同步中...') : t('刷新状态')}</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-muted/40 rounded-2xl space-y-2 border border-border/50 text-xs">
              <div className="flex items-center gap-2 font-black text-foreground">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{t('固定周期授权保障')}</span>
              </div>
              <p className="text-muted-foreground leading-relaxed text-[11px]">
                {t(
                  '当前授权为无绑卡固定周期模式，绝无任何自动扣费与扣款风险。授权到期后系统将平滑降级为免费版，不会产生任何额外账单，如需延期请联系客服。'
                )}
              </p>
            </div>
          )}

          {/* ── 客户支持与联系渠道 ── */}
          <div className="p-3 bg-muted/20 rounded-2xl border border-border/40 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 min-w-0">
              <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[11px] font-medium shrink-0">
                {t('售后支持：')}
              </span>
              <div className="shrink-0">
                <EmailSvg email={supportEmail} color="#3b82f6" fontSize={12} />
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(supportEmail, 'email')}
                className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title={t('复制客服邮箱')}
              >
                {copiedKey === 'email' ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>

            {paymentInfo?.method === 'creem' && (
              <button
                type="button"
                onClick={() => openExternalLink('https://t.me/firefly_ai_folder')}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-sky-500/10 text-sky-500 hover:bg-sky-500/20 transition-colors cursor-pointer shrink-0"
              >
                <MessageCircle className="w-3 h-3" />
                <span>Telegram: @firefly_ai_folder</span>
              </button>
            )}
          </div>

          {/* ── 底部法律政策 ── */}
          <div className="flex justify-center items-center gap-3 text-[11px] text-muted-foreground/80 pt-1 border-t border-border/30">
            <button
              type="button"
              onClick={() => openExternalLink(privacyUrl)}
              className="hover:text-primary hover:underline transition-colors cursor-pointer"
            >
              {t('隐私政策')}
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => openExternalLink(termsUrl)}
              className="hover:text-primary hover:underline transition-colors cursor-pointer"
            >
              {t('服务条款与权益须知')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

