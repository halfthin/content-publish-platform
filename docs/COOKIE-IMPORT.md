# Cookie 导入指南

**版本**: 1.0  
**更新日期**: 2025-12-19  
**维护者**: HT-Fish 🐟

---

## 📋 目录

1. [什么是 Cookie](#什么是-cookie)
2. [从浏览器导出 Cookie](#从浏览器导出-cookie)
3. [导入 Cookie 到平台](#导入-cookie-到平台)
4. [验证 Cookie](#验证-cookie)
5. [常见问题](#常见问题)

---

## 什么是 Cookie

Cookie 是网站存储在用户浏览器中的小段数据，用于保持登录状态。

**小红书 Cookie 示例**:
```json
[
  {
    "name": "a1",
    "value": "xh_token_value_here",
    "domain": ".xiaohongshu.com",
    "path": "/",
    "expires": 1709251200,
    "httpOnly": true,
    "secure": true
  }
]
```

**重要**: 
- `a1` Cookie 是小红书的主要登录凭证
- Cookie 有有效期，过期需要重新导入
- Cookie 必须加密存储，防止泄露

---

## 从浏览器导出 Cookie

### 方法 1：Chrome 开发者工具

#### 步骤 1：登录小红书

1. 打开 Chrome 浏览器
2. 访问 https://www.xiaohongshu.com
3. 登录你的账号

#### 步骤 2：打开开发者工具

- **Windows/Linux**: `F12` 或 `Ctrl + Shift + I`
- **Mac**: `Cmd + Option + I`

#### 步骤 3：找到 Cookie

1. 点击 **Application** 标签
2. 左侧展开 **Cookies**
3. 选择 `https://www.xiaohongshu.com`

#### 步骤 4：复制 Cookie

1. 找到名为 `a1` 的 Cookie
2. 右键点击 → **Copy** → **Copy object**

或者使用控制台：

```javascript
// 在控制台执行
const cookies = document.cookie.split(';').map(c => {
  const [name, value] = c.trim().split('=');
  return { name, value, domain: '.xiaohongshu.com', path: '/' };
});
console.log(JSON.stringify(cookies, null, 2));
```

---

### 方法 2：使用浏览器扩展

#### 推荐扩展

- **EditThisCookie** (Chrome)
- **Cookie Editor** (Firefox)
- **Cookie-Editor** (Edge)

#### 使用步骤

1. 安装扩展
2. 登录小红书
3. 点击扩展图标
4. 点击 **Export** → **JSON**
5. 复制 Cookie 数据

---

### 方法 3：使用命令行工具

#### 使用 curl

```bash
# 从浏览器导出 Cookie 文件
curl --cookie-jar cookies.txt https://www.xiaohongshu.com

# 查看 Cookie
cat cookies.txt
```

#### 使用 jq 处理

```bash
# 转换为 JSON 格式
cat cookies.txt | jq 'split("\n") | map(select(startswith("#") | not)) | map(split("\t")) | map({name: .[5], value: .[6], domain: .[0], path: .[2]})'
```

---

## 导入 Cookie 到平台

### 方法 1：通过 Web 界面

#### 步骤

1. 访问平台：http://localhost:8080/accounts
2. 选择要导入的账号
3. 点击 **导入 Cookie** 按钮
4. 粘贴 Cookie JSON 数据
5. 点击 **验证** 检查有效性
6. 点击 **保存**

#### Cookie 格式

```json
[
  {
    "name": "a1",
    "value": "your-token-value-here",
    "domain": ".xiaohongshu.com",
    "path": "/",
    "expires": 1709251200,
    "httpOnly": true,
    "secure": true
  }
]
```

---

### 方法 2：通过 API

#### 单个账号导入

```bash
curl -X POST http://localhost:3000/api/accounts/{accountId}/cookies \
  -H "Content-Type: application/json" \
  -d '{
    "cookies": [
      {
        "name": "a1",
        "value": "your-token-value",
        "domain": ".xiaohongshu.com",
        "path": "/",
        "expires": 1709251200,
        "httpOnly": true,
        "secure": true
      }
    ],
    "password": "your-encryption-key"
  }'
```

#### 批量导入

```bash
curl -X POST http://localhost:3000/api/accounts/cookies/batch-import \
  -H "Content-Type: application/json" \
  -d '{
    "imports": [
      {
        "accountId": "account-id-1",
        "cookies": [{"name": "a1", "value": "token1"}]
      },
      {
        "accountId": "account-id-2",
        "cookies": [{"name": "a1", "value": "token2"}]
      }
    ]
  }'
```

---

## 验证 Cookie

### 通过 Web 界面

1. 访问账号管理页面
2. 点击 **验证 Cookie** 按钮
3. 等待验证结果
4. 查看登录状态

### 通过 API

```bash
curl "http://localhost:3000/api/accounts/{accountId}/cookies/verify?password=your-encryption-key"
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "isLoggedIn": true,
    "verifiedAt": "2025-12-19T12:00:00.000Z",
    "platform": "xiaohongshu"
  }
}
```

---

## 常见问题

### Q1: Cookie 导入后验证失败？

**可能原因**:
- Cookie 已过期
- Cookie 格式不正确
- 加密密码不匹配

**解决方法**:
1. 重新从浏览器导出 Cookie
2. 检查 JSON 格式是否正确
3. 确认加密密码一致

---

### Q2: Cookie 有效期多久？

**答案**: 
- 小红书 Cookie 通常有效期为 30-90 天
- 建议每 2 周更新一次
- 平台会在发布前自动检查 Cookie 有效性

---

### Q3: 可以导入多个账号的 Cookie 吗？

**答案**: 
- 可以，支持批量导入
- 每个账号需要单独验证
- 建议在账号管理页面操作

---

### Q4: Cookie 安全吗？

**答案**: 
- Cookie 使用 AES-256-GCM 加密存储
- 只有平台可以解密使用
- 建议定期更新加密密钥
- 不要分享 Cookie 文件

---

### Q5: 如何删除已导入的 Cookie？

**方法 1：Web 界面**
1. 访问账号管理
2. 选择账号
3. 点击 **删除 Cookie**

**方法 2：API**
```bash
curl -X DELETE http://localhost:3000/api/accounts/{accountId}/cookies
```

---

### Q6: Cookie 导入后无法发布？

**可能原因**:
- Cookie 已过期
- 账号被限制
- 发布参数错误

**解决方法**:
1. 验证 Cookie 有效性
2. 检查账号状态
3. 查看详细错误日志

---

## 最佳实践

### 1. 定期更新 Cookie

- 每 2 周更新一次
- 发布失败时立即更新
- 收到过期通知时更新

### 2. 安全存储

- 使用强加密密码
- 不要明文存储 Cookie
- 定期备份 Cookie 数据

### 3. 多账号管理

- 为每个账号设置备注
- 分组管理账号
- 记录账号使用情况

### 4. 监控和告警

- 开启 Cookie 过期提醒
- 监控发布失败率
- 及时处理异常

---

## 脚本示例

### Node.js 导出脚本

```javascript
// save-cookies.js
const fs = require('fs');

async function exportCookies() {
  // 使用 puppeteer 等工具导出
  const cookies = await page.cookies();
  
  fs.writeFileSync(
    'xiaohongshu-cookies.json',
    JSON.stringify(cookies, null, 2)
  );
  
  console.log('Cookie 已导出到 xiaohongshu-cookies.json');
}

exportCookies();
```

### Python 导入脚本

```python
# import_cookies.py
import requests
import json

def import_cookies(account_id, cookies_file, password):
    with open(cookies_file, 'r') as f:
        cookies = json.load(f)
    
    response = requests.post(
        f'http://localhost:3000/api/accounts/{account_id}/cookies',
        json={'cookies': cookies, 'password': password}
    )
    
    print(response.json())

# 使用
import_cookies('account-id', 'cookies.json', 'your-password')
```

---

**文档维护者**: HT-Fish 🐟  
**最后更新**: 2025-12-19
