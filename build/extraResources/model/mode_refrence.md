export const SYSTEM_PROVIDERS_CONFIG: Record<SystemProviderId, SystemProvider> = {
  cherryin: {
    id: 'cherryin',
    name: 'CherryIN',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://open.cherryin.net',
    anthropicApiHost: 'https://open.cherryin.net',
    models: [],
    isSystem: true,
    enabled: true
  },
  silicon: {
    id: 'silicon',
    name: 'Silicon',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.siliconflow.cn',
    anthropicApiHost: 'https://api.siliconflow.cn',
    models: SYSTEM_MODELS.silicon,
    isSystem: true,
    enabled: false
  },
  aihubmix: {
    id: 'aihubmix',
    name: 'AiHubMix',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://aihubmix.com',
    anthropicApiHost: 'https://aihubmix.com/anthropic',
    models: SYSTEM_MODELS.aihubmix,
    isSystem: true,
    enabled: false
  },
  ovms: {
    id: 'ovms',
    name: 'OpenVINO Model Server',
    type: 'openai',
    apiKey: '',
    apiHost: 'http://localhost:8000/v3/',
    models: SYSTEM_MODELS.ovms,
    isSystem: true,
    enabled: false
  },
  ocoolai: {
    id: 'ocoolai',
    name: 'ocoolAI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.ocoolai.com',
    models: SYSTEM_MODELS.ocoolai,
    isSystem: true,
    enabled: false
  },
  zhipu: {
    id: 'zhipu',
    name: 'ZhiPu',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://open.bigmodel.cn/api/paas/v4/',
    anthropicApiHost: 'https://open.bigmodel.cn/api/anthropic',
    models: SYSTEM_MODELS.zhipu,
    isSystem: true,
    enabled: false
  },
  deepseek: {
    id: 'deepseek',
    name: 'deepseek',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.deepseek.com',
    anthropicApiHost: 'https://api.deepseek.com/anthropic',
    models: SYSTEM_MODELS.deepseek,
    isSystem: true,
    enabled: false
  },
  alayanew: {
    id: 'alayanew',
    name: 'AlayaNew',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://deepseek.alayanew.com',
    models: SYSTEM_MODELS.alayanew,
    isSystem: true,
    enabled: false
  },
  dmxapi: {
    id: 'dmxapi',
    name: 'DMXAPI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://www.dmxapi.cn',
    anthropicApiHost: 'https://www.dmxapi.cn',
    models: SYSTEM_MODELS.dmxapi,
    isSystem: true,
    enabled: false
  },
  aionly: {
    id: 'aionly',
    name: 'AIOnly',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.aiionly.com',
    models: SYSTEM_MODELS.aionly,
    isSystem: true,
    enabled: false
  },
  burncloud: {
    id: 'burncloud',
    name: 'BurnCloud',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://ai.burncloud.com',
    models: SYSTEM_MODELS.burncloud,
    isSystem: true,
    enabled: false
  },
  tokenflux: {
    id: 'tokenflux',
    name: 'TokenFlux',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://tokenflux.ai',
    models: SYSTEM_MODELS.tokenflux,
    isSystem: true,
    enabled: false
  },
  '302ai': {
    id: '302ai',
    name: '302.AI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.302.ai',
    models: SYSTEM_MODELS['302ai'],
    isSystem: true,
    enabled: false
  },
  cephalon: {
    id: 'cephalon',
    name: 'Cephalon',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://cephalon.cloud/user-center/v1/model',
    models: SYSTEM_MODELS.cephalon,
    isSystem: true,
    enabled: false
  },
  lanyun: {
    id: 'lanyun',
    name: 'LANYUN',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://maas-api.lanyun.net',
    models: SYSTEM_MODELS.lanyun,
    isSystem: true,
    enabled: false
  },
  ph8: {
    id: 'ph8',
    name: 'PH8',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://ph8.co',
    models: SYSTEM_MODELS.ph8,
    isSystem: true,
    enabled: false
  },
  sophnet: {
    id: 'sophnet',
    name: 'SophNet',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://www.sophnet.com/api/open-apis/v1',
    models: [],
    isSystem: true,
    enabled: false
  },
  ppio: {
    id: 'ppio',
    name: 'PPIO',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.ppinfra.com/v3/openai/',
    models: SYSTEM_MODELS.ppio,
    isSystem: true,
    enabled: false
  },
  qiniu: {
    id: 'qiniu',
    name: 'Qiniu',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.qnaigc.com',
    anthropicApiHost: 'https://api.qnaigc.com',
    models: SYSTEM_MODELS.qiniu,
    isSystem: true,
    enabled: false
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://openrouter.ai/api/v1/',
    models: SYSTEM_MODELS.openrouter,
    isSystem: true,
    enabled: false
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    type: 'openai',
    apiKey: '',
    apiHost: 'http://localhost:11434',
    models: SYSTEM_MODELS.ollama,
    isSystem: true,
    enabled: false
  },
  'new-api': {
    id: 'new-api',
    name: 'New API',
    type: 'new-api',
    apiKey: '',
    apiHost: 'http://localhost:3000',
    anthropicApiHost: 'http://localhost:3000',
    models: SYSTEM_MODELS['new-api'],
    isSystem: true,
    enabled: false
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    type: 'openai',
    apiKey: '',
    apiHost: 'http://localhost:1234',
    models: SYSTEM_MODELS.lmstudio,
    isSystem: true,
    enabled: false
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    apiKey: '',
    apiHost: 'https://api.anthropic.com',
    models: SYSTEM_MODELS.anthropic,
    isSystem: true,
    enabled: false
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai-response',
    apiKey: '',
    apiHost: 'https://api.openai.com',
    models: SYSTEM_MODELS.openai,
    isSystem: true,
    enabled: false,
    serviceTier: OpenAIServiceTiers.auto
  },
  'azure-openai': {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    type: 'azure-openai',
    apiKey: '',
    apiHost: '',
    apiVersion: '',
    models: SYSTEM_MODELS['azure-openai'],
    isSystem: true,
    enabled: false
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    type: 'gemini',
    apiKey: '',
    apiHost: 'https://generativelanguage.googleapis.com',
    models: SYSTEM_MODELS.gemini,
    isSystem: true,
    enabled: false,
    isVertex: false
  },
  vertexai: {
    id: 'vertexai',
    name: 'VertexAI',
    type: 'vertexai',
    apiKey: '',
    apiHost: '',
    models: SYSTEM_MODELS.vertexai,
    isSystem: true,
    enabled: false,
    isVertex: true
  },
  github: {
    id: 'github',
    name: 'Github Models',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://models.github.ai/inference',
    models: SYSTEM_MODELS.github,
    isSystem: true,
    enabled: false
  },
  copilot: {
    id: 'copilot',
    name: 'Github Copilot',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.githubcopilot.com/',
    models: SYSTEM_MODELS.copilot,
    isSystem: true,
    enabled: false,
    isAuthed: false
  },
  yi: {
    id: 'yi',
    name: 'Yi',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.lingyiwanwu.com',
    models: SYSTEM_MODELS.yi,
    isSystem: true,
    enabled: false
  },
  moonshot: {
    id: 'moonshot',
    name: 'Moonshot AI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.moonshot.cn',
    anthropicApiHost: 'https://api.moonshot.cn/anthropic',
    models: SYSTEM_MODELS.moonshot,
    isSystem: true,
    enabled: false
  },
  baichuan: {
    id: 'baichuan',
    name: 'BAICHUAN AI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.baichuan-ai.com',
    models: SYSTEM_MODELS.baichuan,
    isSystem: true,
    enabled: false
  },
  dashscope: {
    id: 'dashscope',
    name: 'Bailian',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://dashscope.aliyuncs.com/compatible-mode/v1/',
    anthropicApiHost: 'https://dashscope.aliyuncs.com/apps/anthropic',
    models: SYSTEM_MODELS.dashscope,
    isSystem: true,
    enabled: false
  },
  stepfun: {
    id: 'stepfun',
    name: 'StepFun',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.stepfun.com',
    models: SYSTEM_MODELS.stepfun,
    isSystem: true,
    enabled: false
  },
  doubao: {
    id: 'doubao',
    name: 'doubao',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://ark.cn-beijing.volces.com/api/v3/',
    models: SYSTEM_MODELS.doubao,
    isSystem: true,
    enabled: false
  },
  infini: {
    id: 'infini',
    name: 'Infini',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://cloud.infini-ai.com/maas',
    models: SYSTEM_MODELS.infini,
    isSystem: true,
    enabled: false
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.minimaxi.com/v1',
    anthropicApiHost: 'https://api.minimaxi.com/anthropic',
    models: SYSTEM_MODELS.minimax,
    isSystem: true,
    enabled: false
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.groq.com/openai',
    models: SYSTEM_MODELS.groq,
    isSystem: true,
    enabled: false
  },
  together: {
    id: 'together',
    name: 'Together',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.together.xyz',
    models: SYSTEM_MODELS.together,
    isSystem: true,
    enabled: false
  },
  fireworks: {
    id: 'fireworks',
    name: 'Fireworks',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.fireworks.ai/inference',
    models: SYSTEM_MODELS.fireworks,
    isSystem: true,
    enabled: false
  },
  nvidia: {
    id: 'nvidia',
    name: 'nvidia',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://integrate.api.nvidia.com',
    models: SYSTEM_MODELS.nvidia,
    isSystem: true,
    enabled: false
  },
  grok: {
    id: 'grok',
    name: 'Grok',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.x.ai',
    models: SYSTEM_MODELS.grok,
    isSystem: true,
    enabled: false
  },
  hyperbolic: {
    id: 'hyperbolic',
    name: 'Hyperbolic',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.hyperbolic.xyz',
    models: SYSTEM_MODELS.hyperbolic,
    isSystem: true,
    enabled: false
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.mistral.ai',
    models: SYSTEM_MODELS.mistral,
    isSystem: true,
    enabled: false
  },
  jina: {
    id: 'jina',
    name: 'Jina',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.jina.ai',
    models: SYSTEM_MODELS.jina,
    isSystem: true,
    enabled: false
  },
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.perplexity.ai/',
    models: SYSTEM_MODELS.perplexity,
    isSystem: true,
    enabled: false
  },
  modelscope: {
    id: 'modelscope',
    name: 'ModelScope',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api-inference.modelscope.cn/v1/',
    anthropicApiHost: 'https://api-inference.modelscope.cn',
    models: SYSTEM_MODELS.modelscope,
    isSystem: true,
    enabled: false
  },
  xirang: {
    id: 'xirang',
    name: 'Xirang',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://wishub-x1.ctyun.cn',
    models: SYSTEM_MODELS.xirang,
    isSystem: true,
    enabled: false
  },
  hunyuan: {
    id: 'hunyuan',
    name: 'hunyuan',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.hunyuan.cloud.tencent.com',
    models: SYSTEM_MODELS.hunyuan,
    isSystem: true,
    enabled: false
  },
  'tencent-cloud-ti': {
    id: 'tencent-cloud-ti',
    name: 'Tencent Cloud TI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.lkeap.cloud.tencent.com',
    models: SYSTEM_MODELS['tencent-cloud-ti'],
    isSystem: true,
    enabled: false
  },
  'baidu-cloud': {
    id: 'baidu-cloud',
    name: 'Baidu Cloud',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://qianfan.baidubce.com/v2/',
    models: SYSTEM_MODELS['baidu-cloud'],
    isSystem: true,
    enabled: false
  },
  gpustack: {
    id: 'gpustack',
    name: 'GPUStack',
    type: 'openai',
    apiKey: '',
    apiHost: '',
    models: SYSTEM_MODELS.gpustack,
    isSystem: true,
    enabled: false
  },
  voyageai: {
    id: 'voyageai',
    name: 'VoyageAI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.voyageai.com',
    models: SYSTEM_MODELS.voyageai,
    isSystem: true,
    enabled: false
  },
  'aws-bedrock': {
    id: 'aws-bedrock',
    name: 'AWS Bedrock',
    type: 'aws-bedrock',
    apiKey: '',
    apiHost: '',
    models: SYSTEM_MODELS['aws-bedrock'],
    isSystem: true,
    enabled: false
  },
  poe: {
    id: 'poe',
    name: 'Poe',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.poe.com/v1/',
    models: SYSTEM_MODELS['poe'],
    isSystem: true,
    enabled: false
  },
  longcat: {
    id: 'longcat',
    name: 'LongCat',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.longcat.chat/openai',
    anthropicApiHost: 'https://api.longcat.chat/anthropic',
    models: SYSTEM_MODELS.longcat,
    isSystem: true,
    enabled: false
  },
  huggingface: {
    id: 'huggingface',
    name: 'Hugging Face',
    type: 'openai-response',
    apiKey: '',
    apiHost: 'https://router.huggingface.co/v1/',
    models: [],
    isSystem: true,
    enabled: false
  },
  gateway: {
    id: 'gateway',
    name: 'Vercel AI Gateway',
    type: 'gateway',
    apiKey: '',
    apiHost: 'https://ai-gateway.vercel.sh/v1/ai',
    models: [],
    isSystem: true,
    enabled: false
  },
  cerebras: {
    id: 'cerebras',
    name: 'Cerebras AI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.cerebras.ai/v1',
    models: SYSTEM_MODELS.cerebras,
    isSystem: true,
    enabled: false
  }
} as const


