import { getPermalink } from './utils/permalinks';

const REPOSITORY = 'https://github.com/sfqy211/bilidanmu';
const RELEASES = `${REPOSITORY}/releases/latest`;
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const hashLink = (id: string) => `${BASE}/#${id}`;

export const headerData = {
  links: [
    { text: '功能', href: hashLink('features') },
    { text: '演示', href: hashLink('film') },
    { text: '文档', href: getPermalink('/docs/') },
    { text: 'GitHub', href: REPOSITORY },
  ],
  actions: [{ text: '下载', href: RELEASES, target: '_blank' }],
};

export const footerData = {
  links: [
    {
      title: '产品',
      links: [
        { text: '功能', href: hashLink('features') },
        { text: '下载', href: RELEASES },
        { text: '更新日志', href: `${REPOSITORY}/releases` },
      ],
    },
    {
      title: '文档',
      links: [
        { text: '快速开始', href: getPermalink('/docs/guide/quick-start/') },
        { text: '功能一览', href: getPermalink('/docs/guide/features/') },
        { text: '常见问题', href: getPermalink('/docs/faq/') },
      ],
    },
    {
      title: '资源',
      links: [
        { text: 'GitHub', href: REPOSITORY },
        { text: '问题反馈', href: `${REPOSITORY}/issues` },
        { text: '许可证', href: `${REPOSITORY}/blob/main/LICENSE` },
      ],
    },
  ],
  secondaryLinks: [{ text: 'AGPL-3.0', href: `${REPOSITORY}/blob/main/LICENSE` }],
  socialLinks: [{ ariaLabel: 'GitHub', icon: 'tabler:brand-github', href: REPOSITORY }],
  footNote: `BiliDanmu · 桌面弹幕伴侣 · AGPL-3.0`,
};
