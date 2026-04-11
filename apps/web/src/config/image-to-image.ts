import type { ImageToImageMode } from '@/api/media';

export interface ImageToImagePersonOption {
  label: string;
  value: string;
}

export interface ImageToImageModeOption {
  value: ImageToImageMode;
  label: string;
}

export const IMAGE_TO_IMAGE_PERSON_OPTIONS: ImageToImagePersonOption[] = [
  { value: '001-林婉婷-XS', label: '001-林婉婷-XS' },
  { value: '002-陈雅文-S', label: '002-陈雅文-S' },
  { value: '003-周诗涵-M', label: '003-周诗涵-M' },
  { value: '004-吴美玲-L', label: '004-吴美玲-L' },
  { value: '005-郑雪琪-XL', label: '005-郑雪琪-XL' },
];

export const IMAGE_TO_IMAGE_MODE_OPTIONS: ImageToImageModeOption[] = [
  { value: 'lifestyle', label: '生活照' },
  { value: 'artistic', label: '艺术照' },
  { value: 'lookbook', label: '大片穿搭' },
  { value: 'flat_full', label: '平铺主图' },
  { value: 'flat_detail', label: '平铺细节' },
];
