/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'Menlo',
          'Monaco',
          'Courier New',
          'monospace',
        ],
        tc: [
          'Noto Sans TC',
          'PingFang TC',
          'Microsoft JhengHei',
          'Heiti TC',
          'sans-serif',
        ],
      },
      colors: {
        splc: {
          bg:       '#000000',
          bg2:      '#0a0a0a',
          bg3:      '#141414',
          border:   '#2a2a2a',
          borderHi: '#3a3a3a',
          orange:   '#ff8c00',
          amber:    '#ffb020',
          green:    '#00c853',
          red:      '#cc2f2f',
          cyan:     '#00d9ff',
        },
      },
    },
  },
  plugins: [],
};
