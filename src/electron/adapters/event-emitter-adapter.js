/**
 * 事件发射器适配器实现
 * 将 EventEmitter API 适配到核心引擎
 */
import { EventEmitter } from 'events';
/**
 * 事件发射器适配器
 */
export class EventEmitterAdapter {
    emitter;
    constructor() {
        this.emitter = new EventEmitter();
    }
    emit(event, ...args) {
        this.emitter.emit(event, ...args);
    }
    on(event, listener) {
        this.emitter.on(event, listener);
    }
    off(event, listener) {
        this.emitter.off(event, listener);
    }
}
/**
 * 创建事件发射器适配器实例
 */
export function createEventEmitterAdapter() {
    return new EventEmitterAdapter();
}
//# sourceMappingURL=event-emitter-adapter.js.map