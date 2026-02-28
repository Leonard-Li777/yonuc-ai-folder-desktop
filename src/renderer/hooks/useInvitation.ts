import { useEffect, useState, useCallback } from 'react';
import { LogCategory, logger } from '@yonuc/shared';

export const useInvitation = (skipInitialization = false) => {
  const [invitationCount, setInvitationCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);

  const refreshCount = useCallback(async () => {
    if (!window.electronAPI?.invitation) {
        logger.warn(LogCategory.RENDERER, 'Invitation API not available');
        return 0;
    }
    try {
        setIsLoading(true);
        logger.info(LogCategory.RENDERER, 'Refreshing invitation count...');
        const countResult = await window.electronAPI.invitation.getCount();
        logger.info(LogCategory.RENDERER, 'Invitation count result:', countResult);
        
        // Note: IPC handler returns raw number (0 or count), not { success: boolean, count: number } structure
        // wait, let's check IPC implementation again.
        // IPC handler code:
        // if (error) return 0
        // return data?.invitation_count || 0
        // So it returns a NUMBER, not an object with success property.
        
        // Correction: The IPC return value is just the number.
        // We need to handle it as a number directly.
        
        // Let's assume valid count is >= 0.
        // But wait, previously we treated it as { success, count }.
        // If IPC returns just a number, then `countResult.success` would be undefined.
        // Let's fix this interpretation.
        
        const count = typeof countResult === 'object' && countResult !== null && 'count' in countResult 
            ? countResult.count 
            : (typeof countResult === 'number' ? countResult : 0);

        setInvitationCount(count);
        return count;

    } catch (e) {
        logger.error(LogCategory.RENDERER, 'Failed to refresh invitation count:', e);
    } finally {
        setIsLoading(false);
    }
    return 0;
  }, []);

  useEffect(() => {
    if (skipInitialization) {
        // Even if skipping initialization, we might want to fetch the initial count?
        // Yes, otherwise it stays at 0 until manual refresh.
        refreshCount();
        return;
    }

    const initInvitation = async () => {
      if (!window.electronAPI?.invitation) return;

      try {
        // 1. Collect features
        // Note: feature collection logic is internal to the hook or we can import it.
        // But since we are in Renderer, we can use the library we created.
        // However, `feature-collection.ts` is in `@yonuc/shared`.
        // We should import it.
        const { collectStableFeatures } = await import('@yonuc/shared');
        const features = await collectStableFeatures();

        logger.info(LogCategory.RENDERER, 'Calling invitation match...', features);

        // 2. Call match
        const result = await window.electronAPI.invitation.match(features);
        logger.info(LogCategory.RENDERER, 'Invitation match result:', result);

        // 3. Get updated count
        await refreshCount();

      } catch (e) {
        logger.error(LogCategory.RENDERER, 'Invitation initialization failed:', e);
      }
    };

    initInvitation();
  }, [refreshCount]);

  return { invitationCount, refreshCount, isLoading };
};
