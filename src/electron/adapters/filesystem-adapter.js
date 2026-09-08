/**
 * 文件系统适配器实现
 * 将 Node.js 文件系统 API 适配到核心引擎
 */
import * as fs from 'fs/promises';
import * as path from 'path';
/**
 * 文件系统适配器
 */
export class FileSystemAdapter {
    async readFile(filePath) {
        return await fs.readFile(filePath);
    }
    async writeFile(filePath, data) {
        await fs.writeFile(filePath, data);
    }
    async exists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    async stat(filePath) {
        const stats = await fs.stat(filePath);
        return {
            size: stats.size,
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory()
        };
    }
    async readdir(dirPath, options) {
        if (options?.withFileTypes) {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            return entries.map(e => ({
                name: e.name,
                isFile: e.isFile(),
                isDirectory: e.isDirectory()
            }));
        }
        return await fs.readdir(dirPath);
    }
    async unlink(filePath) {
        await fs.unlink(filePath);
    }
    async mkdir(dirPath, options) {
        await fs.mkdir(dirPath, options);
    }
    join(...paths) {
        return path.join(...paths);
    }
    extname(filePath) {
        return path.extname(filePath);
    }
    dirname(filePath) {
        return path.dirname(filePath);
    }
}
/**
 * 创建文件系统适配器实例
 */
export function createFileSystemAdapter() {
    return new FileSystemAdapter();
}
//# sourceMappingURL=filesystem-adapter.js.map