import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('./views/Dashboard.vue'),
    meta: { title: '仪表盘' },
  },
  {
    path: '/contents',
    name: 'Contents',
    component: () => import('./views/Contents.vue'),
    meta: { title: '内容管理' },
  },
  {
    path: '/contents/:id',
    name: 'ContentDetail',
    component: () => import('./views/ContentDetail.vue'),
    meta: { title: '内容详情' },
  },
  {
    path: '/accounts',
    name: 'Accounts',
    component: () => import('./views/Accounts.vue'),
    meta: { title: '账号管理' },
  },
  {
    path: '/cookie-config',
    name: 'CookieConfig',
    component: () => import('./views/CookieConfig.vue'),
    meta: { title: 'Cookie 配置' },
  },
  {
    path: '/media-library',
    name: 'MediaLibrary',
    component: () => import('./views/MediaLibrary.vue'),
    meta: { title: '素材库' },
  },
  {
    path: '/media-library/image-to-image',
    name: 'MediaImageToImage',
    component: () => import('./views/MediaImageToImage.vue'),
    meta: { title: '图生图' },
  },
  {
    path: '/publish',
    name: 'Publish',
    component: () => import('./views/Publish.vue'),
    meta: { title: '发布管理' },
  },
  {
    path: '/publish-status',
    name: 'PublishStatus',
    component: () => import('./views/PublishStatus.vue'),
    meta: { title: '发布状态' },
  },
  {
    path: '/scheduled',
    name: 'Scheduled',
    component: () => import('./views/Scheduled.vue'),
    meta: { title: '定时任务' },
  },
  {
    path: '/media-actions',
    name: 'MediaActions',
    component: () => import('./views/MediaActions.vue'),
    meta: { title: '动作管理' },
  },
  {
    path: '/media-action-uploads',
    name: 'MediaActionUploads',
    component: () => import('./views/MediaActionUploads.vue'),
    meta: { title: '回传文件' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 动态更新页面标题
router.beforeEach((to, _from, next) => {
  const title = to.meta?.title as string;
  if (title) {
    document.title = `${title} - 内容发布平台`;
  }
  next();
});

export default router;
