import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';
import baseConfig from '../../packages/config/tailwind/index.js';

export default {
  ...baseConfig,
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  plugins: [...(baseConfig.plugins ?? []), typography],
} satisfies Config;
