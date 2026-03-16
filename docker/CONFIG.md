# Docker 配置说明

## 外部服务配置

### PostgreSQL
- **主机**: host.docker.internal
- **端口**: 54321
- **数据库**: content-publish
- **用户**: postgres
- **密码**: Bing!15706668163
- **连接字符串**: `postgresql://postgres:Bing!15706668163@host.docker.internal:54321/content-publish`

### Redis
- **主机**: host.docker.internal
- **端口**: 16378
- **用户**: halfthin
- **密码**: redis
- **连接字符串**: `redis://halfthin:redis@host.docker.internal:16378/0`

## 网络配置

使用 `extra_hosts` 在 docker-compose.yml 中配置 `host.docker.internal`，使容器能够访问宿主机上运行的外部服务。

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

## 架构说明

```
┌─────────────────────────────────────────────┐
│   外部服务（已独立部署）                      │
│   PostgreSQL :54321                          │
│   Redis      :16378                          │
└─────────────────────────────────────────────┘
                    ↑
                    ↓ (通过 host.docker.internal)
┌─────────────────────────────────────────────┐
│   项目 Docker Compose                        │
│   ┌──────────────┐  ┌──────────────┐        │
│   │    Server    │  │     Web      │        │
│   │   :3000      │  │    :8080     │        │
│   │ Playwright   │  │   Vue 3      │        │
│   └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────┘
```

## 修改日期
2026-03-02

## 修改原因
- 移除项目内的 PostgreSQL 和 Redis 容器
- 使用已独立部署的外部 PostgreSQL 和 Redis 服务
- 通过 host.docker.internal 访问外部服务
