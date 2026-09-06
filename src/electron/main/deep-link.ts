import { app, ipcMain } from 'electron'
import * as path from 'path'
import { logger, LogCategory } from '@firefly/shared'
import { getMainWindow } from './window'

export interface DeepLinkPayload {
  url: string
  action: string // 'rules' | 'open' | etc.
  tab?: string // 例如 'consumption'
  params?: Record<string, string>
}

class DeepLinkManager {
  private static instance: DeepLinkManager
  private pendingDeepLink: DeepLinkPayload | null = null
  private readonly protocol = 'firefly'

  private constructor() {}

  public static getInstance(): DeepLinkManager {
    if (!DeepLinkManager.instance) {
      DeepLinkManager.instance = new DeepLinkManager()
    }
    return DeepLinkManager.instance
  }

  /**
   * 解析 firefly:// 协议 URL
   * 支持格式:
   * firefly://rules?tab=consumption
   * firefly://open?tab=consumption
   * firefly://consumption
   * firefly://transactions
   */
  public parseUrl(rawUrl: string): DeepLinkPayload | null {
    try {
      if (!rawUrl || !rawUrl.startsWith(`${this.protocol}://`)) {
        return null
      }

      const parsed = new URL(rawUrl)
      let action = (parsed.hostname || parsed.pathname.replace(/^\/+/, '') || 'open').toLowerCase()
      const params: Record<string, string> = {}
      parsed.searchParams.forEach((val, key) => {
        params[key] = val
      })

      let tab = params.tab

      // 快捷别名映射
      if (action === 'consumption' || action === 'transactions') {
        action = 'rules'
        tab = 'consumption'
      } else if (action === 'rules' && !tab) {
        tab = 'consumption'
      }

      return {
        url: rawUrl,
        action,
        tab,
        params
      }
    } catch (err) {
      logger.error(LogCategory.MAIN, `[DeepLink] 解析深链接失败: ${rawUrl}`, err)
      return null
    }
  }

  /**
   * 注册操作系统协议 scheme
   */
  public registerProtocol(): void {
    try {
      if (process.defaultApp) {
        if (process.argv.length >= 2) {
          app.setAsDefaultProtocolClient(this.protocol, process.execPath, [
            path.resolve(process.argv[1])
          ])
        }
      } else {
        app.setAsDefaultProtocolClient(this.protocol)
      }
      logger.info(LogCategory.MAIN, `[DeepLink] 协议 ${this.protocol}:// 注册成功`)
    } catch (e) {
      logger.error(LogCategory.MAIN, `[DeepLink] 协议 ${this.protocol}:// 注册失败`, e)
    }
  }

  /**
   * 派发或暂存深链接
   */
  public dispatch(rawUrl: string): void {
    logger.info(LogCategory.MAIN, `[DeepLink] 收到深链接请求: ${rawUrl}`)
    const payload = this.parseUrl(rawUrl)
    if (!payload) return

    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()

      try {
        mainWindow.webContents.send('app:deep-link', payload)
        logger.info(LogCategory.MAIN, `[DeepLink] 已向渲染进程派发深链接:`, payload)
      } catch (err) {
        logger.error(LogCategory.MAIN, `[DeepLink] 向渲染进程派发失败:`, err)
      }
    } else {
      // 窗口未就绪，暂存等渲染进程挂载后拉取
      this.pendingDeepLink = payload
      logger.info(LogCategory.MAIN, `[DeepLink] 窗口尚未就绪，已暂存深链接:`, payload)
    }
  }

  public getPendingDeepLink(): DeepLinkPayload | null {
    const link = this.pendingDeepLink
    this.pendingDeepLink = null
    return link
  }

  public init(): void {
    this.registerProtocol()

    // 检查首次启动参数中是否有深链接 (Windows/Linux 冷启动)
    const deepLinkArg = process.argv.find(arg => arg.startsWith(`${this.protocol}://`))
    if (deepLinkArg) {
      this.dispatch(deepLinkArg)
    }

    // 监听 IPC 查询
    ipcMain.handle('app:get-pending-deep-link', () => {
      return this.getPendingDeepLink()
    })
  }
}

export const deepLinkManager = DeepLinkManager.getInstance()
