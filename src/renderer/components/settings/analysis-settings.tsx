import React, { useState, useEffect, useMemo } from 'react'
import i18nScope from '@app/languages'
import { Card } from '../ui/card'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { useSettingsStore } from '../../stores/settings-store'
import { IIgnoreRule } from '@yonuc/types/settings-types'
import {
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  FileX,
  FolderX,
  Filter,
  ExternalLink,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { useVoerkaI18n } from '@voerkai18n/react'

/**
 * 分析设置组件
 */
export const AnalysisSettings: React.FC = () => {
  const {
    config,
    updateConfig,
    getConfigValue,
    updateConfigValue,
    ignoreRules,
    addIgnoreRule,
    updateIgnoreRule,
    removeIgnoreRule
  } = useSettingsStore()

  const [editingRule, setEditingRule] = useState<string | null>(null)
  const [newRule, setNewRule] = useState<Partial<IIgnoreRule>>({
    type: 'file',
    value: '',
    isSystem: false,
    isActive: true
  })
  const [showAddRule, setShowAddRule] = useState(false)
  const [libreOfficeInstalled, setLibreOfficeInstalled] = useState<boolean | null>(null)
  const [libreOfficeVersion, setLibreOfficeVersion] = useState<string | undefined>(undefined)
  const [checkingLibreOffice, setCheckingLibreOffice] = useState(false)
  const { t, activeLanguage } = useVoerkaI18n(i18nScope)

  const [unitPrompt, setUnitPrompt] = useState(
    getConfigValue<string>('UNIT_RECOGNITION_PROMPT') || ''
  )
  const [qualityPrompt, setQualityPrompt] = useState(
    getConfigValue<string>('QUALITY_SCORE_PROMPT') || ''
  )
  const [tagPrompt, setTagPrompt] = useState(getConfigValue<string>('TAG_GENERATION_PROMPT') || '')

  const useDebouncedPromptUpdater = (
    promptValue: string,
    configKey: 'UNIT_RECOGNITION_PROMPT' | 'QUALITY_SCORE_PROMPT' | 'TAG_GENERATION_PROMPT'
  ) => {
    useEffect(() => {
      const handler = setTimeout(() => {
        if (promptValue !== (getConfigValue<string>(configKey) || '')) {
          updateConfigValue(configKey, promptValue)
        }
      }, 500) // 500ms debounce

      return () => {
        clearTimeout(handler)
      }
    }, [promptValue, configKey, getConfigValue, updateConfigValue])
  }

  useDebouncedPromptUpdater(unitPrompt, 'UNIT_RECOGNITION_PROMPT')
  useDebouncedPromptUpdater(qualityPrompt, 'QUALITY_SCORE_PROMPT')
  useDebouncedPromptUpdater(tagPrompt, 'TAG_GENERATION_PROMPT')

  /**
   * 检测LibreOffice安装状态
   */
  useEffect(() => {
    checkLibreOfficeStatus()
  }, [])

  const checkLibreOfficeStatus = async () => {
    setCheckingLibreOffice(true)
    try {
      const result = await (window as any).electronAPI.utils.detectLibreOffice()
      setLibreOfficeInstalled(result.installed)
      setLibreOfficeVersion(result.version)
    } catch (error) {
      console.error('检测LibreOffice失败:', error)
      setLibreOfficeInstalled(false)
    } finally {
      setCheckingLibreOffice(false)
    }
  }

  const handleOpenLibreOfficeDownload = async () => {
    try {
      await (window as any).electronAPI.utils.openExternal(
        'https://www.libreoffice.org/download/download-libreoffice/'
      )
    } catch (error) {
      console.error('打开LibreOffice下载页面失败:', error)
    }
  }

  /**
   * 默认提示词模板
   */
  const defaultPrompts = useMemo(
    () => ({
      unitRecognition: t(
        '示例：作为整体单元的文件集合特征为：文件命名带数字后缀的文件集合，例如：1.txt, 2.txt, 3.txt'
      ),
      qualityScore: t('示例：为喜剧故事多加分；为技术指标降低权重'),
      tagGeneration: t(
        '示例：智能文件名格式：作者_内容描述。例如：乔治·马丁_冰与火之歌.pdf。标签最多生成20个，且每个不要超过2个字，至少从文件名提取一个标签。'
      )
    }),
    [activeLanguage]
  )

  /**
   * 处理添加忽略规则
   */
  const handleAddRule = () => {
    if (!newRule.value?.trim()) return

    addIgnoreRule({
      type: newRule.type!,
      value: newRule.value.trim(),
      isSystem: false,
      isActive: true
    })

    setNewRule({
      type: 'file',
      value: '',
      isSystem: false,
      isActive: true
    })
    setShowAddRule(false)
  }

  /**
   * 处理编辑忽略规则
   */
  const handleEditRule = (ruleId: string) => {
    setEditingRule(ruleId)
  }

  /**
   * 处理保存编辑的规则
   */
  const handleSaveRule = (ruleId: string, updates: Partial<IIgnoreRule>) => {
    updateIgnoreRule(ruleId, updates)
    setEditingRule(null)
  }

  /**
   * 处理取消编辑
   */
  const handleCancelEdit = () => {
    setEditingRule(null)
  }

  /**
   * 获取规则类型图标
   */
  const getRuleTypeIcon = (type: IIgnoreRule['type']) => {
    switch (type) {
      case 'file':
        return <FileX className="h-4 w-4" />
      case 'directory':
        return <FolderX className="h-4 w-4" />
      case 'extension':
        return <Filter className="h-4 w-4" />
      case 'pattern':
        return <Filter className="h-4 w-4" />
      default:
        return <FileX className="h-4 w-4" />
    }
  }

  /**
   * 获取规则类型标签
   */
  const getRuleTypeLabel = (type: IIgnoreRule['type']) => {
    const labels = {
      file: t('文件'),
      directory: t('目录'),
      extension: t('扩展名'),
      pattern: t('模式')
    }
    return labels[type] || type
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">{t('分析设置')}</h3>
        <p className="text-sm text-muted-foreground">{t('配置AI分析行为、提示词和忽略规则')}</p>
      </div>

      {/* LibreOffice推荐安装 */}
      <Card className="p-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <Label className="text-base font-medium flex items-center gap-2">
                {t('推荐安装：LibreOffice（Office文件转换工具）')}
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                {t('安装LibreOffice，支持Office及PDF文件预览缩略图，提升它们的分析精度')}
              </p>

              {/* Windows配置提示 */}
              {!checkingLibreOffice && libreOfficeInstalled === true && (
                <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-700 dark:text-blue-300">
                  <p className="font-medium">{t('💡 Windows用户重要提示：')}</p>
                  <p className="mt-1">{t('如果Office文档缩略图生成失败，请确保：')}</p>
                  <ul className="mt-1 ml-4 space-y-0.5 list-disc">
                    <li>{t('LibreOffice安装路径已添加到系统PATH环境变量')}</li>
                    <li>{t('重启应用后再次尝试')}</li>
                    <li>{t('默认路径：')}C:\Program Files\LibreOffice\program</li>
                  </ul>
                </div>
              )}

              {!checkingLibreOffice && libreOfficeInstalled === false && (
                <Button size="sm" className="mt-5" onClick={handleOpenLibreOfficeDownload}>
                  <ExternalLink className="h-4 w-4 mr-1" />
                  {t('前往下载')}
                </Button>
              )}
            </div>
            <div className="flex flex-col items-center gap-2">
              <div>
                {checkingLibreOffice && (
                  <span className="text-xs text-muted-foreground">{t('检测中...')}</span>
                )}
                {!checkingLibreOffice && libreOfficeInstalled === true && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    {t('已安装')}
                    {libreOfficeVersion && <span>（{libreOfficeVersion}）</span>}
                  </span>
                )}
                {!checkingLibreOffice && libreOfficeInstalled === false && (
                  <span className="flex items-center gap-1 text-xs text-orange-600">
                    <AlertCircle className="h-4 w-4" />
                    {t('未安装')}
                  </span>
                )}
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={checkLibreOfficeStatus}
                disabled={checkingLibreOffice}
              >
                {checkingLibreOffice ? t('检测中...') : t('重新检测')}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* 提示词设置 */}
      <Card className="p-4">
        <div className="space-y-4">
          <div>
            <Label className="text-base font-medium">{t('AI提示词设置')}</Label>
            <p className="text-sm text-muted-foreground mt-1">
              {t('作为系统提示词的补充，如有冲突以您的补充为准（限100字）')}
            </p>
          </div>

          {/* 最小单元识别提示词 */}
          <div className="space-y-2">
            <Label htmlFor="unit-prompt">{t('最小单元识别提示词')}</Label>
            <Textarea
              id="unit-prompt"
              placeholder={defaultPrompts.unitRecognition}
              value={unitPrompt}
              onChange={e => {
                const value = e.target.value
                if (value.length <= 100) {
                  setUnitPrompt(value)
                }
              }}
              rows={6}
              className="font-mono text-sm mt-2"
              maxLength={100}
            />
            <div className="flex items-center justify-end">
              <span
                className={`text-xs ${
                  (unitPrompt?.length || 0) >= 100 ? 'text-red-500' : 'text-muted-foreground'
                }`}
              >
                {unitPrompt?.length || 0}
                {t('/100 字符')}
              </span>
            </div>
          </div>

          {/* 质量评分提示词 */}
          <div className="space-y-2">
            <Label htmlFor="quality-prompt">{t('质量评分提示词')}</Label>
            <Textarea
              id="quality-prompt"
              placeholder={defaultPrompts.qualityScore}
              value={qualityPrompt}
              onChange={e => {
                const value = e.target.value
                if (value.length <= 100) {
                  setQualityPrompt(value)
                }
              }}
              rows={6}
              className="font-mono text-sm mt-2"
              maxLength={100}
            />
            <div className="flex items-center justify-end">
              <span
                className={`text-xs ${
                  (qualityPrompt?.length || 0) >= 100 ? 'text-red-500' : 'text-muted-foreground'
                }`}
              >
                {qualityPrompt?.length || 0}
                {t('/100 字符')}
              </span>
            </div>
          </div>

          {/* 标签生成提示词 */}
          <div className="space-y-2">
            <Label htmlFor="tag-prompt">{t('标签、智能文件名生成提示词')}</Label>
            <Textarea
              id="tag-prompt"
              placeholder={defaultPrompts.tagGeneration}
              value={tagPrompt}
              onChange={e => {
                const value = e.target.value
                if (value.length <= 100) {
                  setTagPrompt(value)
                }
              }}
              rows={6}
              className="font-mono text-sm mt-2"
              maxLength={100}
            />
            <div className="flex items-center justify-end">
              <span
                className={`text-xs ${
                  (tagPrompt?.length || 0) >= 100 ? 'text-red-500' : 'text-muted-foreground'
                }`}
              >
                {tagPrompt?.length || 0}
                {t('/100 字符')}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* AI分析忽略规则 */}
      <Card className="p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">{t('AI分析忽略规则')}</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {t('设置不需要进行AI分析的文件和目录')}
              </p>
            </div>
            <Button size="sm" onClick={() => setShowAddRule(true)}>
              <Plus className="h-4 w-4 mr-1" />
              {t('添加规则')}
            </Button>
          </div>

          {/* 添加新规则 */}
          {showAddRule && (
            <div className="p-3 border rounded-lg bg-muted/30">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="new-rule-type">{t('类型')}</Label>
                    <Select
                      value={newRule.type}
                      onValueChange={value =>
                        setNewRule({ ...newRule, type: value as IIgnoreRule['type'] })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="file">{t('文件')}</SelectItem>
                        <SelectItem value="directory">{t('目录')}</SelectItem>
                        <SelectItem value="extension">{t('扩展名')}</SelectItem>
                        <SelectItem value="pattern">{t('模式')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="new-rule-value">{t('值')}</Label>
                    <Input
                      id="new-rule-value"
                      placeholder={t('输入文件名、目录名或模式...')}
                      value={newRule.value}
                      onChange={e => setNewRule({ ...newRule, value: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="new-rule-desc">{t('描述（可选）')}</Label>
                  <Input
                    id="new-rule-desc"
                    placeholder={t('输入规则描述...')}
                    value={newRule.description}
                    onChange={e => setNewRule({ ...newRule, description: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleAddRule} disabled={!newRule.value?.trim()}>
                    <Save className="h-4 w-4 mr-1" />
                    {t('保存')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAddRule(false)}>
                    <X className="h-4 w-4 mr-1" />
                    {t('取消')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 规则列表 */}
          <div className="space-y-2">
            {ignoreRules.map(rule => (
              <div
                key={rule.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                {editingRule === rule.id ? (
                  <EditRuleForm
                    rule={rule}
                    onSave={updates => handleSaveRule(rule.id, updates)}
                    onCancel={handleCancelEdit}
                  />
                ) : (
                  <>
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex items-center gap-2">
                        {getRuleTypeIcon(rule.type)}
                        <span className="text-xs bg-muted px-2 py-1 rounded">
                          {getRuleTypeLabel(rule.type)}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{rule.value}</div>
                        {rule.description && (
                          <div className="text-sm text-muted-foreground">{rule.description}</div>
                        )}
                      </div>
                      {rule.isSystem && (
                        <span className="text-xs text-muted-foreground px-2 py-1 rounded">
                          {t('内置')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={rule.isActive}
                        onCheckedChange={checked =>
                          updateIgnoreRule(rule.id, { isActive: checked })
                        }
                        disabled={rule.isSystem}
                      />
                      {!rule.isSystem && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditRule(rule.id)}
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeIgnoreRule(rule.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* 提示信息 */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-2">
          <div className="text-blue-600 mt-0.5">💡</div>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">{t('提示')}</p>
            <ul className="space-y-1 text-blue-700">
              <li>{t('• 提示词修改后将应用到新的分析任务')}</li>
              <li>{t('• 忽略规则可以提高分析效率，避免处理不必要的文件')}</li>
              <li>{t('• 系统预设的忽略规则不能删除，但可以禁用')}</li>
              <li>{t('• 模式规则支持通配符，如 *.tmp 匹配所有临时文件')}</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}

/**
 * 编辑规则表单组件
 */
interface EditRuleFormProps {
  rule: IIgnoreRule
  onSave: (updates: Partial<IIgnoreRule>) => void
  onCancel: () => void
}

const EditRuleForm: React.FC<EditRuleFormProps> = ({ rule, onSave, onCancel }) => {
  const [editedRule, setEditedRule] = useState({
    type: rule.type,
    value: rule.value,
    description: rule.description || ''
  })

  const handleSave = () => {
    onSave(editedRule)
  }

  return (
    <div className="flex-1 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Select
            value={editedRule.type}
            onValueChange={value =>
              setEditedRule({ ...editedRule, type: value as IIgnoreRule['type'] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="file">{t('文件')}</SelectItem>
              <SelectItem value="directory">{t('目录')}</SelectItem>
              <SelectItem value="extension">{t('扩展名')}</SelectItem>
              <SelectItem value="pattern">{t('模式')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Input
            value={editedRule.value}
            onChange={e => setEditedRule({ ...editedRule, value: e.target.value })}
          />
        </div>
      </div>
      <div>
        <Input
          placeholder={t('描述（可选）')}
          value={editedRule.description}
          onChange={e => setEditedRule({ ...editedRule, description: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave}>
          <Save className="h-4 w-4 mr-1" />
          {t('保存')}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          <X className="h-4 w-4 mr-1" />
          {t('取消')}
        </Button>
      </div>
    </div>
  )
}
