import { ModelService } from '../../src/electron/services/model-service'

describe('ModelService VRAM Calculation', () => {
  let modelService: ModelService

  beforeEach(() => {
    modelService = new ModelService()
  })

  it('should calculate VRAM requirements correctly', () => {
    const models = modelService.listModels()
    
    // Check that all models have vramRequiredGB property
    expect(models.every(model => model.vramRequiredGB !== undefined)).toBe(true)
    
    // Check specific models
    const qwenOmniModel = models.find(m => m.id === 'qwen2.5-omni-7b-q4_k_m')
    expect(qwenOmniModel).toBeDefined()
    expect(qwenOmniModel?.vramRequiredGB).toBeCloseTo(7.10, 2)
    
    const gemmaModel = models.find(m => m.id === 'gemma-3-1b-q4_0')
    expect(gemmaModel).toBeDefined()
    expect(gemmaModel?.vramRequiredGB).toBeCloseTo(0.72, 2)
  })

  it('should sort models by VRAM requirements', () => {
    const models = modelService.listModels()
    
    // Check that models are sorted by VRAM requirements (ascending)
    for (let i = 1; i < models.length; i++) {
      expect(models[i-1].vramRequiredGB).toBeLessThanOrEqual(models[i].vramRequiredGB)
    }
  })
})