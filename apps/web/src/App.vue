<template>
  <div id="app">
    <el-container>
      <el-header>
        <div class="header-left">
          <h1>📋 内容发布平台</h1>
        </div>
        <div class="header-right">
          <el-tag :type="wsConnected ? 'success' : 'danger'" size="small">
            {{ wsConnected ? '● 已连接' : '● 未连接' }}
          </el-tag>
        </div>
      </el-header>
      <el-container>
        <el-aside width="200px">
          <el-menu
            :default-active="activeMenu"
            router
            background-color="#1f2937"
            text-color="#d1d5db"
            active-text-color="#3b82f6"
          >
            <el-menu-item index="/">
              <el-icon><HomeFilled /></el-icon>
              <span>仪表盘</span>
            </el-menu-item>
            <el-menu-item index="/contents">
              <el-icon><Document /></el-icon>
              <span>内容管理</span>
            </el-menu-item>
            <el-menu-item index="/accounts">
              <el-icon><User /></el-icon>
              <span>账号管理</span>
            </el-menu-item>
            <el-menu-item index="/cookie-config">
              <el-icon><PieChart /></el-icon>
              <span>Cookie 配置</span>
            </el-menu-item>
            <el-menu-item index="/media-library">
              <el-icon><PictureFilled /></el-icon>
              <span>素材库</span>
            </el-menu-item>
            <el-menu-item index="/publish">
              <el-icon><VideoPlay /></el-icon>
              <span>发布管理</span>
            </el-menu-item>
            <el-menu-item index="/publish-status">
              <el-icon><DataLine /></el-icon>
              <span>发布状态</span>
            </el-menu-item>
            <el-menu-item index="/scheduled">
              <el-icon><Clock /></el-icon>
              <span>定时任务</span>
            </el-menu-item>
          </el-menu>
        </el-aside>
        <el-main>
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import {
  Clock,
  DataLine,
  Document,
  HomeFilled,
  PictureFilled,
  PieChart,
  User,
  VideoPlay,
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useContentStore } from '@/stores/content.store';
import { type WebSocketMessage, wsService } from '@/websocket';

declare global {
  interface Window {
    __wsCheckTimer?: ReturnType<typeof setInterval>;
  }
}

const route = useRoute();
const contentStore = useContentStore();
const wsConnected = ref(false);

const activeMenu = computed(() => {
  if (route.path.startsWith('/media-library')) {
    return '/media-library';
  }

  return route.path;
});

// WebSocket 消息处理
function handleWebSocketMessage(message: WebSocketMessage) {
  console.log('WebSocket message received:', message);

  switch (message.type) {
    case 'content_updated':
    case 'content_approved':
    case 'content_rejected':
    case 'content_published':
      // 刷新内容列表
      contentStore.fetchContents();
      ElMessage.info(`内容状态更新：${message.data.id}`);
      break;
  }
}

onMounted(() => {
  // 连接 WebSocket
  wsService.connect();

  // 注册消息处理器
  wsService.onMessage(handleWebSocketMessage);

  // 监听连接状态
  const checkConnection = setInterval(() => {
    wsConnected.value = wsService.isConnected();
  }, 1000);

  // 存储定时器 ID 以便清理
  window.__wsCheckTimer = checkConnection;
});

onUnmounted(() => {
  // 清理定时器
  if (window.__wsCheckTimer) {
    clearInterval(window.__wsCheckTimer);
  }

  // 断开 WebSocket
  wsService.disconnect();
  wsService.offMessage(handleWebSocketMessage);
});

void [activeMenu, Clock, DataLine, Document, HomeFilled, PieChart, PictureFilled, User, VideoPlay];
</script>

<style>
/* 全局重置 - 让 #app 填满视口 */
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden;
}

#app {
  height: 100vh;
  overflow: hidden;
}
</style>

<style scoped>
.el-header {
  background-color: #1D4ED8;
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  flex-shrink: 0;
}

.header-left h1 {
  margin: 0;
  font-size: 1.5rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.el-aside {
  background-color: #1f2937;
  height: calc(100vh - 60px);
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.el-menu {
  border-right: none;
}

.el-main {
  padding: 16px;
  background-color: #f5f7fa;
  height: calc(100vh - 60px);
  overflow-y: auto;
  scrollbar-gutter: stable;
}
</style>
