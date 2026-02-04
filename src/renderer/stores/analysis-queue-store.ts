import { create } from 'zustand'
import { AnalysisQueueSnapshot, AnalysisQueueItem } from '@yonuc/types/types'

// 使用全局定义的 AnalysisQueue 类型（来自 electron-api.d.ts）
type AnalysisQueue = {
  items: AnalysisQueueItem[]
  status: import('@yonuc/types').AnalysisQueueStatus
  running: boolean
  currentItem?: AnalysisQueueItem
}

interface AnalysisQueueState {
  snapshot: AnalysisQueueSnapshot
  showModal: boolean
  backgroundMode: boolean
  setShowModal: (v: boolean) => void
  openModal: () => void
  closeModal: () => void
  refresh: () => Promise<void>
  addItems: (items: { path: string; name: string; size: number; type: string }[], forceReanalyze?: boolean) => Promise<void>
  retryFailed: () => Promise<void>
  clearPending: () => Promise<void>
  deleteItem: (id: string) => Promise<void>
  start: () => Promise<void>
  pause: () => Promise<void>
}

const emptySnapshot: AnalysisQueueSnapshot = { items: [], running: false }

export const useAnalysisQueueStore = create<AnalysisQueueState>((set, get) => ({
  snapshot: emptySnapshot,
  showModal: false,
  backgroundMode: false,

  setShowModal: (v) => set({ showModal: v, backgroundMode: !v ? true : false }),
  openModal: () => set({ showModal: true, backgroundMode: false }),
  closeModal: () => set({ showModal: false, backgroundMode: true }),

  refresh: async () => {
    const snap = await window.electronAPI.getAnalysisQueue()
    set({ snapshot: snap })
  },

  addItems: async (items, forceReanalyze) => {
    // 使用 addToAnalysisQueue 而不是 addToAnalysisQueueResolved
    // 这样文件夹会原样加入队列，只在AI分析时才展开子内容
    await window.electronAPI.addToAnalysisQueue(items, forceReanalyze)
    await get().refresh()
  },

  retryFailed: async () => {
    await window.electronAPI.retryFailedAnalysis()
    await get().refresh()
  },

  clearPending: async () => {
    await window.electronAPI.clearPendingAnalysis()
    await get().refresh()
  },

  deleteItem: async (id: string) => {
    await window.electronAPI.deleteAnalysisItem(id)
    await get().refresh()
  },

  start: async () => {
    await window.electronAPI.startAnalysis()
    await get().refresh()
  },

  pause: async () => {
    await window.electronAPI.pauseAnalysis()
    await get().refresh()
  },
}))

// Subscribe to main-process updates once per app
if (typeof window !== 'undefined') {
  const unsub = window.electronAPI.onAnalysisQueueUpdated((snap: AnalysisQueue) => {
    useAnalysisQueueStore.setState({ snapshot: snap })
  })

  // 在订阅后立即执行一次主动刷新，以确保初始状态同步
  useAnalysisQueueStore.getState().refresh();

  // Note: no cleanup here since this module is singleton
}
