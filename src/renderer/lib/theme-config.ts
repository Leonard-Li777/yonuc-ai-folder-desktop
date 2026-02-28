import { t } from '@app/languages'

/**
 * 主题配色方案配置
 * 支持多套配色和明暗双色
 */

export type ColorScheme = 'blue' | 'purple' | 'green' | 'orange' | 'rose' | 'slate'

export interface ThemeColors {
  name: string
  label: string
  cssVars: {
    light: Record<string, string>
    dark: Record<string, string>
  }
}

/**
 * 配色方案定义
 * 使用 HSL 格式，与 Tailwind 和 shadcn 保持一致
 */
export const colorSchemes: () => Record<ColorScheme, ThemeColors> = () => {
  return {
    blue: {
      name: 'blue',
      label: t('经典蓝'),
      cssVars: {
        light: {
          background: '0 0% 100%',           // 纯白背景
          foreground: '220 20% 15%',         // 深灰文字
          card: '220 20% 98%',               // 微微灰卡片
          'card-foreground': '220 20% 15%',
          popover: '0 0% 100%',              // 纯白弹出层
          'popover-foreground': '220 20% 15%',
          primary: '217 75% 52%',            // 清新蓝
          'primary-foreground': '0 0% 100%', // 白色文字
          secondary: '220 15% 92%',          // 次要按钮背景
          'secondary-foreground': '220 20% 20%', // 深色文字
          muted: '220 15% 96%',              // 浅灰静音区
          'muted-foreground': '220 10% 45%',
          accent: '220 15% 94%',             // 悬停背景
          'accent-foreground': '220 20% 15%',
          destructive: '0 70% 50%',
          'destructive-foreground': '0 0% 100%',
          border: '220 15% 88%',             // 柔和边框
          input: '220 15% 94%',
          ring: '217 75% 52%',
        },
        dark: {
          background: '220 20% 10%',        // 最深背景
          foreground: '220 15% 92%',        // 柔和白色
          card: '220 18% 14%',              // 卡片背景
          'card-foreground': '220 15% 92%',
          popover: '220 16% 18%',           // 弹出层
          'popover-foreground': '220 15% 92%',
          primary: '217 70% 58%',           // 柔和蓝色
          'primary-foreground': '220 15% 95%',
          secondary: '220 16% 20%',         // 次要按钮
          'secondary-foreground': '220 15% 85%',
          muted: '220 14% 16%',             // 工具栏/侧边栏
          'muted-foreground': '220 10% 60%',
          accent: '220 16% 22%',            // 悬停状态
          'accent-foreground': '220 15% 92%',
          destructive: '0 65% 50%',         // 柔和红色
          'destructive-foreground': '220 15% 95%',
          border: '220 14% 30%',            // 柔和边框
          input: '220 16% 20%',
          ring: '217 70% 58%',
        },
      },
    },
    purple: {
      name: 'purple',
      label: t('优雅紫'),
      cssVars: {
        light: {
          background: '0 0% 100%',
          foreground: '222 47% 11%',
          card: '0 0% 100%',
          'card-foreground': '222 47% 11%',
          popover: '0 0% 100%',
          'popover-foreground': '222 47% 11%',
          primary: '262 83% 58%',
          'primary-foreground': '0 0% 100%',
          secondary: '270 40% 96%',
          'secondary-foreground': '222 47% 11%',
          muted: '270 40% 96%',
          'muted-foreground': '215 16% 47%',
          accent: '270 40% 96%',
          'accent-foreground': '222 47% 11%',
          destructive: '0 84% 60%',
          'destructive-foreground': '0 0% 98%',
          border: '270 32% 91%',
          input: '270 32% 91%',
          ring: '262 83% 58%',
        },
        dark: {
          background: '222 47% 11%',
          foreground: '270 40% 98%',
          card: '270 33% 17%',
          'card-foreground': '270 40% 98%',
          popover: '270 33% 17%',
          'popover-foreground': '270 40% 98%',
          primary: '262 80% 65%',
          'primary-foreground': '222 47% 11%',
          secondary: '270 33% 17%',
          'secondary-foreground': '270 40% 98%',
          muted: '270 47% 11%',
          'muted-foreground': '270 20% 65%',
          accent: '270 33% 17%',
          'accent-foreground': '270 40% 98%',
          destructive: '0 63% 31%',
          'destructive-foreground': '270 40% 98%',
          border: '270 33% 30%',
          input: '270 33% 17%',
          ring: '262 76% 60%',
        },
      },
    },
    green: {
      name: 'green',
      label: t('自然绿'),
      cssVars: {
        light: {
          background: '0 0% 100%',
          foreground: '222 47% 11%',
          card: '0 0% 100%',
          'card-foreground': '222 47% 11%',
          popover: '0 0% 100%',
          'popover-foreground': '222 47% 11%',
          primary: '142 76% 36%',
          'primary-foreground': '0 0% 100%',
          secondary: '140 40% 96%',
          'secondary-foreground': '222 47% 11%',
          muted: '140 40% 96%',
          'muted-foreground': '215 16% 47%',
          accent: '140 40% 96%',
          'accent-foreground': '222 47% 11%',
          destructive: '0 84% 60%',
          'destructive-foreground': '0 0% 98%',
          border: '140 32% 91%',
          input: '140 32% 91%',
          ring: '142 76% 36%',
        },
        dark: {
          background: '222 47% 11%',
          foreground: '140 40% 98%',
          card: '140 33% 17%',
          'card-foreground': '140 40% 98%',
          popover: '140 33% 17%',
          'popover-foreground': '140 40% 98%',
          primary: '142 70% 45%',
          'primary-foreground': '222 47% 11%',
          secondary: '140 33% 17%',
          'secondary-foreground': '140 40% 98%',
          muted: '140 47% 11%',
          'muted-foreground': '140 20% 65%',
          accent: '140 33% 17%',
          'accent-foreground': '140 40% 98%',
          destructive: '0 63% 31%',
          'destructive-foreground': '140 40% 98%',
          border: '140 33% 30%',
          input: '140 33% 17%',
          ring: '142 76% 48%',
        },
      },
    },
    orange: {
      name: 'orange',
      label: t('活力橙'),
      cssVars: {
        light: {
          background: '0 0% 100%',
          foreground: '222 47% 11%',
          card: '0 0% 100%',
          'card-foreground': '222 47% 11%',
          popover: '0 0% 100%',
          'popover-foreground': '222 47% 11%',
          primary: '31 97% 72%',
          'primary-foreground': '222 47% 11%',
          secondary: '30 40% 96%',
          'secondary-foreground': '222 47% 11%',
          muted: '30 40% 96%',
          'muted-foreground': '215 16% 47%',
          accent: '30 40% 96%',
          'accent-foreground': '222 47% 11%',
          destructive: '0 84% 60%',
          'destructive-foreground': '0 0% 98%',
          border: '30 32% 91%',
          input: '30 32% 91%',
          ring: '31 97% 72%',
        },
        dark: {
          background: '222 47% 11%',
          foreground: '30 40% 98%',
          card: '30 33% 17%',
          'card-foreground': '30 40% 98%',
          popover: '30 33% 17%',
          'popover-foreground': '30 40% 98%',
          primary: '31 97% 72%',
          'primary-foreground': '222 47% 11%',
          secondary: '30 33% 17%',
          'secondary-foreground': '30 40% 98%',
          muted: '30 47% 11%',
          'muted-foreground': '30 20% 65%',
          accent: '30 33% 17%',
          'accent-foreground': '30 40% 98%',
          destructive: '0 63% 31%',
          'destructive-foreground': '30 40% 98%',
          border: '30 33% 30%',
          input: '30 33% 17%',
          ring: '31 90% 65%',
        },
      },
    },
    rose: {
      name: 'rose',
      label: t('玫瑰红'),
      cssVars: {
        light: {
          background: '0 0% 100%',
          foreground: '222 47% 11%',
          card: '0 0% 100%',
          'card-foreground': '222 47% 11%',
          popover: '0 0% 100%',
          'popover-foreground': '222 47% 11%',
          primary: '346 77% 50%',
          'primary-foreground': '0 0% 100%',
          secondary: '340 40% 96%',
          'secondary-foreground': '222 47% 11%',
          muted: '340 40% 96%',
          'muted-foreground': '215 16% 47%',
          accent: '340 40% 96%',
          'accent-foreground': '222 47% 11%',
          destructive: '0 84% 60%',
          'destructive-foreground': '0 0% 98%',
          border: '340 32% 91%',
          input: '340 32% 91%',
          ring: '346 77% 50%',
        },
        dark: {
          background: '222 47% 11%',
          foreground: '340 40% 98%',
          card: '340 33% 17%',
          'card-foreground': '340 40% 98%',
          popover: '340 33% 17%',
          'popover-foreground': '340 40% 98%',
          primary: '346 70% 60%',
          'primary-foreground': '222 47% 11%',
          secondary: '340 33% 17%',
          'secondary-foreground': '340 40% 98%',
          muted: '340 47% 11%',
          'muted-foreground': '340 20% 65%',
          accent: '340 33% 17%',
          'accent-foreground': '340 40% 98%',
          destructive: '0 63% 31%',
          'destructive-foreground': '340 40% 98%',
          border: '340 33% 30%',
          input: '340 33% 17%',
          ring: '346 76% 55%',
        },
      },
    },
    slate: {
      name: 'slate',
      label: t('中性灰'),
      cssVars: {
        light: {
          background: '0 0% 100%',
          foreground: '222 47% 11%',
          card: '0 0% 100%',
          'card-foreground': '222 47% 11%',
          popover: '0 0% 100%',
          'popover-foreground': '222 47% 11%',
          primary: '215 16% 47%',
          'primary-foreground': '0 0% 100%',
          secondary: '210 40% 96%',
          'secondary-foreground': '222 47% 11%',
          muted: '210 40% 96%',
          'muted-foreground': '215 16% 47%',
          accent: '210 40% 96%',
          'accent-foreground': '222 47% 11%',
          destructive: '0 84% 60%',
          'destructive-foreground': '0 0% 98%',
          border: '214 32% 91%',
          input: '214 32% 91%',
          ring: '215 16% 47%',
        },
        dark: {
          background: '222 47% 11%',
          foreground: '210 40% 98%',
          card: '215 28% 17%',
          'card-foreground': '210 40% 98%',
          popover: '215 28% 17%',
          'popover-foreground': '210 40% 98%',
          primary: '215 20% 65%',
          'primary-foreground': '222 47% 11%',
          secondary: '215 28% 17%',
          'secondary-foreground': '210 40% 98%',
          muted: '215 47% 11%',
          'muted-foreground': '215 20% 65%',
          accent: '215 28% 17%',
          'accent-foreground': '210 40% 98%',
          destructive: '0 63% 31%',
          'destructive-foreground': '210 40% 98%',
          border: '215 28% 30%',
          input: '215 28% 17%',
          ring: '215 20% 65%',
        },
      },
    },
  }
}
/**
 * 应用配色方案到 DOM
 * 将裸露的 HSL 通道值包装为完整的 hsl() 颜色，以支持 Tailwind CSS v4 的 color-mix()
 */
export function applyColorScheme(scheme: ColorScheme, isDark: boolean) {
  const root = document.documentElement
  const colors = colorSchemes()[scheme].cssVars[isDark ? 'dark' : 'light']

  Object.entries(colors).forEach(([key, value]) => {
    // 将裸露的 HSL 通道值包装为完整的 hsl() 函数
    // 例如：'215 28% 17%' -> 'hsl(215 28% 17%)'
    const hslValue = `hsl(${value})`
    root.style.setProperty(`--${key}`, hslValue)
  })
}

/**
 * 获取所有可用的配色方案
 */
export function getAvailableColorSchemes(): Array<{ value: ColorScheme; label: string }> {
  return Object.values(colorSchemes()).map(scheme => ({
    value: scheme.name as ColorScheme,
    label: scheme.label,
  }))
}

