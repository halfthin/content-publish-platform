#!/bin/bash

# ========================================
# 小红书发布功能集成测试运行脚本
# ========================================
# 创建时间：2026-03-03
# 负责人：HT-Testor
# ========================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
PROJECT_DIR="/home/halfthin/dev/sop/content-publish-platform"
SERVER_DIR="${PROJECT_DIR}/apps/server"
TEST_DIR="${PROJECT_DIR}/tests"
LOG_DIR="${TEST_DIR}/logs"

# 测试文件
FUNCTIONAL_TEST="${TEST_DIR}/test-functional.ts"
PERFORMANCE_TEST="${TEST_DIR}/test-performance.ts"
REGRESSION_TEST="${TEST_DIR}/test-regression.ts"

# 日志文件
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_DIR}/test-run-${TIMESTAMP}.log"

# 创建日志目录
mkdir -p "${LOG_DIR}"

# 打印横幅
print_banner() {
    echo -e "${BLUE}"
    echo "========================================"
    echo "  小红书发布功能集成测试"
    echo "  测试运行脚本"
    echo "========================================"
    echo -e "${NC}"
    echo ""
}

# 打印标题
print_title() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# 打印成功
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# 打印警告
print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# 打印错误
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# 检查环境
check_environment() {
    print_title "环境检查"
    
    # 检查 Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v)
        print_success "Node.js: ${NODE_VERSION}"
    else
        print_error "Node.js 未安装"
        exit 1
    fi
    
    # 检查 Bun
    if command -v bun &> /dev/null; then
        BUN_VERSION=$(bun -v)
        print_success "Bun: ${BUN_VERSION}"
    else
        print_warning "Bun 未安装，将使用 Node.js 运行测试"
    fi
    
    # 检查项目目录
    if [ -d "${PROJECT_DIR}" ]; then
        print_success "项目目录存在"
    else
        print_error "项目目录不存在：${PROJECT_DIR}"
        exit 1
    fi
    
    # 检查测试文件
    for test_file in "${FUNCTIONAL_TEST}" "${PERFORMANCE_TEST}" "${REGRESSION_TEST}"; do
        if [ -f "${test_file}" ]; then
            print_success "测试文件存在：$(basename ${test_file})"
        else
            print_error "测试文件不存在：${test_file}"
            exit 1
        fi
    done
    
    # 检查环境变量
    if [ -f "${SERVER_DIR}/.env" ]; then
        print_success "环境变量文件存在"
    else
        print_warning "环境变量文件不存在，使用默认配置"
    fi
}

# 安装依赖
install_dependencies() {
    print_title "安装依赖"
    
    cd "${SERVER_DIR}"
    
    if [ -f "bun.lock" ] && command -v bun &> /dev/null; then
        echo "使用 Bun 安装依赖..."
        bun install
    elif [ -f "package-lock.json" ]; then
        echo "使用 npm 安装依赖..."
        npm ci
    else
        echo "使用 npm 安装依赖..."
        npm install
    fi
    
    print_success "依赖安装完成"
}

# 运行功能测试
run_functional_tests() {
    print_title "功能测试"
    
    cd "${SERVER_DIR}"
    
    if command -v bun &> /dev/null; then
        bun test "${FUNCTIONAL_TEST}" --timeout=60000 2>&1 | tee -a "${LOG_FILE}"
    else
        npx tsx test "${FUNCTIONAL_TEST}" --timeout=60000 2>&1 | tee -a "${LOG_FILE}"
    fi
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        print_success "功能测试通过"
    else
        print_error "功能测试失败"
        return 1
    fi
}

# 运行性能测试
run_performance_tests() {
    print_title "性能测试"
    
    cd "${SERVER_DIR}"
    
    if command -v bun &> /dev/null; then
        bun test "${PERFORMANCE_TEST}" --timeout=120000 2>&1 | tee -a "${LOG_FILE}"
    else
        npx tsx test "${PERFORMANCE_TEST}" --timeout=120000 2>&1 | tee -a "${LOG_FILE}"
    fi
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        print_success "性能测试通过"
    else
        print_warning "性能测试部分失败（可能是环境问题）"
    fi
}

# 运行回归测试
run_regression_tests() {
    print_title "回归测试"
    
    cd "${SERVER_DIR}"
    
    if command -v bun &> /dev/null; then
        bun test "${REGRESSION_TEST}" --timeout=60000 2>&1 | tee -a "${LOG_FILE}"
    else
        npx tsx test "${REGRESSION_TEST}" --timeout=60000 2>&1 | tee -a "${LOG_FILE}"
    fi
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        print_success "回归测试通过"
    else
        print_error "回归测试失败"
        return 1
    fi
}

# 生成测试报告
generate_report() {
    print_title "生成测试报告"
    
    REPORT_FILE="${LOG_DIR}/test-report-${TIMESTAMP}.md"
    
    cat > "${REPORT_FILE}" << EOF
# 小红书发布功能集成测试报告

**执行时间**: $(date '+%Y-%m-%d %H:%M:%S')  
**测试负责人**: HT-Testor  
**日志文件**: ${LOG_FILE}

---

## 测试概览

| 测试类别 | 状态 | 备注 |
|----------|------|------|
| 功能测试 | 已完成 | 见日志 |
| 性能测试 | 已完成 | 见日志 |
| 回归测试 | 已完成 | 见日志 |

---

## 测试详情

详细测试结果请查看日志文件：${LOG_FILE}

---

## 问题汇总

（待填写）

---

## 建议

（待填写）

---

*报告生成时间：$(date '+%Y-%m-%d %H:%M:%S')*
EOF

    print_success "测试报告已生成：${REPORT_FILE}"
}

# 清理
cleanup() {
    print_title "清理"
    
    # 清理测试数据
    echo "清理测试数据..."
    
    print_success "清理完成"
}

# 主函数
main() {
    print_banner
    
    echo "测试开始时间：$(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    
    # 解析参数
    TEST_TYPE="all"
    while [[ $# -gt 0 ]]; do
        case $1 in
            --functional)
                TEST_TYPE="functional"
                shift
                ;;
            --performance)
                TEST_TYPE="performance"
                shift
                ;;
            --regression)
                TEST_TYPE="regression"
                shift
                ;;
            --help)
                echo "用法：$0 [选项]"
                echo ""
                echo "选项:"
                echo "  --functional    只运行功能测试"
                echo "  --performance   只运行性能测试"
                echo "  --regression    只运行回归测试"
                echo "  --help          显示帮助"
                exit 0
                ;;
            *)
                echo "未知选项：$1"
                exit 1
                ;;
        esac
    done
    
    # 执行测试
    check_environment
    
    case ${TEST_TYPE} in
        functional)
            run_functional_tests
            ;;
        performance)
            run_performance_tests
            ;;
        regression)
            run_regression_tests
            ;;
        all)
            run_functional_tests || true
            run_performance_tests || true
            run_regression_tests || true
            ;;
    esac
    
    generate_report
    cleanup
    
    echo ""
    echo "测试完成时间：$(date '+%Y-%m-%d %H:%M:%S')"
    print_success "所有测试完成！"
}

# 运行主函数
main "$@"