import type { Model, SystemProviderId } from '@renderer/types'

export const glm45FlashModel: Model = {
  id: 'glm-4.5-flash',
  name: 'GLM-4.5-Flash',
  provider: 'cherryai',
  group: 'GLM-4.5'
}

export const qwen38bModel: Model = {
  id: 'Qwen/Qwen3-8B',
  name: 'Qwen3-8B',
  provider: 'cherryai',
  group: 'Qwen'
}

export const SYSTEM_MODELS: Record<SystemProviderId | 'defaultModel', Model[]> = {
  defaultModel: [
    // Default assistant model
    glm45FlashModel,
    // Default topic naming model
    qwen38bModel,
    // Default translation model
    glm45FlashModel,
    // Default quick assistant model
    glm45FlashModel
  ],
  cherryin: [],
  vertexai: [],
  sophnet: [],
  '302ai': [
    {
      id: 'deepseek-chat',
      name: 'deepseek-chat',
      provider: '302ai',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-reasoner',
      name: 'deepseek-reasoner',
      provider: '302ai',
      group: 'DeepSeek'
    },
    {
      id: 'chatgpt-4o-latest',
      name: 'chatgpt-4o-latest',
      provider: '302ai',
      group: 'OpenAI'
    },
    {
      id: 'gpt-4.1',
      name: 'gpt-4.1',
      provider: '302ai',
      group: 'OpenAI'
    },
    {
      id: 'o3',
      name: 'o3',
      provider: '302ai',
      group: 'OpenAI'
    },
    {
      id: 'o4-mini',
      name: 'o4-mini',
      provider: '302ai',
      group: 'OpenAI'
    },
    {
      id: 'qwen3-235b-a22b',
      name: 'qwen3-235b-a22b',
      provider: '302ai',
      group: 'Qwen'
    },
    {
      id: 'gemini-2.5-flash-preview-05-20',
      name: 'gemini-2.5-flash-preview-05-20',
      provider: '302ai',
      group: 'Gemini'
    },
    {
      id: 'gemini-2.5-pro-preview-06-05',
      name: 'gemini-2.5-pro-preview-06-05',
      provider: '302ai',
      group: 'Gemini'
    },
    {
      id: 'claude-sonnet-4-20250514',
      provider: '302ai',
      name: 'claude-sonnet-4-20250514',
      group: 'Anthropic'
    },
    {
      id: 'claude-opus-4-20250514',
      provider: '302ai',
      name: 'claude-opus-4-20250514',
      group: 'Anthropic'
    },
    {
      id: 'jina-clip-v2',
      name: 'jina-clip-v2',
      provider: '302ai',
      group: 'Jina AI'
    },
    {
      id: 'jina-reranker-m0',
      name: 'jina-reranker-m0',
      provider: '302ai',
      group: 'Jina AI'
    }
  ],
  ph8: [
    {
      id: 'deepseek-v3-241226',
      name: 'deepseek-v3-241226',
      provider: 'ph8',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-r1-250120',
      name: 'deepseek-r1-250120',
      provider: 'ph8',
      group: 'DeepSeek'
    }
  ],
  aihubmix: [
    {
      id: 'gpt-5',
      provider: 'aihubmix',
      name: 'gpt-5',
      group: 'OpenAI'
    },
    {
      id: 'gpt-5-mini',
      provider: 'aihubmix',
      name: 'gpt-5-mini',
      group: 'OpenAI'
    },
    {
      id: 'gpt-5-nano',
      provider: 'aihubmix',
      name: 'gpt-5-nano',
      group: 'OpenAI'
    },
    {
      id: 'gpt-5-chat-latest',
      provider: 'aihubmix',
      name: 'gpt-5-chat-latest',
      group: 'OpenAI'
    },
    {
      id: 'o3',
      provider: 'aihubmix',
      name: 'o3',
      group: 'OpenAI'
    },
    {
      id: 'o4-mini',
      provider: 'aihubmix',
      name: 'o4-mini',
      group: 'OpenAI'
    },
    {
      id: 'gpt-4.1',
      provider: 'aihubmix',
      name: 'gpt-4.1',
      group: 'OpenAI'
    },
    {
      id: 'gpt-4o',
      provider: 'aihubmix',
      name: 'gpt-4o',
      group: 'OpenAI'
    },
    {
      id: 'gpt-image-1',
      provider: 'aihubmix',
      name: 'gpt-image-1',
      group: 'OpenAI'
    },
    {
      id: 'DeepSeek-V3',
      provider: 'aihubmix',
      name: 'DeepSeek-V3',
      group: 'DeepSeek'
    },
    {
      id: 'DeepSeek-R1',
      provider: 'aihubmix',
      name: 'DeepSeek-R1',
      group: 'DeepSeek'
    },
    {
      id: 'claude-sonnet-4-20250514',
      provider: 'aihubmix',
      name: 'claude-sonnet-4-20250514',
      group: 'Claude'
    },
    {
      id: 'gemini-2.5-pro',
      provider: 'aihubmix',
      name: 'gemini-2.5-pro',
      group: 'Gemini'
    },
    {
      id: 'gemini-2.5-flash-nothink',
      provider: 'aihubmix',
      name: 'gemini-2.5-flash-nothink',
      group: 'Gemini'
    },
    {
      id: 'gemini-2.5-flash',
      provider: 'aihubmix',
      name: 'gemini-2.5-flash',
      group: 'Gemini'
    },
    {
      id: 'Qwen3-235B-A22B-Instruct-2507',
      provider: 'aihubmix',
      name: 'Qwen3-235B-A22B-Instruct-2507',
      group: 'qwen'
    },
    {
      id: 'kimi-k2-0711-preview',
      provider: 'aihubmix',
      name: 'kimi-k2-0711-preview',
      group: 'moonshot'
    },
    {
      id: 'Llama-4-Scout-17B-16E-Instruct',
      provider: 'aihubmix',
      name: 'Llama-4-Scout-17B-16E-Instruct',
      group: 'llama'
    },
    {
      id: 'Llama-4-Maverick-17B-128E-Instruct-FP8',
      provider: 'aihubmix',
      name: 'Llama-4-Maverick-17B-128E-Instruct-FP8',
      group: 'llama'
    }
  ],

  burncloud: [
    { id: 'claude-opus-4-5-20251101', provider: 'burncloud', name: 'Claude 4.5 Opus', group: 'Claude 4.5' },
    { id: 'claude-sonnet-4-5-20250929', provider: 'burncloud', name: 'Claude 4.5 Sonnet', group: 'Claude 4.5' },
    { id: 'claude-haiku-4-5-20251001', provider: 'burncloud', name: 'Claude 4.5 Haiku', group: 'Claude 4.5' },

    { id: 'gpt-5', provider: 'burncloud', name: 'GPT 5', group: 'GPT 5' },
    { id: 'gpt-5.1', provider: 'burncloud', name: 'GPT 5.1', group: 'GPT 5.1' },

    { id: 'gemini-2.5-flash', provider: 'burncloud', name: 'Gemini 2.5 Flash', group: 'Gemini 2.5' },
    { id: 'gemini-2.5-flash-image', provider: 'burncloud', name: 'Gemini 2.5 Flash Image', group: 'Gemini 2.5' },
    { id: 'gemini-2.5-pro', provider: 'burncloud', name: 'Gemini 2.5 Pro', group: 'Gemini 2.5' },
    { id: 'gemini-3-pro-preview', provider: 'burncloud', name: 'Gemini 3 Pro Preview', group: 'Gemini 3' },

    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', provider: 'burncloud', group: 'deepseek-ai' },
    { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'burncloud', group: 'deepseek-ai' }
  ],
  ovms: [],
  ollama: [],
  lmstudio: [],
  silicon: [
    {
      id: 'deepseek-ai/DeepSeek-V3.2',
      name: 'deepseek-ai/DeepSeek-V3.2',
      provider: 'silicon',
      group: 'deepseek-ai'
    },
    {
      id: 'Qwen/Qwen3-8B',
      name: 'Qwen/Qwen3-8B',
      provider: 'silicon',
      group: 'Qwen'
    },
    {
      id: 'BAAI/bge-m3',
      name: 'BAAI/bge-m3',
      provider: 'silicon',
      group: 'BAAI'
    }
  ],
  ppio: [
    {
      id: 'deepseek/deepseek-v3.2',
      provider: 'ppio',
      name: 'DeepSeek V3.2',
      group: 'deepseek'
    },
    {
      id: 'minimax/minimax-m2',
      provider: 'ppio',
      name: 'MiniMax M2',
      group: 'minimaxai'
    },
    {
      id: 'qwen/qwen3-235b-a22b-instruct-2507',
      provider: 'ppio',
      name: 'Qwen3-235b-a22b-instruct-2507',
      group: 'qwen'
    },
    {
      id: 'qwen/qwen3-vl-235b-a22b-instruct',
      provider: 'ppio',
      name: 'Qwen3-vl-235b-a22b-instruct',
      group: 'qwen'
    },
    {
      id: 'qwen/qwen3-embedding-8b',
      provider: 'ppio',
      name: 'Qwen3 Embedding 8B',
      group: 'qwen'
    },
    {
      id: 'qwen/qwen3-reranker-8b',
      provider: 'ppio',
      name: 'Qwen3 Reranker 8B',
      group: 'qwen'
    }
  ],
  alayanew: [],
  openai: [
    { id: 'gpt-5.1', provider: 'openai', name: ' GPT 5.1', group: 'GPT 5.1' },
    { id: 'gpt-5', provider: 'openai', name: ' GPT 5', group: 'GPT 5' },
    { id: 'gpt-5-mini', provider: 'openai', name: ' GPT 5 Mini', group: 'GPT 5' },
    { id: 'gpt-5-nano', provider: 'openai', name: ' GPT 5 Nano', group: 'GPT 5' },
    { id: 'gpt-5-pro', provider: 'openai', name: ' GPT 5 Pro', group: 'GPT 5' },
    { id: 'gpt-5-chat', provider: 'openai', name: ' GPT 5 Chat', group: 'GPT 5' },
    { id: 'gpt-image-1', provider: 'openai', name: ' GPT Image 1', group: 'GPT Image' }
  ],
  'azure-openai': [
    {
      id: 'gpt-4o',
      provider: 'azure-openai',
      name: ' GPT-4o',
      group: 'GPT 4o'
    },
    {
      id: 'gpt-4o-mini',
      provider: 'azure-openai',
      name: ' GPT-4o-mini',
      group: 'GPT 4o'
    }
  ],
  gemini: [
    {
      id: 'gemini-2.5-flash',
      provider: 'gemini',
      name: 'Gemini 2.5 Flash',
      group: 'Gemini 2.5'
    },
    {
      id: 'gemini-2.5-pro',
      provider: 'gemini',
      name: 'Gemini 2.5 Pro',
      group: 'Gemini 2.5'
    },
    {
      id: 'gemini-2.5-flash-image-preview',
      provider: 'gemini',
      name: 'Gemini 2.5 Flash Image',
      group: 'Gemini 2.5'
    },
    {
      id: 'gemini-3-pro-image-preview',
      provider: 'gemini',
      name: 'Gemini 3 Pro Image Privew',
      group: 'Gemini 3'
    },
    {
      id: 'gemini-3-pro-preview',
      provider: 'gemini',
      name: 'Gemini 3 Pro Preview',
      group: 'Gemini 3'
    }
  ],
  anthropic: [
    {
      id: 'claude-sonnet-4-5',
      provider: 'anthropic',
      name: 'Claude Sonnet 4.5',
      group: 'Claude 4.5'
    },
    {
      id: 'claude-haiku-4-5',
      provider: 'anthropic',
      name: 'Claude Haiku 4.5',
      group: 'Claude 4.5'
    },
    {
      id: 'claude-opus-4-5',
      provider: 'anthropic',
      name: 'Claude Opus 4.5',
      group: 'Claude 4.5'
    }
  ],
  deepseek: [
    {
      id: 'deepseek-chat',
      provider: 'deepseek',
      name: 'DeepSeek Chat',
      group: 'DeepSeek Chat'
    },
    {
      id: 'deepseek-reasoner',
      provider: 'deepseek',
      name: 'DeepSeek Reasoner',
      group: 'DeepSeek Reasoner'
    }
  ],
  together: [
    {
      id: 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo',
      provider: 'together',
      name: 'Llama-3.2-11B-Vision',
      group: 'Llama-3.2'
    },
    {
      id: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
      provider: 'together',
      name: 'Llama-3.2-90B-Vision',
      group: 'Llama-3.2'
    },
    {
      id: 'google/gemma-2-27b-it',
      provider: 'together',
      name: 'gemma-2-27b-it',
      group: 'Gemma'
    },
    {
      id: 'google/gemma-2-9b-it',
      provider: 'together',
      name: 'gemma-2-9b-it',
      group: 'Gemma'
    }
  ],
  ocoolai: [
    {
      id: 'deepseek-chat',
      provider: 'ocoolai',
      name: 'deepseek-chat',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-reasoner',
      provider: 'ocoolai',
      name: 'deepseek-reasoner',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-ai/DeepSeek-R1',
      provider: 'ocoolai',
      name: 'deepseek-ai/DeepSeek-R1',
      group: 'DeepSeek'
    },
    {
      id: 'HiSpeed/DeepSeek-R1',
      provider: 'ocoolai',
      name: 'HiSpeed/DeepSeek-R1',
      group: 'DeepSeek'
    },
    {
      id: 'ocoolAI/DeepSeek-R1',
      provider: 'ocoolai',
      name: 'ocoolAI/DeepSeek-R1',
      group: 'DeepSeek'
    },
    {
      id: 'Azure/DeepSeek-R1',
      provider: 'ocoolai',
      name: 'Azure/DeepSeek-R1',
      group: 'DeepSeek'
    },
    {
      id: 'gpt-4o',
      provider: 'ocoolai',
      name: 'gpt-4o',
      group: 'OpenAI'
    },
    {
      id: 'gpt-4o-all',
      provider: 'ocoolai',
      name: 'gpt-4o-all',
      group: 'OpenAI'
    },
    {
      id: 'gpt-4o-mini',
      provider: 'ocoolai',
      name: 'gpt-4o-mini',
      group: 'OpenAI'
    },
    {
      id: 'gpt-4',
      provider: 'ocoolai',
      name: 'gpt-4',
      group: 'OpenAI'
    },
    {
      id: 'o1-preview',
      provider: 'ocoolai',
      name: 'o1-preview',
      group: 'OpenAI'
    },
    {
      id: 'o1-mini',
      provider: 'ocoolai',
      name: 'o1-mini',
      group: 'OpenAI'
    },
    {
      id: 'claude-3-5-sonnet-20240620',
      provider: 'ocoolai',
      name: 'claude-3-5-sonnet-20240620',
      group: 'Anthropic'
    },
    {
      id: 'claude-3-5-haiku-20241022',
      provider: 'ocoolai',
      name: 'claude-3-5-haiku-20241022',
      group: 'Anthropic'
    },
    {
      id: 'gemini-pro',
      provider: 'ocoolai',
      name: 'gemini-pro',
      group: 'Gemini'
    },
    {
      id: 'gemini-1.5-pro',
      provider: 'ocoolai',
      name: 'gemini-1.5-pro',
      group: 'Gemini'
    },
    {
      id: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
      provider: 'ocoolai',
      name: 'Llama-3.2-90B-Vision-Instruct-Turbo',
      group: 'Llama-3.2'
    },
    {
      id: 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo',
      provider: 'ocoolai',
      name: 'Llama-3.2-11B-Vision-Instruct-Turbo',
      group: 'Llama-3.2'
    },
    {
      id: 'meta-llama/Llama-3.2-3B-Vision-Instruct-Turbo',
      provider: 'ocoolai',
      name: 'Llama-3.2-3B-Vision-Instruct-Turbo',
      group: 'Llama-3.2'
    },
    {
      id: 'google/gemma-2-27b-it',
      provider: 'ocoolai',
      name: 'gemma-2-27b-it',
      group: 'Gemma'
    },
    {
      id: 'google/gemma-2-9b-it',
      provider: 'ocoolai',
      name: 'gemma-2-9b-it',
      group: 'Gemma'
    },
    {
      id: 'Doubao-embedding',
      provider: 'ocoolai',
      name: 'Doubao-embedding',
      group: 'Doubao'
    },
    {
      id: 'text-embedding-3-large',
      provider: 'ocoolai',
      name: 'text-embedding-3-large',
      group: 'Embedding'
    },
    {
      id: 'text-embedding-3-small',
      provider: 'ocoolai',
      name: 'text-embedding-3-small',
      group: 'Embedding'
    },
    {
      id: 'text-embedding-v2',
      provider: 'ocoolai',
      name: 'text-embedding-v2',
      group: 'Embedding'
    }
  ],
  github: [
    {
      id: 'gpt-4o',
      provider: 'github',
      name: 'OpenAI GPT-4o',
      group: 'OpenAI'
    }
  ],
  copilot: [
    {
      id: 'gpt-4o-mini',
      provider: 'copilot',
      name: 'OpenAI GPT-4o-mini',
      group: 'OpenAI'
    }
  ],
  yi: [
    { id: 'yi-lightning', name: 'Yi Lightning', provider: 'yi', group: 'yi-lightning', owned_by: '01.ai' },
    { id: 'yi-vision-v2', name: 'Yi Vision v2', provider: 'yi', group: 'yi-vision', owned_by: '01.ai' }
  ],
  zhipu: [
    {
      id: 'glm-4.5-flash',
      provider: 'zhipu',
      name: 'GLM-4.5-Flash',
      group: 'GLM-4.5'
    },
    {
      id: 'glm-4.6',
      provider: 'zhipu',
      name: 'GLM-4.6',
      group: 'GLM-4.6'
    },
    {
      id: 'glm-4.5',
      provider: 'zhipu',
      name: 'GLM-4.5',
      group: 'GLM-4.5'
    },
    {
      id: 'glm-4.5-air',
      provider: 'zhipu',
      name: 'GLM-4.5-Air',
      group: 'GLM-4.5'
    },
    {
      id: 'glm-4.5-airx',
      provider: 'zhipu',
      name: 'GLM-4.5-AirX',
      group: 'GLM-4.5'
    },
    {
      id: 'glm-4.5v',
      provider: 'zhipu',
      name: 'GLM-4.5V',
      group: 'GLM-4.5V'
    },
    {
      id: 'embedding-3',
      provider: 'zhipu',
      name: 'Embedding-3',
      group: 'Embedding'
    }
  ],
  moonshot: [
    {
      id: 'moonshot-v1-auto',
      name: 'moonshot-v1-auto',
      provider: 'moonshot',
      group: 'moonshot-v1',
      owned_by: 'moonshot',
      capabilities: [{ type: 'text' }, { type: 'function_calling' }]
    },
    {
      id: 'kimi-k2-0711-preview',
      name: 'kimi-k2-0711-preview',
      provider: 'moonshot',
      group: 'kimi-k2',
      owned_by: 'moonshot',
      capabilities: [{ type: 'text' }, { type: 'function_calling' }],
      pricing: {
        input_per_million_tokens: 0.6,
        output_per_million_tokens: 2.5,
        currencySymbol: 'USD'
      }
    }
  ],
  baichuan: [
    {
      id: 'Baichuan4',
      provider: 'baichuan',
      name: 'Baichuan4',
      group: 'Baichuan4'
    },
    {
      id: 'Baichuan3-Turbo',
      provider: 'baichuan',
      name: 'Baichuan3 Turbo',
      group: 'Baichuan3'
    },
    {
      id: 'Baichuan3-Turbo-128k',
      provider: 'baichuan',
      name: 'Baichuan3 Turbo 128k',
      group: 'Baichuan3'
    }
  ],
  modelscope: [
    {
      id: 'Qwen/Qwen2.5-72B-Instruct',
      name: 'Qwen/Qwen2.5-72B-Instruct',
      provider: 'modelscope',
      group: 'Qwen'
    },
    {
      id: 'Qwen/Qwen2.5-VL-72B-Instruct',
      name: 'Qwen/Qwen2.5-VL-72B-Instruct',
      provider: 'modelscope',
      group: 'Qwen'
    },
    {
      id: 'Qwen/Qwen2.5-Coder-32B-Instruct',
      name: 'Qwen/Qwen2.5-Coder-32B-Instruct',
      provider: 'modelscope',
      group: 'Qwen'
    },
    {
      id: 'deepseek-ai/DeepSeek-R1',
      name: 'deepseek-ai/DeepSeek-R1',
      provider: 'modelscope',
      group: 'deepseek-ai'
    },
    {
      id: 'deepseek-ai/DeepSeek-V3',
      name: 'deepseek-ai/DeepSeek-V3',
      provider: 'modelscope',
      group: 'deepseek-ai'
    }
  ],
  dashscope: [
    { id: 'qwen-vl-plus', name: 'qwen-vl-plus', provider: 'dashscope', group: 'qwen-vl', owned_by: 'system' },
    { id: 'qwen-coder-plus', name: 'qwen-coder-plus', provider: 'dashscope', group: 'qwen-coder', owned_by: 'system' },
    { id: 'qwen-flash', name: 'qwen-flash', provider: 'dashscope', group: 'qwen-flash', owned_by: 'system' },
    { id: 'qwen-plus', name: 'qwen-plus', provider: 'dashscope', group: 'qwen-plus', owned_by: 'system' },
    { id: 'qwen-max', name: 'qwen-max', provider: 'dashscope', group: 'qwen-max', owned_by: 'system' },
    { id: 'qwen3-max', name: 'qwen3-max', provider: 'dashscope', group: 'qwen-max', owned_by: 'system' }
  ],
  stepfun: [
    {
      id: 'step-1-8k',
      provider: 'stepfun',
      name: 'Step 1 8K',
      group: 'Step 1'
    },
    {
      id: 'step-1-flash',
      provider: 'stepfun',
      name: 'Step 1 Flash',
      group: 'Step 1'
    }
  ],
  doubao: [
    {
      id: 'doubao-1-5-vision-pro-32k-250115',
      provider: 'doubao',
      name: 'doubao-1.5-vision-pro',
      group: 'Doubao-1.5-vision-pro'
    },
    {
      id: 'doubao-1-5-pro-32k-250115',
      provider: 'doubao',
      name: 'doubao-1.5-pro-32k',
      group: 'Doubao-1.5-pro'
    },
    {
      id: 'doubao-1-5-pro-32k-character-250228',
      provider: 'doubao',
      name: 'doubao-1.5-pro-32k-character',
      group: 'Doubao-1.5-pro'
    },
    {
      id: 'doubao-1-5-pro-256k-250115',
      provider: 'doubao',
      name: 'Doubao-1.5-pro-256k',
      group: 'Doubao-1.5-pro'
    },
    {
      id: 'deepseek-r1-250120',
      provider: 'doubao',
      name: 'DeepSeek-R1',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-r1-distill-qwen-32b-250120',
      provider: 'doubao',
      name: 'DeepSeek-R1-Distill-Qwen-32B',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-r1-distill-qwen-7b-250120',
      provider: 'doubao',
      name: 'DeepSeek-R1-Distill-Qwen-7B',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-v3-250324',
      provider: 'doubao',
      name: 'DeepSeek-V3',
      group: 'DeepSeek'
    },
    {
      id: 'doubao-pro-32k-241215',
      provider: 'doubao',
      name: 'Doubao-pro-32k',
      group: 'Doubao-pro'
    },
    {
      id: 'doubao-pro-32k-functioncall-241028',
      provider: 'doubao',
      name: 'Doubao-pro-32k-functioncall-241028',
      group: 'Doubao-pro'
    },
    {
      id: 'doubao-pro-32k-character-241215',
      provider: 'doubao',
      name: 'Doubao-pro-32k-character-241215',
      group: 'Doubao-pro'
    },
    {
      id: 'doubao-pro-256k-241115',
      provider: 'doubao',
      name: 'Doubao-pro-256k',
      group: 'Doubao-pro'
    },
    {
      id: 'doubao-lite-4k-character-240828',
      provider: 'doubao',
      name: 'Doubao-lite-4k-character-240828',
      group: 'Doubao-lite'
    },
    {
      id: 'doubao-lite-32k-240828',
      provider: 'doubao',
      name: 'Doubao-lite-32k',
      group: 'Doubao-lite'
    },
    {
      id: 'doubao-lite-32k-character-241015',
      provider: 'doubao',
      name: 'Doubao-lite-32k-character-241015',
      group: 'Doubao-lite'
    },
    {
      id: 'doubao-lite-128k-240828',
      provider: 'doubao',
      name: 'Doubao-lite-128k',
      group: 'Doubao-lite'
    },
    {
      id: 'doubao-1-5-lite-32k-250115',
      provider: 'doubao',
      name: 'Doubao-1.5-lite-32k',
      group: 'Doubao-lite'
    },
    {
      id: 'doubao-embedding-large-text-240915',
      provider: 'doubao',
      name: 'Doubao-embedding-large',
      group: 'Doubao-embedding'
    },
    {
      id: 'doubao-embedding-text-240715',
      provider: 'doubao',
      name: 'Doubao-embedding',
      group: 'Doubao-embedding'
    },
    {
      id: 'doubao-embedding-vision-241215',
      provider: 'doubao',
      name: 'Doubao-embedding-vision',
      group: 'Doubao-embedding'
    },
    {
      id: 'doubao-vision-lite-32k-241015',
      provider: 'doubao',
      name: 'Doubao-vision-lite-32k',
      group: 'Doubao-vision-lite-32k'
    }
  ],
  minimax: [
    {
      id: 'abab6.5s-chat',
      provider: 'minimax',
      name: 'abab6.5s',
      group: 'abab6'
    },
    {
      id: 'abab6.5g-chat',
      provider: 'minimax',
      name: 'abab6.5g',
      group: 'abab6'
    },
    {
      id: 'abab6.5t-chat',
      provider: 'minimax',
      name: 'abab6.5t',
      group: 'abab6'
    },
    {
      id: 'abab5.5s-chat',
      provider: 'minimax',
      name: 'abab5.5s',
      group: 'abab5'
    },
    {
      id: 'minimax-text-01',
      provider: 'minimax',
      name: 'minimax-01',
      group: 'minimax-01'
    },
    {
      id: 'MiniMax-M2',
      provider: 'minimax',
      name: 'MiniMax M2',
      group: 'minimax-m2'
    },
    {
      id: 'MiniMax-M2-Stable',
      provider: 'minimax',
      name: 'MiniMax M2 Stable',
      group: 'minimax-m2'
    }
  ],
  hyperbolic: [
    {
      id: 'Qwen/Qwen2-VL-72B-Instruct',
      provider: 'hyperbolic',
      name: 'Qwen2-VL-72B-Instruct',
      group: 'Qwen2-VL'
    },
    {
      id: 'Qwen/Qwen2-VL-7B-Instruct',
      provider: 'hyperbolic',
      name: 'Qwen2-VL-7B-Instruct',
      group: 'Qwen2-VL'
    },
    {
      id: 'mistralai/Pixtral-12B-2409',
      provider: 'hyperbolic',
      name: 'Pixtral-12B-2409',
      group: 'Pixtral'
    },
    {
      id: 'meta-llama/Meta-Llama-3.1-405B',
      provider: 'hyperbolic',
      name: 'Meta-Llama-3.1-405B',
      group: 'Meta-Llama-3.1'
    }
  ],
  grok: [
    {
      id: 'grok-4',
      provider: 'grok',
      name: 'Grok 4',
      group: 'Grok'
    },
    {
      id: 'grok-3',
      provider: 'grok',
      name: 'Grok 3',
      group: 'Grok'
    },
    {
      id: 'grok-3-fast',
      provider: 'grok',
      name: 'Grok 3 Fast',
      group: 'Grok'
    },
    {
      id: 'grok-3-mini',
      provider: 'grok',
      name: 'Grok 3 Mini',
      group: 'Grok'
    },
    {
      id: 'grok-3-mini-fast',
      provider: 'grok',
      name: 'Grok 3 Mini Fast',
      group: 'Grok'
    }
  ],
  mistral: [
    {
      id: 'pixtral-12b-2409',
      provider: 'mistral',
      name: 'Pixtral 12B [Free]',
      group: 'Pixtral'
    },
    {
      id: 'pixtral-large-latest',
      provider: 'mistral',
      name: 'Pixtral Large',
      group: 'Pixtral'
    },
    {
      id: 'ministral-3b-latest',
      provider: 'mistral',
      name: 'Mistral 3B [Free]',
      group: 'Mistral Mini'
    },
    {
      id: 'ministral-8b-latest',
      provider: 'mistral',
      name: 'Mistral 8B [Free]',
      group: 'Mistral Mini'
    },
    {
      id: 'codestral-latest',
      provider: 'mistral',
      name: 'Mistral Codestral',
      group: 'Mistral Code'
    },
    {
      id: 'mistral-large-latest',
      provider: 'mistral',
      name: 'Mistral Large',
      group: 'Mistral Chat'
    },
    {
      id: 'mistral-small-latest',
      provider: 'mistral',
      name: 'Mistral Small',
      group: 'Mistral Chat'
    },
    {
      id: 'open-mistral-nemo',
      provider: 'mistral',
      name: 'Mistral Nemo',
      group: 'Mistral Chat'
    },
    {
      id: 'mistral-embed',
      provider: 'mistral',
      name: 'Mistral Embedding',
      group: 'Mistral Embed'
    }
  ],
  jina: [
    {
      id: 'jina-clip-v1',
      provider: 'jina',
      name: 'jina-clip-v1',
      group: 'Jina Clip'
    },
    {
      id: 'jina-clip-v2',
      provider: 'jina',
      name: 'jina-clip-v2',
      group: 'Jina Clip'
    },
    {
      id: 'jina-embeddings-v2-base-en',
      provider: 'jina',
      name: 'jina-embeddings-v2-base-en',
      group: 'Jina Embeddings V2'
    },
    {
      id: 'jina-embeddings-v2-base-es',
      provider: 'jina',
      name: 'jina-embeddings-v2-base-es',
      group: 'Jina Embeddings V2'
    },
    {
      id: 'jina-embeddings-v2-base-de',
      provider: 'jina',
      name: 'jina-embeddings-v2-base-de',
      group: 'Jina Embeddings V2'
    },
    {
      id: 'jina-embeddings-v2-base-zh',
      provider: 'jina',
      name: 'jina-embeddings-v2-base-zh',
      group: 'Jina Embeddings V2'
    },
    {
      id: 'jina-embeddings-v2-base-code',
      provider: 'jina',
      name: 'jina-embeddings-v2-base-code',
      group: 'Jina Embeddings V2'
    },
    {
      id: 'jina-embeddings-v3',
      provider: 'jina',
      name: 'jina-embeddings-v3',
      group: 'Jina Embeddings V3'
    }
  ],
  fireworks: [
    {
      id: 'accounts/fireworks/models/mythomax-l2-13b',
      provider: 'fireworks',
      name: 'mythomax-l2-13b',
      group: 'Gryphe'
    },
    {
      id: 'accounts/fireworks/models/llama-v3-70b-instruct',
      provider: 'fireworks',
      name: 'Llama-3-70B-Instruct',
      group: 'Llama3'
    }
  ],
  hunyuan: [
    {
      id: 'hunyuan-pro',
      provider: 'hunyuan',
      name: 'hunyuan-pro',
      group: 'Hunyuan'
    },
    {
      id: 'hunyuan-standard',
      provider: 'hunyuan',
      name: 'hunyuan-standard',
      group: 'Hunyuan'
    },
    {
      id: 'hunyuan-lite',
      provider: 'hunyuan',
      name: 'hunyuan-lite',
      group: 'Hunyuan'
    },
    {
      id: 'hunyuan-standard-256k',
      provider: 'hunyuan',
      name: 'hunyuan-standard-256k',
      group: 'Hunyuan'
    },
    {
      id: 'hunyuan-vision',
      provider: 'hunyuan',
      name: 'hunyuan-vision',
      group: 'Hunyuan'
    },
    {
      id: 'hunyuan-code',
      provider: 'hunyuan',
      name: 'hunyuan-code',
      group: 'Hunyuan'
    },
    {
      id: 'hunyuan-role',
      provider: 'hunyuan',
      name: 'hunyuan-role',
      group: 'Hunyuan'
    },
    {
      id: 'hunyuan-turbo',
      provider: 'hunyuan',
      name: 'hunyuan-turbo',
      group: 'Hunyuan'
    },
    {
      id: 'hunyuan-turbos-latest',
      provider: 'hunyuan',
      name: 'hunyuan-turbos-latest',
      group: 'Hunyuan'
    },
    {
      id: 'hunyuan-embedding',
      provider: 'hunyuan',
      name: 'hunyuan-embedding',
      group: 'Embedding'
    }
  ],
  nvidia: [
    {
      id: '01-ai/yi-large',
      provider: 'nvidia',
      name: 'yi-large',
      group: 'Yi'
    },
    {
      id: 'meta/llama-3.1-405b-instruct',
      provider: 'nvidia',
      name: 'llama-3.1-405b-instruct',
      group: 'llama-3.1'
    }
  ],
  openrouter: [
    {
      id: 'google/gemini-2.5-flash-image-preview',
      provider: 'openrouter',
      name: 'Google: Gemini 2.5 Flash Image',
      group: 'google'
    },
    {
      id: 'google/gemini-2.5-flash-preview',
      provider: 'openrouter',
      name: 'Google: Gemini 2.5 Flash Preview',
      group: 'google'
    },
    {
      id: 'qwen/qwen-2.5-7b-instruct:free',
      provider: 'openrouter',
      name: 'Qwen: Qwen-2.5-7B Instruct',
      group: 'qwen'
    },
    {
      id: 'deepseek/deepseek-chat',
      provider: 'openrouter',
      name: 'DeepSeek: V3',
      group: 'deepseek'
    },
    {
      id: 'mistralai/mistral-7b-instruct:free',
      provider: 'openrouter',
      name: 'Mistral: Mistral 7B Instruct',
      group: 'mistralai'
    }
  ],
  groq: [
    {
      id: 'llama3-8b-8192',
      provider: 'groq',
      name: 'LLaMA3 8B',
      group: 'Llama3'
    },
    {
      id: 'llama3-70b-8192',
      provider: 'groq',
      name: 'LLaMA3 70B',
      group: 'Llama3'
    },
    {
      id: 'mistral-saba-24b',
      provider: 'groq',
      name: 'Mistral Saba 24B',
      group: 'Mistral'
    },
    {
      id: 'gemma-9b-it',
      provider: 'groq',
      name: 'Gemma 9B',
      group: 'Gemma'
    }
  ],
  'baidu-cloud': [
    {
      id: 'deepseek-r1',
      provider: 'baidu-cloud',
      name: 'DeepSeek R1',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-v3',
      provider: 'baidu-cloud',
      name: 'DeepSeek V3',
      group: 'DeepSeek'
    },
    {
      id: 'ernie-4.0-8k-latest',
      provider: 'baidu-cloud',
      name: 'ERNIE-4.0',
      group: 'ERNIE'
    },
    {
      id: 'ernie-4.0-turbo-8k-latest',
      provider: 'baidu-cloud',
      name: 'ERNIE 4.0 Trubo',
      group: 'ERNIE'
    },
    {
      id: 'ernie-speed-8k',
      provider: 'baidu-cloud',
      name: 'ERNIE Speed',
      group: 'ERNIE'
    },
    {
      id: 'ernie-lite-8k',
      provider: 'baidu-cloud',
      name: 'ERNIE Lite',
      group: 'ERNIE'
    },
    {
      id: 'bge-large-zh',
      provider: 'baidu-cloud',
      name: 'BGE Large ZH',
      group: 'Embedding'
    },
    {
      id: 'bge-large-en',
      provider: 'baidu-cloud',
      name: 'BGE Large EN',
      group: 'Embedding'
    }
  ],
  dmxapi: [
    {
      id: 'Qwen/Qwen2.5-7B-Instruct',
      provider: 'dmxapi',
      name: 'Qwen/Qwen2.5-7B-Instruct',
      group: '免费模型'
    },
    {
      id: 'ERNIE-Speed-128K',
      provider: 'dmxapi',
      name: 'ERNIE-Speed-128K',
      group: '免费模型'
    },
    {
      id: 'gpt-4o',
      provider: 'dmxapi',
      name: 'gpt-4o',
      group: 'OpenAI'
    },
    {
      id: 'gpt-4o-mini',
      provider: 'dmxapi',
      name: 'gpt-4o-mini',
      group: 'OpenAI'
    },
    {
      id: 'DMXAPI-DeepSeek-R1',
      provider: 'dmxapi',
      name: 'DMXAPI-DeepSeek-R1',
      group: 'DeepSeek'
    },
    {
      id: 'DMXAPI-DeepSeek-V3',
      provider: 'dmxapi',
      name: 'DMXAPI-DeepSeek-V3',
      group: 'DeepSeek'
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      provider: 'dmxapi',
      name: 'claude-3-5-sonnet-20241022',
      group: 'Claude'
    },
    {
      id: 'gemini-2.0-flash',
      provider: 'dmxapi',
      name: 'gemini-2.0-flash',
      group: 'Gemini'
    }
  ],
  perplexity: [
    {
      id: 'sonar-reasoning-pro',
      provider: 'perplexity',
      name: 'sonar-reasoning-pro',
      group: 'Sonar'
    },
    {
      id: 'sonar-reasoning',
      provider: 'perplexity',
      name: 'sonar-reasoning',
      group: 'Sonar'
    },
    {
      id: 'sonar-pro',
      provider: 'perplexity',
      name: 'sonar-pro',
      group: 'Sonar'
    },
    {
      id: 'sonar',
      provider: 'perplexity',
      name: 'sonar',
      group: 'Sonar'
    },
    {
      id: 'sonar-deep-research',
      provider: 'perplexity',
      name: 'sonar-deep-research',
      group: 'Sonar'
    }
  ],
  infini: [
    {
      id: 'deepseek-r1',
      provider: 'infini',
      name: 'deepseek-r1',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-r1-distill-qwen-32b',
      provider: 'infini',
      name: 'deepseek-r1-distill-qwen-32b',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-v3',
      provider: 'infini',
      name: 'deepseek-v3',
      group: 'DeepSeek'
    },
    {
      id: 'qwen2.5-72b-instruct',
      provider: 'infini',
      name: 'qwen2.5-72b-instruct',
      group: 'Qwen'
    },
    {
      id: 'qwen2.5-32b-instruct',
      provider: 'infini',
      name: 'qwen2.5-32b-instruct',
      group: 'Qwen'
    },
    {
      id: 'qwen2.5-14b-instruct',
      provider: 'infini',
      name: 'qwen2.5-14b-instruct',
      group: 'Qwen'
    },
    {
      id: 'qwen2.5-7b-instruct',
      provider: 'infini',
      name: 'qwen2.5-7b-instruct',
      group: 'Qwen'
    },
    {
      id: 'qwen2-72b-instruct',
      provider: 'infini',
      name: 'qwen2-72b-instruct',
      group: 'Qwen'
    },
    {
      id: 'qwq-32b-preview',
      provider: 'infini',
      name: 'qwq-32b-preview',
      group: 'Qwen'
    },
    {
      id: 'qwen2.5-coder-32b-instruct',
      provider: 'infini',
      name: 'qwen2.5-coder-32b-instruct',
      group: 'Qwen'
    },
    {
      id: 'llama-3.3-70b-instruct',
      provider: 'infini',
      name: 'llama-3.3-70b-instruct',
      group: 'Llama'
    },
    {
      id: 'bge-m3',
      provider: 'infini',
      name: 'bge-m3',
      group: 'BAAI'
    },
    {
      id: 'gemma-2-27b-it',
      provider: 'infini',
      name: 'gemma-2-27b-it',
      group: 'Gemma'
    },
    {
      id: 'jina-embeddings-v2-base-zh',
      provider: 'infini',
      name: 'jina-embeddings-v2-base-zh',
      group: 'Jina'
    },
    {
      id: 'jina-embeddings-v2-base-code',
      provider: 'infini',
      name: 'jina-embeddings-v2-base-code',
      group: 'Jina'
    }
  ],
  xirang: [],
  'tencent-cloud-ti': [
    {
      id: 'deepseek-r1',
      provider: 'tencent-cloud-ti',
      name: 'DeepSeek R1',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-v3',
      provider: 'tencent-cloud-ti',
      name: 'DeepSeek V3',
      group: 'DeepSeek'
    }
  ],
  gpustack: [],
  voyageai: [
    {
      id: 'voyage-3-large',
      provider: 'voyageai',
      name: 'voyage-3-large',
      group: 'Voyage Embeddings V3'
    },
    {
      id: 'voyage-3',
      provider: 'voyageai',
      name: 'voyage-3',
      group: 'Voyage Embeddings V3'
    },
    {
      id: 'voyage-3-lite',
      provider: 'voyageai',
      name: 'voyage-3-lite',
      group: 'Voyage Embeddings V3'
    },
    {
      id: 'voyage-code-3',
      provider: 'voyageai',
      name: 'voyage-code-3',
      group: 'Voyage Embeddings V3'
    },
    {
      id: 'voyage-finance-3',
      provider: 'voyageai',
      name: 'voyage-finance-3',
      group: 'Voyage Embeddings V2'
    },
    {
      id: 'voyage-law-2',
      provider: 'voyageai',
      name: 'voyage-law-2',
      group: 'Voyage Embeddings V2'
    },
    {
      id: 'voyage-code-2',
      provider: 'voyageai',
      name: 'voyage-code-2',
      group: 'Voyage Embeddings V2'
    },
    {
      id: 'rerank-2',
      provider: 'voyageai',
      name: 'rerank-2',
      group: 'Voyage Rerank V2'
    },
    {
      id: 'rerank-2-lite',
      provider: 'voyageai',
      name: 'rerank-2-lite',
      group: 'Voyage Rerank V2'
    }
  ],
  qiniu: [
    {
      id: 'deepseek-r1',
      provider: 'qiniu',
      name: 'DeepSeek R1',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-r1-search',
      provider: 'qiniu',
      name: 'DeepSeek R1 Search',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-r1-32b',
      provider: 'qiniu',
      name: 'DeepSeek R1 32B',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-v3',
      provider: 'qiniu',
      name: 'DeepSeek V3',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-v3-search',
      provider: 'qiniu',
      name: 'DeepSeek V3 Search',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-v3-tool',
      provider: 'qiniu',
      name: 'DeepSeek V3 Tool',
      group: 'DeepSeek'
    },
    {
      id: 'qwq-32b',
      provider: 'qiniu',
      name: 'QWQ 32B',
      group: 'Qwen'
    },
    {
      id: 'qwen2.5-72b-instruct',
      provider: 'qiniu',
      name: 'Qwen2.5 72B Instruct',
      group: 'Qwen'
    }
  ],
  tokenflux: [
    {
      id: 'gpt-4.1',
      provider: 'tokenflux',
      name: 'GPT-4.1',
      group: 'GPT-4.1'
    },
    {
      id: 'gpt-4.1-mini',
      provider: 'tokenflux',
      name: 'GPT-4.1 Mini',
      group: 'GPT-4.1'
    },
    {
      id: 'claude-sonnet-4',
      provider: 'tokenflux',
      name: 'Claude Sonnet 4',
      group: 'Claude'
    },
    {
      id: 'claude-3-7-sonnet',
      provider: 'tokenflux',
      name: 'Claude 3.7 Sonnet',
      group: 'Claude'
    },
    {
      id: 'gemini-2.5-pro',
      provider: 'tokenflux',
      name: 'Gemini 2.5 Pro',
      group: 'Gemini'
    },
    {
      id: 'gemini-2.5-flash',
      provider: 'tokenflux',
      name: 'Gemini 2.5 Flash',
      group: 'Gemini'
    },
    {
      id: 'deepseek-r1',
      provider: 'tokenflux',
      name: 'DeepSeek R1',
      group: 'DeepSeek'
    },
    {
      id: 'deepseek-v3',
      provider: 'tokenflux',
      name: 'DeepSeek V3',
      group: 'DeepSeek'
    },
    {
      id: 'qwen-max',
      provider: 'tokenflux',
      name: 'Qwen Max',
      group: 'Qwen'
    },
    {
      id: 'qwen-plus',
      provider: 'tokenflux',
      name: 'Qwen Plus',
      group: 'Qwen'
    }
  ],
  cephalon: [
    {
      id: 'DeepSeek-R1',
      provider: 'cephalon',
      name: 'DeepSeek-R1满血版',
      capabilities: [{ type: 'reasoning' }],
      group: 'DeepSeek'
    }
  ],
  lanyun: [
    {
      id: '/maas/deepseek-ai/DeepSeek-R1-0528',
      name: 'deepseek-ai/DeepSeek-R1',
      provider: 'lanyun',
      group: 'deepseek-ai'
    },
    {
      id: '/maas/deepseek-ai/DeepSeek-V3-0324',
      name: 'deepseek-ai/DeepSeek-V3',
      provider: 'lanyun',
      group: 'deepseek-ai'
    },
    {
      id: '/maas/qwen/Qwen2.5-72B-Instruct',
      provider: 'lanyun',
      name: 'Qwen2.5-72B-Instruct',
      group: 'Qwen'
    },
    {
      id: '/maas/qwen/Qwen3-235B-A22B',
      name: 'Qwen/Qwen3-235B',
      provider: 'lanyun',
      group: 'Qwen'
    },
    {
      id: '/maas/minimax/MiniMax-M1-80k',
      name: 'MiniMax-M1-80k',
      provider: 'lanyun',
      group: 'MiniMax'
    },
    {
      id: '/maas/google/Gemma3-27B',
      name: 'Gemma3-27B',
      provider: 'lanyun',
      group: 'google'
    }
  ],
  'new-api': [],
  'aws-bedrock': [],
  poe: [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'poe',
      group: 'poe'
    }
  ],
  aionly: [
    {
      id: 'claude-opus-4-5-20251101',
      name: 'Claude Opus 4.5',
      provider: 'aionly',
      group: 'Anthropic'
    },
    {
      id: 'claude-haiku-4-5-20251001',
      name: 'Claude Haiku 4.5',
      provider: 'aionly',
      group: 'Anthropic'
    },
    {
      id: 'claude-sonnet-4-5-20250929',
      name: 'Claude Sonnet 4.5',
      provider: 'aionly',
      group: 'Anthropic'
    },
    {
      id: 'gpt-5.1',
      name: 'GPT-5.1',
      provider: 'aionly',
      group: 'OpenAI'
    },
    {
      id: 'gpt-5.1-chat',
      name: 'GPT-5.1 Chat',
      provider: 'aionly',
      group: 'OpenAI'
    },
    {
      id: 'gpt-5-pro',
      name: 'GPT 5 Pro',
      provider: 'aionly',
      group: 'OpenAI'
    },
    {
      id: 'gemini-3-pro-preview',
      name: 'Gemini 3 Pro Preview',
      provider: 'aionly',
      group: 'Google'
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      provider: 'aionly',
      group: 'Google'
    },
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      provider: 'aionly',
      group: 'Google'
    }
  ],
  longcat: [
    {
      id: 'LongCat-Flash-Chat',
      name: 'LongCat Flash Chat',
      provider: 'longcat',
      group: 'LongCat'
    },
    {
      id: 'LongCat-Flash-Thinking',
      name: 'LongCat Flash Thinking',
      provider: 'longcat',
      group: 'LongCat'
    }
  ],
  huggingface: [],
  gateway: [],
  cerebras: [
    {
      id: 'gpt-oss-120b',
      name: 'GPT oss 120B',
      provider: 'cerebras',
      group: 'openai'
    },
    {
      id: 'zai-glm-4.6',
      name: 'GLM 4.6',
      provider: 'cerebras',
      group: 'zai'
    },
    {
      id: 'qwen-3-235b-a22b-instruct-2507',
      name: 'Qwen 3 235B A22B Instruct',
      provider: 'cerebras',
      group: 'qwen'
    }
  ]
}

