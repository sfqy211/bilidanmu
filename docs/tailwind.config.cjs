module.exports = {
  content: [
    './src/components/landing/**/*.{ts,tsx}',
    './src/pages/**/*.{ts,tsx}',
    '../src/components/ui/slider.tsx',
    '../src/components/ui/PageTabs.tsx',
    '../src/lib/utils.ts',
  ],
  // Docusaurus 把明暗写在 <html data-theme="dark">，而不是 .dark 类
  darkMode: ['selector', '[data-theme="dark"]'],
  corePlugins: {
    // 只给首页补组件样式，保留 Docusaurus/Infima 的文档排版
    preflight: false,
  },
  // 只让首页节点吃到工具类，不影响文档正文
  important: '#landing-root',
  theme: {
    extend: {
      colors: {
        brand: '#f2547d',
      },
    },
  },
  plugins: [],
}
