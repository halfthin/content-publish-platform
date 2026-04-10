export interface MediaRootConfig {
  id: string;
  label: string;
  path: string;
}

export const DEFAULT_MEDIA_ROOT_ID = 'dapai';
export const DEFAULT_MEDIA_ROOT_LABEL = '大拍 S';

export function getDefaultMediaRoots(): MediaRootConfig[] {
  return [
    {
      id: DEFAULT_MEDIA_ROOT_ID,
      label: DEFAULT_MEDIA_ROOT_LABEL,
      path: process.env.MEDIA_ROOT_DAPAI || '/mnt/dapai-s',
    },
  ];
}
