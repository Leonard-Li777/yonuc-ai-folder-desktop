import React from 'react'
import { t } from '@app/languages'
import { MaterialIcon } from '../../lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'

interface NoWorkspaceDirectoryMessageProps {
  onAddWorkspaceDirectory: (type: 'SPEEDY' | 'PRIVATE') => Promise<void>
}

export const NoWorkspaceDirectoryMessage: React.FC<NoWorkspaceDirectoryMessageProps> = ({
  onAddWorkspaceDirectory
}) => {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-muted p-8">
      <h2 className="text-3xl font-bold mb-8 text-foreground">{t('请选择工作目录模式')}</h2>
      <p className="text-base mb-8 text-foreground">
        {t('文件需经过AI分析才能分类，过多会比较耗时，工作模式决定了分析结果是否缓存到服务器')}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
        {/* 极速目录 */}
        <Card
          className="hover:border-primary/50 transition-colors cursor-pointer border-4 border-muted-foreground/20 group"
          onClick={() => onAddWorkspaceDirectory('SPEEDY')}
        >
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 group-hover:scale-110 transition-transform">
                <MaterialIcon icon="rocket_launch" className="text-2xl" />
              </div>
              <CardTitle className="text-xl">{t('极速目录')}</CardTitle>
            </div>
            <CardDescription className="text-base font-medium text-foreground/80">
              {t('互助共享，秒级完成')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {t('如果你待分析的文件是他人分析过的，可使用服务器脱敏缓存，大幅提升处理速度。')}
            </p>
            <div className="text-sm bg-muted p-3 rounded-md">
              <span className="font-semibold block mb-1">{t('适用场景：')}</span>
              {t('下载目录、网络资源、电子书、漫画、音乐等公共文件。')}
            </div>
          </CardContent>
        </Card>

        {/* 私有目录 */}
        <Card
          className="hover:border-primary/50 transition-colors cursor-pointer border-4 border-muted-foreground/20 group"
          onClick={() => onAddWorkspaceDirectory('PRIVATE')}
        >
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 group-hover:scale-110 transition-transform">
                <MaterialIcon icon="lock" className="text-2xl" />
              </div>
              <CardTitle className="text-xl">{t('私有目录')}</CardTitle>
            </div>
            <CardDescription className="text-base font-medium text-foreground/80">
              {t('本地分析，数据不出端')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {t(
                '你的分析结果仅保存在本地，不缓存服务器，守护数据主权。但无法享受服务器缓存带来的提速效果。'
              )}
            </p>
            <div className="text-sm bg-muted p-3 rounded-md">
              <span className="font-semibold block mb-1">{t('适用场景：')}</span>
              {t('个人原创作品、照片、财务报表、隐私文档。')}
            </div>
          </CardContent>
        </Card>
      </div>
      <p className="mt-10 text-xs text-muted-foreground text-center">
        {t('注：所有数据都是脱敏的，无IP，全匿名')}
      </p>
    </div>
  )
}
