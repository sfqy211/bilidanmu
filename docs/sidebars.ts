import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'category',
      label: '快速开始',
      collapsed: false,
      items: [
        'guide/quick-start',
        'guide/start',
        'guide/install',
        'guide/features',
      ],
    },
    {
      type: 'category',
      label: '核心功能',
      collapsed: false,
      items: [
        'guide/account',
        'guide/room',
        'guide/danmaku',
        'guide/auto',
        'guide/live',
        'guide/listen',
        'guide/stt',
        'guide/ai',
        'guide/window',
        'guide/template',
        'guide/proxy',
      ],
    },
    {
      type: 'category',
      label: '技术架构',
      collapsed: false,
      items: [
        'architecture/overview',
        'architecture/structure',
        'architecture/dataflow',
        'architecture/frontend',
        'architecture/backend',
      ],
    },
    {
      type: 'category',
      label: 'API 参考',
      collapsed: false,
      items: ['api/bili', 'api/ipc', 'api/events'],
    },
    {
      type: 'category',
      label: '技术调研',
      collapsed: true,
      items: ['research/notes'],
    },
  ],
};

export default sidebars;
