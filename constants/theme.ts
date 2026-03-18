/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#FF70CD';
const tintColorDark = '#FF70CD';

export const Palette = {
  pink: '#FF70CD',
  yellow: '#FEFF00',
  coral: '#FF7070',
  magenta: '#F51476',
  ink: '#1C1022',
  plum: '#351437',
  cream: '#FFFCEE',
  mist: '#FFE7F6',
};

export const Colors = {
  light: {
    text: '#FFFCEE',
    background: '#1C1022',
    tint: tintColorLight,
    icon: '#FF70CD',
    tabIconDefault: '#C79AB8',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#FFFCEE',
    background: '#1C1022',
    tint: tintColorDark,
    icon: '#FF70CD',
    tabIconDefault: '#C79AB8',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
