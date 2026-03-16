/**
 * 选择器配置加载器
 *
 * 用途：加载并使用 selector.conf.json 中的选择器配置
 *
 * 使用示例:
 * const loader = new SelectorConfigLoader();
 * await loader.load();
 * const selectors = loader.getSelectors('userProfile');
 */

import { readFile } from 'fs/promises';

export class SelectorConfigLoader {
  constructor(configPath = '/home/halfthin/dev/content-publish-platform/selector.conf.json') {
    this.configPath = configPath;
    this.config = null;
    this.loadedAt = null;
  }

  /**
   * 加载配置文件
   */
  async load(forceReload = false) {
    if (this.config && !forceReload) {
      return this.config;
    }

    try {
      const content = await readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(content);
      this.loadedAt = new Date().toISOString();

      console.log(`✅ 选择器配置已加载 (v${this.config.version})`);
      console.log(`   更新时间：${this.config.updatedAt}`);
      console.log(`   验证状态:`);

      Object.entries(this.config.verificationStatus || {}).forEach(([page, status]) => {
        const icon = status.verified ? '✅' : '⚠️';
        console.log(`     ${icon} ${page}: ${status.successRate}`);
      });

      return this.config;
    } catch (error) {
      console.error('❌ 加载选择器配置失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取指定页面的选择器
   */
  getSelectors(pageType) {
    if (!this.config) {
      throw new Error('配置未加载，请先调用 load()');
    }

    const pageConfig = this.config.pages[pageType];
    if (!pageConfig) {
      throw new Error(`未找到页面类型 "${pageType}" 的配置`);
    }

    return pageConfig.selectors;
  }

  /**
   * 获取选择器（返回数组）
   */
  getSelector(pageType, field) {
    const selectors = this.getSelectors(pageType);
    const selectorList = selectors[field];

    if (!selectorList) {
      throw new Error(`未找到字段 "${field}" 的选择器`);
    }

    // 返回第一个（最优）选择器
    return selectorList[0];
  }

  /**
   * 获取所有备选选择器
   */
  getAllSelectors(pageType, field) {
    const selectors = this.getSelectors(pageType);
    return selectors[field] || [];
  }

  /**
   * 检查配置是否已验证
   */
  isVerified(pageType) {
    if (!this.config) return false;

    const status = this.config.verificationStatus?.[pageType];
    return status?.verified === true;
  }

  /**
   * 获取验证状态
   */
  getVerificationStatus(pageType) {
    if (!this.config) return null;

    return this.config.verificationStatus?.[pageType] || null;
  }

  /**
   * 获取配置版本
   */
  getVersion() {
    return this.config?.version || 'unknown';
  }

  /**
   * 获取更新时间
   */
  getUpdatedAt() {
    return this.config?.updatedAt || null;
  }

  /**
   * 刷新配置（强制重新加载）
   */
  async refresh() {
    return await this.load(true);
  }

  /**
   * 导出配置摘要
   */
  getSummary() {
    if (!this.config) return null;

    const summary = {
      version: this.config.version,
      updatedAt: this.config.updatedAt,
      loadedAt: this.loadedAt,
      pages: {},
    };

    Object.entries(this.config.pages).forEach(([pageType, pageConfig]) => {
      const selectorCount = Object.keys(pageConfig.selectors || {}).length;
      const verified = this.isVerified(pageType);
      const status = this.getVerificationStatus(pageType);

      summary.pages[pageType] = {
        selectorCount,
        verified,
        successRate: status?.successRate || 'unknown',
      };
    });

    return summary;
  }
}

/**
 * 创建默认实例
 */
export const defaultLoader = new SelectorConfigLoader();

/**
 * 便捷函数：加载配置
 */
export async function loadSelectorConfig(forceReload = false) {
  return await defaultLoader.load(forceReload);
}

/**
 * 便捷函数：获取选择器
 */
export function getSelector(pageType, field) {
  return defaultLoader.getSelector(pageType, field);
}

/**
 * 便捷函数：获取所有备选选择器
 */
export function getAllSelectors(pageType, field) {
  return defaultLoader.getAllSelectors(pageType, field);
}
