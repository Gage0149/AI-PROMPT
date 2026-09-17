# AI Prompt Gallery v2.0 · 多页面飞书版

这是一次完整重构，不再沿用 v1.x 的“单页连接飞书”结构。

## 架构

- 前台：首页 + 多个独立提示词页面
- 后台：`/admin` 页面管理、飞书表绑定、字段映射、站点设置
- 数据：提示词内容仍全部保存在飞书多维表格
- 配置：页面绑定与字段映射保存在 Cloudflare D1
- 凭据：`FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `ADMIN_TOKEN` 只放 Worker Secret
- 同步：网页保存立即写回飞书；前台页面默认约 15 秒自动重新读取飞书

## 一个页面一张独立飞书表

后台新增页面时填写：

- 页面名称
- 页面地址 slug
- 页面说明
- 图标
- 排序
- 飞书多维表格链接

保存后会自动生成类似：

```text
/p/portrait
/p/poster
/p/product
```

每个页面可以绑定完全不同的飞书数据表，并分别设置字段映射。

## 字段映射

后台支持分别映射：

- 标题
- 正向提示词
- 负向提示词
- 预览图
- 分类
- 风格
- 模型 / 绘画工具
- 标签
- 来源链接
- 状态
- 备注

创建页面时会先自动识别常见字段，例如当前结构：

```text
Subject      → 标题
Lang_ZH      → 正向提示词
Image Preview → 预览图
分类          → 分类
标签          → 标签
绘画工具      → 模型 / 绘画工具
来源          → 来源链接
```

## Cloudflare 部署

### 1. 创建 D1

```bash
npx wrangler d1 create ai-prompt-gallery-db
```

把命令返回的 `database_id` 写入 `wrangler.jsonc`：

```jsonc
"database_id": "你的 D1 database_id"
```

### 2. 初始化数据库

```bash
npm install
npx wrangler d1 migrations apply ai-prompt-gallery-db --remote
```

### 3. 配置 Worker Secret

```bash
npx wrangler secret put FEISHU_APP_ID
npx wrangler secret put FEISHU_APP_SECRET
npx wrangler secret put ADMIN_TOKEN
```

`ADMIN_TOKEN` 是你自己设置的后台管理口令，建议 24 位以上。

### 4. 部署

```bash
npx wrangler deploy
```

也可以继续使用 GitHub → Cloudflare 自动部署。

## 飞书权限

需要给自建应用配置与你实际操作对应的多维表格权限；如果要显示和上传 `Image Preview` 附件，还需要对应的云文档 / 素材读取与上传权限。修改权限后记得发布应用版本。

## 后台首次使用

访问：

```text
https://你的域名/admin
```

输入 `ADMIN_TOKEN`，然后新增第一个页面并粘贴飞书表格链接。

## 目录

```text
public/          前端页面
worker/          API / 飞书代理 / 后台 API
migrations/      D1 数据库结构
tests/           自动测试
wrangler.jsonc   Cloudflare 配置
```
