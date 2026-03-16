<template>
  <div class="dashboard">
    <h2>📊 仪表盘</h2>
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card>
          <template #header>内容总数</template>
          <div class="stat-number">0</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <template #header>账号数量</template>
          <div class="stat-number">0</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <template #header>待发布</template>
          <div class="stat-number">0</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <template #header>今日已发布</template>
          <div class="stat-number">0</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.dashboard {
  padding: 20px 0;
}

.stat-number {
  font-size: 2rem;
  font-weight: bold;
  color: #1D4ED8;
}
</style>
