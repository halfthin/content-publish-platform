<template>
  <div class="review-history">
    <h4 class="history-title">📜 审核历史</h4>
    
    <el-timeline v-if="history && history.length > 0">
      <el-timeline-item
        v-for="(item, index) in history"
        :key="index"
        :type="getTimelineType(item.action)"
        :icon="getTimelineIcon(item.action)"
      >
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="action-label">{{ getActionLabel(item.action) }}</span>
            <span class="time-label">{{ formatTime(item.timestamp) }}</span>
          </div>
          <div class="timeline-body">
            <div class="reviewer">审核人：<strong>{{ item.reviewer }}</strong></div>
            <div v-if="item.note" class="note">备注：{{ item.note }}</div>
            <div v-if="item.status" class="status-change">
              状态变更：<el-tag size="small">{{ item.status }}</el-tag>
            </div>
          </div>
        </div>
      </el-timeline-item>
    </el-timeline>

    <el-empty v-else description="暂无审核历史" :image-size="80" />
  </div>
</template>

<script setup lang="ts">
import { Check, Clock, Close, Upload } from '@element-plus/icons-vue';

export interface ReviewHistoryItem {
  action: 'created' | 'submitted' | 'approved' | 'rejected' | 'published';
  timestamp: string;
  reviewer: string;
  note?: string;
  status?: string;
}

interface Props {
  history?: ReviewHistoryItem[];
}

withDefaults(defineProps<Props>(), {
  history: () => [],
});

function getActionLabel(action: string): string {
  const map: Record<string, string> = {
    created: '内容创建',
    submitted: '提交审核',
    approved: '审核通过',
    rejected: '审核拒绝',
    published: '已发布',
  };
  return map[action] || action;
}

function getTimelineType(action: string): string {
  const map: Record<string, string> = {
    created: 'info',
    submitted: 'warning',
    approved: 'success',
    rejected: 'danger',
    published: '',
  };
  return map[action] || 'info';
}

function getTimelineIcon(action: string) {
  const map: Record<string, typeof Clock> = {
    created: Clock,
    submitted: Upload,
    approved: Check,
    rejected: Close,
    published: Check,
  };
  return map[action] || Clock;
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

void [getActionLabel, getTimelineType, getTimelineIcon, formatTime];
</script>

<style scoped>
.review-history {
  margin-top: 20px;
}

.history-title {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: #303133;
  font-weight: 600;
}

.timeline-content {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.action-label {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.time-label {
  font-size: 12px;
  color: #909399;
}

.timeline-body {
  font-size: 13px;
  color: #606266;
}

.reviewer {
  margin-bottom: 4px;
}

.note {
  margin-top: 4px;
  padding: 6px 8px;
  background: #fff;
  border-radius: 4px;
  font-style: italic;
}

.status-change {
  margin-top: 8px;
}
</style>
