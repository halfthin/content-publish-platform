export interface MediaRootConfig {
  id: string;
  label: string;
  path: string;
}

export const DEFAULT_MEDIA_ROOT_ID = 'dapai';
export const DEFAULT_MEDIA_ROOT_LABEL = '大拍 S';

export function getDefaultMediaRoots(): MediaRootConfig[] {
  const roots: MediaRootConfig[] = [
    {
      id: DEFAULT_MEDIA_ROOT_ID,
      label: DEFAULT_MEDIA_ROOT_LABEL,
      path: process.env.MEDIA_ROOT_DAPAI || '/mnt/dapai-s',
    },
  ];

  // MEDIA_ROOT_LIST="path1,path2,..." 逗号分隔的额外 ROOT 列表
  const list = process.env.MEDIA_ROOT_LIST;
  if (list) {
    for (const rawPath of list.split(',')) {
      const path = rawPath.trim();
      if (!path) continue;
      const name = path.split('/').pop() || path;
      roots.push({ id: `root_${name}`, label: name, path });
    }
  }

  return roots;
}