// Vision models
const visionAllowedModels = [
  'llava',
  'moondream',
  'minicpm',
  'gemini-1\\.5',
  'gemini-2\\.0',
  'gemini-2\\.5',
  'gemini-3-(?:flash|pro)(?:-preview)?',
  'gemini-(flash|pro|flash-lite)-latest',
  'gemini-exp',
  'claude-3',
  'claude-haiku-4',
  'claude-sonnet-4',
  'claude-opus-4',
  'vision',
  'glm-4(?:\\.\\d+)?v(?:-[\\w-]+)?',
  'qwen-vl',
  'qwen2-vl',
  'qwen2.5-vl',
  'qwen3-vl',
  'qwen2.5-omni',
  'qwen3-omni(?:-[\\w-]+)?',
  'qvq',
  'internvl2',
  'grok-vision-beta',
  'grok-4(?:-[\\w-]+)?',
  'pixtral',
  'gpt-4(?:-[\\w-]+)',
  'gpt-4.1(?:-[\\w-]+)?',
  'gpt-4o(?:-[\\w-]+)?',
  'gpt-4.5(?:-[\\w-]+)',
  'gpt-5(?:-[\\w-]+)?',
  'chatgpt-4o(?:-[\\w-]+)?',
  'o1(?:-[\\w-]+)?',
  'o3(?:-[\\w-]+)?',
  'o4(?:-[\\w-]+)?',
  'deepseek-vl(?:[\\w-]+)?',
  'kimi-latest',
  'gemma-3(?:-[\\w-]+)',
  'doubao-seed-1[.-]6(?:-[\\w-]+)?',
  'kimi-thinking-preview',
  `gemma3(?:[-:\\w]+)?`,
  'kimi-vl-a3b-thinking(?:-[\\w-]+)?',
  'llama-guard-4(?:-[\\w-]+)?',
  'llama-4(?:-[\\w-]+)?',
  'step-1o(?:.*vision)?',
  'step-1v(?:-[\\w-]+)?',
  'qwen-omni(?:-[\\w-]+)?',
  'mistral-large-(2512|latest)',
  'mistral-medium-(2508|latest)',
  'mistral-small-(2506|latest)'
]

const visionExcludedModels = [
  'gpt-4-\\d+-preview',
  'gpt-4-turbo-preview',
  'gpt-4-32k',
  'gpt-4-\\d+',
  'o1-mini',
  'o3-mini',
  'o1-preview',
  'AIDC-AI/Marco-o1'
]