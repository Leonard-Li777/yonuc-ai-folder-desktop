import React, { memo } from 'react';
import { cn } from '../../lib/utils';
import { MaterialIcon } from '../../lib/utils';
import { t } from "@app/languages";
import type { FileItemProps } from '@yonuc/types';

export const getFileIcon = (type: 'file' | 'directory', extension?: string) => {
  if (type === 'directory') {
    return <MaterialIcon icon="folder" className="text-6xl text-amber-500" />;
  }

  const iconMap: Record<string, string> = {
    // 文档类型
    'txt': 'description',
    'md': 'description',
    'pdf': 'picture_as_pdf',
    'doc': 'description',
    'docx': 'description',
    'xls': 'table_chart',
    'xlsx': 'table_chart',
    'ppt': 'slideshow',
    'pptx': 'slideshow',
    
    // 代码类型
    'js': 'code',
    'ts': 'code',
    'jsx': 'code',
    'tsx': 'code',
    'html': 'html',
    'css': 'css',
    'scss': 'css',
    'json': 'code',
    'xml': 'code',
    'yaml': 'code',
    'yml': 'code',
    
    // 图片类型
    'jpg': 'image',
    'jpeg': 'image',
    'png': 'image',
    'gif': 'image',
    'svg': 'image',
    'bmp': 'image',
    'webp': 'image',
    
    // 音频类型
    'mp3': 'music_note',
    'wav': 'music_note',
    'flac': 'music_note',
    'aac': 'music_note',
    'ogg': 'music_note',
    
    // 视频类型
    'mp4': 'videocam',
    'avi': 'videocam',
    'mkv': 'videocam',
    'mov': 'videocam',
    'wmv': 'videocam',
    
    // 压缩类型
    'zip': 'archive',
    'rar': 'archive',
    '7z': 'archive',
    'tar': 'archive',
    'gz': 'archive',
  };

  return <MaterialIcon icon={iconMap[extension?.toLowerCase() || ''] || 'insert_drive_file'} className="text-6xl text-muted-foreground dark:text-muted-foreground" />;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '-';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
};

const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const getFileType = (extension?: string): string => {
  const typeMap: Record<string, string> = {
    'txt': t('文本文件'),
    'md': t('Markdown文档'),
    'pdf': t('PDF文档'),
    'doc': t('Word文档'),
    'docx': t('Word文档'),
    'xls': t('Excel表格'),
    'xlsx': t('Excel表格'),
    'ppt': t('PowerPoint'),
    'pptx': t('PowerPoint'),
    'js': t('JavaScript文件'),
    'ts': t('TypeScript文件'),
    'jsx': t('React组件'),
    'tsx': t('React组件'),
    'html': t('HTML文件'),
    'css': t('CSS样式表'),
    'jpg': t('JPEG图片'),
    'png': t('PNG图片'),
    'gif': t('GIF图片'),
    'mp3': t('MP3音频'),
    'mp4': t('MP4视频'),
    'zip': t('压缩文件'),
  };
  return typeMap[extension?.toLowerCase() || ''] || t('文件');
};

const getAnalysisStatusIcon = (status?: string) => {
  switch (status) {
    case 'pending':
      return <MaterialIcon icon="pending" className="text-sm text-yellow-500" />;
    case 'analyzing':
      return <MaterialIcon icon="sync" className="text-sm text-blue-500 animate-spin" />;
    case 'completed':
      return <MaterialIcon icon="check_circle" className="text-sm text-green-500" />;
    case 'failed':
      return <MaterialIcon icon="error" className="text-sm text-red-500" />;
    default:
      return null;
  }
};

