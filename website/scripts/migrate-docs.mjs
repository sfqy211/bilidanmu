import fs from 'node:fs';
import path from 'node:path';

const sourceRoot = path.resolve('../docs/docs');
const targetRoot = path.resolve('src/content/docs/docs');

const groups = {
  guide: [
    'quick-start',
    'start',
    'install',
    'features',
    'account',
    'room',
    'danmaku',
    'auto',
    'live',
    'listen',
    'stt',
    'ai',
    'window',
    'template',
    'proxy',
  ],
  architecture: ['overview', 'structure', 'dataflow', 'frontend', 'backend'],
  api: ['bili', 'ipc', 'events', 'mcp'],
  research: ['notes'],
};

const orderOf = new Map();
for (const names of Object.values(groups)) {
  names.forEach((name, index) => orderOf.set(name, index + 1));
}

const publishedDirs = ['guide', 'architecture', 'api', 'research'];

// 只重建迁移目录；docs/index.mdx 与 docs/faq.mdx 是手写页面，保留。
fs.mkdirSync(targetRoot, { recursive: true });
for (const dir of publishedDirs) {
  fs.rmSync(path.join(targetRoot, dir), { recursive: true, force: true });
}

for (const dir of publishedDirs) {
  const sourceDir = path.join(sourceRoot, dir);
  const targetDir = path.join(targetRoot, dir);
  fs.mkdirSync(targetDir, { recursive: true });

  for (const file of fs.readdirSync(sourceDir)) {
    if (!file.endsWith('.md') && !file.endsWith('.mdx')) continue;
    const sourcePath = path.join(sourceDir, file);
    const text = fs.readFileSync(sourcePath, 'utf8');
    const slug = path.basename(file, path.extname(file));

    const titleMatch = text.match(/^#\s+(.+?)\s*$/m);
    const title = titleMatch ? titleMatch[1].trim() : slug;
    let body = titleMatch ? text.replace(/^#\s+.+?(\r?\n)+/, '') : text;

    body = body
      .replace(
        /\]\(\/(guide|architecture|api|research)\/([^)\s#]+)(#[^)]*)?\)/g,
        (_match, group, rest, anchor = '') =>
          `](/bilidanmu/docs/${group}/${rest}/${anchor})`,
      )
      .replace(/\]\(\.\/mcp\)/g, '](/bilidanmu/docs/api/mcp/)')
      .replace(/\]\(\.\/ipc(#[^)]*)?\)/g, (_match, anchor = '') =>
        `](/bilidanmu/docs/api/ipc/${anchor})`,
      )
      .replace(/\]\(\.\.\/api\/mcp\)/g, '](/bilidanmu/docs/api/mcp/)');

    const order = orderOf.get(slug);
    const frontmatter = [
      '---',
      `title: ${JSON.stringify(title)}`,
      ...(order ? ['sidebar:', `  order: ${order}`] : []),
      '---',
      '',
    ].join('\n');

    fs.writeFileSync(path.join(targetDir, file), frontmatter + body.trimStart());
    console.log(`migrated ${dir}/${file}`);
  }
}

// 保留手写的文档首页与 FAQ，但移除与 guide/ 重复的样例页。
for (const file of ['quick-start.mdx', 'features.mdx']) {
  fs.rmSync(path.join(targetRoot, file), { force: true });
}

console.log('done');
