/**
 * 测试环境设置文件
 * 为所有测试提供必要的全局配置和模拟
 */

import '@testing-library/jest-dom'
import { vi } from 'vitest'

// 模拟 electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: {
    getConfig: vi.fn().mockResolvedValue({}),
    updateConfig: vi.fn().mockResolvedValue(undefined),
    updateConfigValue: vi.fn().mockResolvedValue(undefined),
    onConfigChange: vi.fn().mockReturnValue(() => { /* cleanup function */ }),
    listModels: vi.fn().mockResolvedValue([]),
    getHardwareInfo: vi.fn().mockResolvedValue({}),
    recommendModelsByHardware: vi.fn().mockResolvedValue([]),
    modelDownload: {
      checkDownloadStatus: vi.fn().mockResolvedValue({ isDownloaded: false }),
    },
    deleteModel: vi.fn().mockResolvedValue(undefined),
    onModelDownloadProgress: vi.fn().mockReturnValue(() => { /* cleanup function */ }),
    onModelDownloadComplete: vi.fn().mockReturnValue(() => { /* cleanup function */ }),
    onModelDownloadError: vi.fn().mockReturnValue(() => { /* cleanup function */ }),
    onModelStatusChanged: vi.fn().mockReturnValue(() => { /* cleanup function */ }),
    onSSLCertificateError: vi.fn().mockReturnValue(() => { /* cleanup function */ }),
    aiService: {
      initialize: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
      isInitialized: vi.fn().mockResolvedValue(false),
      getInitializationInfo: vi.fn().mockResolvedValue({
        isInitialized: false,
        isInitializing: false,
        attempts: 0,
      }),
      getStatus: vi.fn().mockResolvedValue('running'),
      getCapabilities: vi.fn().mockResolvedValue({
        supportsText: true,
        supportsImage: false,
        supportsAudio: false,
        supportsVideo: false,
        maxContextSize: 4096,
        modelName: 'test-model',
        provider: 'local',
      }),
      getCurrentPhase: vi.fn().mockResolvedValue('runtime'),
      onModelChanged: vi.fn().mockResolvedValue({ success: true, message: 'ok' })
    },
    getAnalysisQueue: vi.fn().mockResolvedValue({}),
    addToAnalysisQueue: vi.fn().mockResolvedValue(undefined),
    retryFailedAnalysis: vi.fn().mockResolvedValue(undefined),
    clearPendingAnalysis: vi.fn().mockResolvedValue(undefined),
    deleteAnalysisItem: vi.fn().mockResolvedValue(undefined),
    startAnalysis: vi.fn().mockResolvedValue(undefined),
    pauseAnalysis: vi.fn().mockResolvedValue(undefined),
    onAnalysisQueueUpdated: vi.fn().mockReturnValue(() => { /* cleanup function */ }),
    getAllWorkspaceDirectories: vi.fn().mockResolvedValue([]),
    getCurrentWorkspaceDirectory: vi.fn().mockResolvedValue(null),
    setCurrentWorkspaceDirectory: vi.fn().mockResolvedValue(undefined),
    deleteWorkspaceDirectory: vi.fn().mockResolvedValue(undefined),
    resetWorkspaceDirectory: vi.fn().mockResolvedValue(undefined),
    rescanWorkspaceDirectory: vi.fn().mockResolvedValue({}),
    updateWorkspaceDirectoryAutoWatch: vi.fn().mockResolvedValue(undefined),
    resetAnalysisDatabase: vi.fn().mockResolvedValue(undefined),
    getAnalysisIgnoreRules: vi.fn().mockResolvedValue([]),
    saveAnalysisIgnoreRules: vi.fn().mockResolvedValue(undefined),
    utils: {
      showOpenDialog: vi.fn().mockResolvedValue({}),
      showSaveDialog: vi.fn().mockResolvedValue({}),
      showMessageBox: vi.fn().mockResolvedValue({}),
      getUserHomePath: vi.fn().mockResolvedValue(''),
      joinPath: vi.fn().mockResolvedValue(''),
      openFileWithDefaultApp: vi.fn().mockResolvedValue(undefined),
      openPathInExplorer: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      detectLibreOffice: vi.fn().mockResolvedValue({}),
      openExternal: vi.fn().mockResolvedValue(undefined)
    },
    virtualDirectory: {
      getDimensionGroups: vi.fn().mockResolvedValue([]),
      getFilteredFiles: vi.fn().mockResolvedValue([]),
      saveDirectory: vi.fn().mockResolvedValue(''),
      batchSaveDirectories: vi.fn().mockResolvedValue([]),
      generateFromPreviewTree: vi.fn().mockResolvedValue({}),
      getSavedDirectories: vi.fn().mockResolvedValue([]),
      deleteDirectory: vi.fn().mockResolvedValue(undefined),
      renameDirectory: vi.fn().mockResolvedValue(undefined),
      isFirst: vi.fn().mockResolvedValue(true),
      cleanup: vi.fn().mockResolvedValue(undefined),
      getAnalyzedFilesCount: vi.fn().mockResolvedValue(0)
    },
    organizeRealDirectory: {
      byVirtualDirectory: vi.fn().mockResolvedValue({}),
      getPreview: vi.fn().mockResolvedValue({}),
      openDirectory: vi.fn().mockResolvedValue(undefined),
      deleteAllVirtualDirectories: vi.fn().mockResolvedValue(undefined),
      getSavedVirtualDirectories: vi.fn().mockResolvedValue([]),
      getAnalyzedFiles: vi.fn().mockResolvedValue([]),
      quickOrganize: vi.fn().mockResolvedValue({}),
      generatePlan: vi.fn().mockResolvedValue({}),
      listSessions: vi.fn().mockResolvedValue([]),
      undoSession: vi.fn().mockResolvedValue({}),
      deleteSession: vi.fn().mockResolvedValue({}),
      onProgressUpdate: vi.fn().mockReturnValue(() => { /* cleanup function */ }),
      onPlanProgress: vi.fn().mockReturnValue(undefined),
      removePlanProgressListener: vi.fn().mockReturnValue(undefined)
    },
    emptyFolder: {
      scan: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({})
    },
    getAIStatus: vi.fn().mockResolvedValue('idle')
  },
  writable: true
})

// 全局变量设置
;(globalThis as unknown as { vi: typeof vi }).vi = vi