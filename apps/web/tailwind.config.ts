import type { Config } from 'tailwindcss';
import baseConfig from '../../packages/config/tailwind/index.js';

export default {
  ...baseConfig,
  content: ['./index.html', './src/**/*.{ts,tsx}'],
} satisfies Config;
