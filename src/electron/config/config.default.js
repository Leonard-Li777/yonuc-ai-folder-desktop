import path from 'node:path';
import { app } from 'electron';
import { DEFAULT_UNIFIED_CONFIG } from '@firefly/shared';
function deepMerge(target, source) {
    const output = { ...target };
    if (source && typeof source === 'object') {
        for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                output[key] = deepMerge(target[key] || {}, source[key]);
            }
            else if (source[key] !== undefined) {
                output[key] = source[key];
            }
        }
    }
    return output;
}
function safeGetPath(name, fallbackFolder) {
    try {
        return app.getPath(name);
    }
    catch {
        return path.join(process.cwd(), fallbackFolder);
    }
}
const userDataPath = safeGetPath('userData', '.firefly-user-data');
const tempPath = safeGetPath('temp', '.firefly-temp');
const defaultModelDirectory = path.join(userDataPath, 'models');
const defaultLogDirectory = path.join(userDataPath, 'logs');
const defaultTempDirectory = path.join(tempPath, 'firefly-temp');
export const defaultUnifiedConfig = deepMerge(DEFAULT_UNIFIED_CONFIG, {
    app: {
        VERSION: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '3.3.2', // 注入当前真实应用版本号
        DOWNLOAD_MIRROR: 'cn' // 默认为官方原版，后面会动态探测
    },
    ui: {
    // MODEL_STORAGE_PATH removed from here, using paths.MODEL_STORAGE_PATH instead
    },
    ai: {
        AI_ENGINE: typeof __AI_ENGINE__ !== 'undefined' ? __AI_ENGINE__ : 'llama.cpp'
    },
    paths: {
        MODEL_STORAGE_PATH: defaultModelDirectory, // 模型存储路径
        LOG_PATH: defaultLogDirectory, // 日志路径
        TEMP_PATH: defaultTempDirectory // 临时文件路径
    }
});
//# sourceMappingURL=config.default.js.map