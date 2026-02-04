import { LogCategory, logger } from '@yonuc/shared'
import { SupabaseClient, createClient } from '@supabase/supabase-js'
import { isEqual } from 'lodash-es'

import { ConfigOrchestrator } from '../../config/config-orchestrator'
import { SystemIdentityService } from './system-identity-service'

export class RemoteConfigService {
  private static instance: RemoteConfigService | null = null

  private supabase: SupabaseClient | null = null

  private configOrchestrator: ConfigOrchestrator

  private isSynced = false // 增加同步状态标记

  private constructor() {
    this.configOrchestrator = ConfigOrchestrator.getInstance()
    // Delayed initialization to ensure SystemIdentityService is ready
  }

  static getInstance(): RemoteConfigService {
    if (!RemoteConfigService.instance) {
      RemoteConfigService.instance = new RemoteConfigService()
    }

    return RemoteConfigService.instance
  }

  private initSupabase() {
    // 优先使用 process.env

    const url =
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASE_URL

    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

    // 强制使用 Anon Key 以符合 RLS 要求
    const key = anonKey

    if (url && key) {
      try {
        const identityService = SystemIdentityService.getInstance()
        const machineId = identityService.getMachineId()
        const signature = identityService.getSignature()

        this.supabase = createClient(url, key, {
          global: {
            headers: {
              'x-machine-id': machineId,
              'x-signature': signature
            }
          }
        })

        logger.info(
          LogCategory.SUPABASE,
          `RemoteConfig: Supabase client initialized (Anon Key) with MachineID: ${machineId}`
        )
      } catch (e) {
        logger.error(LogCategory.SUPABASE, 'RemoteConfig: Failed to initialize Supabase client', e)
      }
    } else {
      logger.warn(
        LogCategory.SUPABASE,
        'RemoteConfig: Supabase credentials not found, remote config sync disabled',
        {
          hasUrl: !!url,
          hasKey: !!key
        }
      )
    }
  }

  /**
   * 执行配置同步
   * @param force 是否强制同步，忽略 isSynced 标记
   * @returns 返回更新过的配置键列表
   */
  async syncConfig(force = false): Promise<string[]> {
    if (!this.supabase) {
      this.initSupabase()
    }

    if (!this.supabase) {
      logger.warn(
        LogCategory.SUPABASE,
        'RemoteConfig: Sync skipped - Supabase client not initialized'
      )

      return []
    }

    if (this.isSynced && !force) {
      logger.debug(LogCategory.SUPABASE, 'RemoteConfig: Configuration already synced this session')

      return []
    }

    try {
      const currentLang = this.configOrchestrator.getValue<string>('DEFAULT_LANGUAGE') || 'zh-CN'

      const safeLang = currentLang.toLowerCase().replace('-', '_')

      const tableName = `${safeLang}_system_config`

      logger.info(LogCategory.SUPABASE, `RemoteConfig: Fetching configuration from ${tableName}...`)

      const { data, error } = await this.supabase

        .from(tableName)

        .select('key, value')

      if (error) {
        logger.error(LogCategory.SUPABASE, `RemoteConfig: Failed to fetch from ${tableName}`, {
          error: error.message
        })

        return []
      }

      const updatedKeys: string[] = []
      if (data && data.length > 0) {
        logger.info(LogCategory.SUPABASE, `RemoteConfig: Received ${data.length} keys from cloud`)

        const updates: any = {}

        data.forEach(row => {
          const key = row.key.toUpperCase()

          // 只有当值真的发生变化时才加入更新列表
          const currentValue = this.configOrchestrator.getValue(key as any)

          // 标准化对比：通过 JSON 序列化抹平 undefined 与 缺失属性、以及 null 的差异
          // 确保对比的是"存储形态"的数据
          const normalizedCurrent = currentValue === undefined ? undefined : JSON.parse(JSON.stringify(currentValue))
          const normalizedRemote = row.value === undefined ? undefined : JSON.parse(JSON.stringify(row.value))

          // 使用 lodash.isEqual 进行深度对比
          const isChanged = !isEqual(normalizedCurrent, normalizedRemote)

          // Debug 日志：记录每个配置键的详细信息
          logger.debug(LogCategory.SUPABASE, `RemoteConfig: Checking key ${key}`, {
            // currentValue: JSON.stringify(normalizedCurrent),
            // remoteValue: JSON.stringify(normalizedRemote),
            isChanged,
            force: force
          })

          if (isChanged) {
            logger.info(LogCategory.SUPABASE, `RemoteConfig: Key ${key} has changed, updating...`)

            if (key === 'PAN_DIMENSION_IDS' && Array.isArray(row.value)) {
              updates.PAN_DIMENSION_IDS = row.value
              updatedKeys.push('PAN_DIMENSION_IDS')
            } else if (key === 'LATEST_NEWS' && Array.isArray(row.value)) {
              updates.LATEST_NEWS = row.value
              updatedKeys.push('LATEST_NEWS')
            } else if (key === 'CLOUD_MODEL_CONFIGS' && row.value) {
              updates.CLOUD_MODEL_CONFIGS = row.value
              updatedKeys.push('CLOUD_MODEL_CONFIGS')
            } else if (key === 'LOCAL_MODEL_CONFIGS' && row.value) {
              updates.LOCAL_MODEL_CONFIGS = row.value
              updatedKeys.push('LOCAL_MODEL_CONFIGS')
            }
          } else {
            logger.debug(LogCategory.SUPABASE, `RemoteConfig: Key ${key} unchanged, skipping`)
          }
        })

        if (Object.keys(updates).length > 0) {
          logger.info(
            LogCategory.SUPABASE,
            `RemoteConfig: Applying batch update for keys: ${updatedKeys.join(', ')}`
          )

          this.configOrchestrator.updateValues(updates, { source: 'runtime' })
        } else {
          logger.info(LogCategory.SUPABASE, 'RemoteConfig: Configuration matches local state, no updates applied')
        }

        this.isSynced = true

        logger.info(LogCategory.SUPABASE, 'RemoteConfig: Sync cycle completed successfully')
        return updatedKeys
      } else {
        logger.info(LogCategory.SUPABASE, `RemoteConfig: No data found in ${tableName}`)

        this.isSynced = true // 即使云端没数据，本次会话也标记为已尝试
        return []
      }
    } catch (error) {
      logger.error(LogCategory.SUPABASE, 'RemoteConfig: Sync crashed', error)
      return []
    }
  }
}

export const remoteConfigService = RemoteConfigService.getInstance()