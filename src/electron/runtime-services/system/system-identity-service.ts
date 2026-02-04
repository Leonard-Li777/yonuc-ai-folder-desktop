import { LogCategory, logger } from '@yonuc/shared';

import { ConfigOrchestrator } from '../../config/config-orchestrator';
import type { IIdentityProvider } from '@yonuc/types/identity-types';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { machineId } from 'node-machine-id';

const APP_SECRET_KEY = process.env.APP_SECRET_KEY || 'yonuc-ai-folder-secret-key-2026';

export class SystemIdentityService implements IIdentityProvider {
    private static instance: SystemIdentityService | null = null;
    private _machineId: string | null = null;

    static getInstance(): SystemIdentityService {
        if (!SystemIdentityService.instance) {
            SystemIdentityService.instance = new SystemIdentityService();
        }
        return SystemIdentityService.instance;
    }

    async initialize(): Promise<void> {
        const config = ConfigOrchestrator.getInstance();
        const configId = config.getValue<string>('MACHINE_ID');

        if (configId) {
            this._machineId = configId;
        } else {
            try {
                this._machineId = await machineId();
            } catch (e) {
                logger.error(LogCategory.SYSTEM_HEALTH, 'Failed to get system machine id, generating uuid', { error: e });
                this._machineId = crypto.randomUUID();
            }
            if (this._machineId) {
                config.updateValue('MACHINE_ID', this._machineId);
                logger.info(LogCategory.SYSTEM_HEALTH, 'Machine ID initialized', { machineId: this._machineId });
            }
        }

        // Ensure machine is registered with Supabase
        await this.ensureRegistered();
    }

    private async ensureRegistered(): Promise<void> {
        const config = ConfigOrchestrator.getInstance();
        // Check local state first
        const isRegistered = config.getValue<boolean>('MACHINE_REGISTERED') || false;
        if (isRegistered) {
            return;
        }

        const machineId = this.getMachineId();
        const signature = this.getSignature();

        const url = process.env.SUPABASE_URL;
        // Use ANON key for registration (RLS will verify signature)
        const key = process.env.SUPABASE_ANON_KEY;

        if (!url || !key) {
            logger.warn(LogCategory.SUPABASE, 'Supabase credentials missing, cannot register machine');
            return;
        }

        try {
            logger.info(LogCategory.SUPABASE, 'Registering machine with Supabase...');

            const supabase = createClient(url, key, {
                global: {
                    headers: {
                        'x-machine-id': machineId,
                        'x-signature': signature
                    }
                }
            });

            // 1. Check if already exists (using RPC or direct query if RLS allows SELECT own)
            // Since we added "Enable read for own machine", we can select.
            const { data: exists, error: checkError } = await supabase
                .from('machines')
                .select('machine_id')
                .eq('machine_id', machineId)
                .single();

            if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is 'JSON object requested, multiple (or no) rows returned' -> effectively not found for .single()
                // If error is not "not found", maybe permission issue or connection issue
                logger.warn(LogCategory.SUPABASE, 'Failed to check machine existence', checkError);
                // Fallback to try insert anyway? Or stop?
            }

            if (exists) {
                logger.info(LogCategory.SUPABASE, 'Machine already registered (found in DB)', { 
                    existsType: typeof exists, 
                    existsValue: exists, 
                    isArray: Array.isArray(exists) 
                });
                config.updateValue('MACHINE_REGISTERED', true);
                return;
            }

            // 2. Insert
            const { error: insertError } = await supabase
                .from('machines')
                .insert([{ machine_id: machineId }]);

            if (insertError) {
                // duplicate key value violates unique constraint "machines_pkey"
                if (insertError.code === '23505') {
                    logger.info(LogCategory.SUPABASE, 'Machine already registered (duplicate key)');
                    config.updateValue('MACHINE_REGISTERED', true);
                } else {
                    logger.error(LogCategory.SUPABASE, 'Failed to register machine', insertError);
                }
            } else {
                logger.info(LogCategory.SUPABASE, 'Machine registered successfully');   
                config.updateValue('MACHINE_REGISTERED', true);
            }
        } catch (err) {
            logger.error(LogCategory.SUPABASE, 'Error during machine registration', err);
        }
    }

    getMachineId(): string {
        if (!this._machineId) {
            const configId = ConfigOrchestrator.getInstance().getValue<string>('MACHINE_ID');
            if (configId) {
                this._machineId = configId;
                return configId;
            }
            logger.warn(LogCategory.SUPABASE, 'SystemIdentityService not initialized, MACHINE_ID missing in config');
            return 'unknown-machine-id';
        }
        return this._machineId;
    }

    getSignature(): string {
        const id = this.getMachineId();
        return crypto.createHmac('sha256', APP_SECRET_KEY).update(id).digest('hex');
    }
}