export const FileItem: React.FC<FileItemProps> = memo(({
  type,
  name,
  path,
  isSelected,
  onSelect,
  onDoubleClick,
  size,
  modifiedAt,
  extension,
  viewMode = 'table',
  analysisStatus,
  thumbnailPath,
  workspaceDirectoryPath,
}) => {
  const icon = getFileIcon(type, extension);
  const fileSize = type === 'file' ? formatFileSize(size) : '-';
  const modifiedDate = formatDate(modifiedAt);
  const fileType = type === 'directory' ? t('文件夹') : getFileType(extension);

  const isImageFile = (ext?: string) => {
    if (!ext) return false;
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
    return imageExtensions.includes(ext.toLowerCase());
  };

  const displayUrl = React.useMemo(() => {
    // 优先使用缩略图
    if (thumbnailPath && workspaceDirectoryPath) {
      return `file:///${workspaceDirectoryPath.replace(/\\/g, '/')}/${thumbnailPath.replace(/\\/g, '/')}`;
    }
    // 如果没有缩略图，但本身是图片，则显示原图
    if (isImageFile(extension)) {
      return `file://${path.replace(/\\/g, '/')}`;
    }
    return null;
  }, [thumbnailPath, workspaceDirectoryPath, path, extension]);

  if (viewMode === 'table') {
    return (
      <tr 
        className={cn(
          'hover:bg-gray-100 transition-colors cursor-pointer file-row border-b border-gray-100',
          isSelected && 'bg-blue-50 hover:bg-blue-100'
        )}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('input[type="checkbox"]')) {
            onSelect(path, !isSelected);
          }
        }}
        onDoubleClick={onDoubleClick}
        title={t('双击打开')}
      >
        <td className="p-3 w-10">
          <input
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect(path, e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            type="checkbox"
            title={isSelected ? t('取消选择') : t('选择此项')}
          />
        </td>
        <td className="p-3 flex items-center">
          <span className="mr-3 text-gray-500">{icon}</span>
          <span className="font-medium text-gray-700" title={name}>{name}</span>
        </td>
        <td className="p-3">
          {analysisStatus && (
            <div className="flex items-center space-x-1" title={t(`分析状态: ${
              analysisStatus === 'pending' ? t('等待中') :
              analysisStatus === 'analyzing' ? t('分析中') :
              analysisStatus === 'completed' ? t('已完成') : t('失败')
            }`)}>
              {getAnalysisStatusIcon(analysisStatus)}
              <span className="text-xs font-medium text-gray-500">
                {analysisStatus === 'pending' && t('等待中')}
                {analysisStatus === 'analyzing' && t('分析中')}
                {analysisStatus === 'completed' && t('已完成')}
                {analysisStatus === 'failed' && t('失败')}
              </span>
            </div>
          )}
        </td>
        <td className="p-3 text-sm text-gray-500 whitespace-nowrap">
          {modifiedDate}
        </td>
        <td className="p-3 text-sm text-gray-500 whitespace-nowrap">
          {fileType}
        </td>
        <td className="p-3 text-sm text-gray-500 whitespace-nowrap font-mono">
          {fileSize}
        </td>
      </tr>
    );
  }

  if (viewMode === 'list') {
    return (
      <div
        className={cn(
          'file-item',
          'flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer transition-colors border-b border-gray-100',
          isSelected && 'bg-blue-50 hover:bg-blue-100'
        )}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('input[type="checkbox"]')) {
            onSelect(path, !isSelected);
          }
        }}
        onDoubleClick={onDoubleClick}
        role="button"
        tabIndex={0}
        aria-label={t(`${type === 'directory' ? t('文件夹') : t('文件')} ${name}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(path, !isSelected);
          }
        }}
        title={t('双击打开')}
      >
        <div className="file-item-checkbox mr-2">
          <input
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect(path, e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            type="checkbox"
            title={isSelected ? t('取消选择') : t('选择此项')}
          />
        </div>
        
        <div className="file-item-icon flex items-center justify-center w-8 h-8 mr-3">
          {icon}
        </div>
        
        <div className="file-item-name flex-1 min-w-0">
          <div className="file-item-name-text truncate" title={name}>
            {name}
          </div>
        </div>
        
        <div className="file-item-size w-20 text-right text-sm text-gray-600">
          {fileSize}
        </div>
        
        <div className="file-item-modified w-32 text-right text-sm text-gray-600">
          {modifiedDate}
        </div>

        {analysisStatus && (
          <div className="ml-2" title={t('分析状态: {analysisStatus}',{analysisStatus})}>
            {getAnalysisStatusIcon(analysisStatus)}
          </div>
        )}
      </div>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div
        className={cn(
          'flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:bg-gray-100 hover:border-gray-300 cursor-pointer transition-all duration-200 relative group',
          isSelected && 'bg-blue-50 border-blue-200 shadow-sm'
        )}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('input[type="checkbox"]')) {
            onSelect(path, !isSelected);
          }
        }}
        onDoubleClick={onDoubleClick}
        role="button"
        tabIndex={0}
        aria-label={`${type === 'directory' ? t('文件夹') : t('文件')} ${name}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(path, !isSelected);
          }
        }}
        title={t('双击打开')}
      >
        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <input
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect(path, e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer",
              isSelected && "opacity-100"
            )}
            type="checkbox"
            title={isSelected ? t('取消选择') : t('选择此项')}
          />
        </div>
        <div className="w-16 h-16 flex items-center justify-center mb-3 transition-transform group-hover:scale-110 duration-200 overflow-hidden rounded bg-gray-50">
          {displayUrl ? (
            <img 
              src={displayUrl} 
              alt={name} 
              className="w-full h-full object-cover"
              onError={(e) => {
                const img = e.currentTarget;
                img.style.display = 'none';
                const parent = img.parentElement;
                if (parent) {
                  const fallback = parent.querySelector('.fallback-icon') as HTMLElement;
                  if (fallback) {
                    fallback.style.display = 'flex';
                  }
                }
              }}
            />
          ) : null}
          <div className="fallback-icon w-full h-full items-center justify-center" style={{ display: displayUrl ? 'none' : 'flex' }}>
            {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { 
              className: cn((icon.props as { className?: string }).className, "text-4xl") 
            }) : icon}
          </div>
        </div>
        <div className="text-sm font-medium text-center truncate w-full text-gray-700 group-hover:text-gray-900" title={name}>
          {name}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {type === 'directory' ? '' : fileSize}
        </div>
        {analysisStatus && (
          <div className="mt-1" title={t('分析状态: {analysisStatus}', {analysisStatus})}>
            {getAnalysisStatusIcon(analysisStatus)}
          </div>
        )}
      </div>
    );
  }

  return null;
});

FileItem.displayName = 'FileItem';

