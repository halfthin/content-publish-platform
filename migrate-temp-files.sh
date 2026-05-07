#!/bin/bash
# 项目根目录临时文件迁移脚本
# 执行时间：2026-03-06 23:06 CST

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "📁 开始迁移临时文件到 .workspace 目录..."

# 创建目录结构
mkdir -p .workspace/progress
mkdir -p .workspace/tests
mkdir -p .workspace/debug
mkdir -p .workspace/drafts
mkdir -p .workspace/archives

# 迁移进度报告
echo "📄 迁移进度报告..."
mv TEST_PROGRESS_*.md .workspace/progress/ 2>/dev/null || true
mv TEST_PROGRESS_SUMMARY.md .workspace/tests/ 2>/dev/null || true

# 迁移测试报告
echo "📄 迁移测试报告..."
mv TEST_REPORT*.md .workspace/tests/ 2>/dev/null || true
mv TEST_SUMMARY*.md .workspace/tests/ 2>/dev/null || true
mv TEST_WAITING_*.md .workspace/tests/ 2>/dev/null || true
mv STAGE3_REPORT*.md .workspace/tests/ 2>/dev/null || true

# 迁移修复报告
echo "📄 迁移修复报告..."
mv *_FIX_*.md .workspace/progress/ 2>/dev/null || true
mv CODE_*.md .workspace/progress/ 2>/dev/null || true
mv SELECTOR_FIX_REPORT.md .workspace/progress/ 2>/dev/null || true
mv DB_FIX_REPORT.md .workspace/progress/ 2>/dev/null || true
mv CONFIG_FIX_*.md .workspace/progress/ 2>/dev/null || true
mv BROWSERLESS_*.md .workspace/progress/ 2>/dev/null || true

# 迁移任务报告
echo "📄 迁移任务报告..."
mv TASK_REPORT*.md .workspace/progress/ 2>/dev/null || true
mv MILESTONE_REPORT*.md .workspace/progress/ 2>/dev/null || true

# 迁移其他临时文档
echo "📄 迁移其他文档..."
mv BLOCKERS.md .workspace/progress/ 2>/dev/null || true
mv ENV_CONFIG.md docs/ 2>/dev/null || true
mv QUICK_START*.md docs/ 2>/dev/null || true

# 迁移调试文件
echo "📄 迁移调试文件..."
mv debug-*.html .workspace/debug/ 2>/dev/null || true
mv card-*.html .workspace/debug/ 2>/dev/null || true
mv search-page-*.html .workspace/debug/ 2>/dev/null || true

# 迁移当前任务文件
mv TASK_XIAOHONGSHU_SEARCH_SELECTOR.md .workspace/progress/ 2>/dev/null || true
mv TEST_REPORT_COMPLETE_2026-03-06.md .workspace/tests/ 2>/dev/null || true

echo "✅ 迁移完成！"
echo ""
echo "📊 根目录剩余文件:"
ls -la *.md 2>/dev/null || echo "无 .md 文件"
echo ""
echo "📂 .workspace 目录结构:"
find .workspace -type f | head -20
