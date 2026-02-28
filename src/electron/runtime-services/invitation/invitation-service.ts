import { ipcMain } from 'electron'
import { databaseService } from '../database/database-service'
import { machineId } from 'node-machine-id'
import { logger, LogCategory } from '@yonuc/shared'

class InvitationService {
  async initialize() {
    ipcMain.handle('invitation/match', async (_, features) => {
      try {
        const id = await machineId()
        
        // Ensure remote config service is initialized and supabase client is ready
        // But databaseService.client is likely referring to Supabase client?
        // Wait, databaseService usually refers to SQLite local DB in this project context.
        // Let's check where `databaseService.client` comes from.
        // Based on search results, databaseService is the SQLite wrapper.
        // It DOES NOT have a `.client` property that is a Supabase client.
        // The Supabase client is in RemoteConfigService or SystemIdentityService.
        
        // We should use RemoteConfigService or create a new client here.
        // Let's use RemoteConfigService as it holds the authenticated client.
        const { RemoteConfigService } = await import('../system/remote-config-service');
        const supabase = RemoteConfigService.getInstance().getSupabaseClient();

        if (!supabase) {
            logger.error(LogCategory.AI_SERVICE, 'Supabase client not initialized');
            return { success: false, error: 'Network service not available' };
        }

        // Call Supabase RPC
        const { data, error } = await supabase.rpc('match_invitation', {
          p_machine_id: id,
          p_app_features: features
        })

        if (error) {
            logger.error(LogCategory.AI_SERVICE, 'Invitation match failed', error)
            return { success: false, error: error.message }
        }

        return data
      } catch (error: any) {
        logger.error(LogCategory.AI_SERVICE, 'Invitation match error', error)
        return { success: false, error: error.message }
      }
    })

    ipcMain.handle('invitation/get-count', async () => {
        try {
            const id = await machineId()
            logger.info(LogCategory.AI_SERVICE, `[Invitation] Getting count for machineId: ${id}`)
            
            const { RemoteConfigService } = await import('../system/remote-config-service');
            const supabase = RemoteConfigService.getInstance().getSupabaseClient();

            if (!supabase) {
                logger.warn(LogCategory.AI_SERVICE, '[Invitation] Supabase client not initialized')
                return 0;
            }

            const { data, error } = await supabase
                .from('machines')
                .select('invitation_count')
                .eq('machine_id', id)
                .single()
            
            if (error) {
                logger.error(LogCategory.AI_SERVICE, '[Invitation] Failed to get count from Supabase', error)
                return 0
            }
            
            logger.info(LogCategory.AI_SERVICE, `[Invitation] Got count: ${data?.invitation_count}`, data)
            return data?.invitation_count || 0
        } catch (error) {
            logger.error(LogCategory.AI_SERVICE, '[Invitation] Error in get-count handler', error)
            return 0
        }
    })
  }
}

export const invitationService = new InvitationService()
