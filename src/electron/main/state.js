import { AnalyzedDirectoryService } from '../runtime-services/filesystem/analyzed-directory-service/index';
import { VirtualDirectoryService } from '../runtime-services/filesystem/virtual-directory-service/index';
// Global service instances
export let globalLlamaIndexService = null;
export function setGlobalLlamaIndexService(service) {
    globalLlamaIndexService = service;
}
export let coreEngine = null;
export function setCoreEngine(engine) {
    coreEngine = engine;
}
export const analyzedDirectoryService = new AnalyzedDirectoryService();
export const virtualDirectoryService = new VirtualDirectoryService();
export let directoryContextService = null;
export function setDirectoryContextService(service) {
    directoryContextService = service;
}
export let organizeRealDirectoryService = null;
export function setOrganizeRealDirectoryService(service) {
    organizeRealDirectoryService = service;
}
export let fileCleanupService = null;
export function setFileCleanupService(service) {
    fileCleanupService = service;
}
// State and caches
export const organizePlanAbortControllers = new Map();
// Reorganize 暂停/结束控制标志（key: virtualDirectoryId）
export const reorganizePauseFlags = new Map();
export const reorganizeEndFlags = new Map();
// 硬件加速后端描述缓存统一由 AI 包维护（llama-engine-service 等包内代码写入），
// 此处 re-export 包内绑定，避免迁移后出现两份独立状态导致 Footer 无法感知 CUDA 等后端
export { activeHardwareBackendCache, setActiveHardwareBackendCache } from '@firefly/electron-llamaIndex-service';
export const syncedDirectories = new Set();
export const cliForceConfigStage = process.argv.includes('--force-config-stage') ||
    process.env.FORCE_CONFIG_STAGE === '1' ||
    process.env.FORCE_CONFIG_STAGE?.toLowerCase() === 'true';
export let initializationPhaseStarted = false;
export function setInitializationPhaseStarted(started) {
    initializationPhaseStarted = started;
}
export let earlyInitializationPromise = null;
export function setEarlyInitializationPromise(promise) {
    earlyInitializationPromise = promise;
}
//# sourceMappingURL=state.js.map