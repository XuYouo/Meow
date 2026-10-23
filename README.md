# Meow App
![Meow App 界面预览](public/images/meow-preview.jpeg)
Meow App 是一个简洁的笔记应用，支持本地存储和云端同步。你可以使用Cloudflare D1作为云端数据库。

## 功能亮点：
- 画布模式，便于整理思绪
- 热力图数据统计，满满成就感
- 模糊语法，适用于记忆场景
- 每日回顾，温故而知新
- AI对话

## 特别感谢
- CNB cloud native build<https://cnb.cool/>
- Meituan Nocode<https://nocode.cn>
- 各种 AI Coding Application。欢迎 Pull request!

## demo

含D1数据库：https://memo.oneloved.top/
D1公共实例的登录密钥是：`meow`。请勿上传不良信息和个人信息。


## 本地开发
推荐使用 Node.js 22（版本已记录在 `.nvmrc`）。本地开发使用自带的 SQLite 后端，无需配置 Cloudflare、Supabase 或云端密钥。

### 安装依赖与配置
```bash
# 已安装 nvm 时，先切换到项目版本
nvm install
nvm use
npm install
cp .env.example .env
```

如已有 `.env`，请保留现有配置并按 `.env.example` 补充本地后端变量。默认使用 `data/meownocode.db`，首次启动自动建表；本地口令 `APP_PASSWORD` 默认为空。

### 启动前后端开发服务器
```bash
npm run dev:local
```

打开 <http://127.0.0.1:8080>。该命令同时启动支持热更新的 Vite 前端和监听文件变化的 SQLite 后端（`127.0.0.1:3000`）；前端 `/api` 请求会自动代理至后端。按 `Ctrl+C` 同时停止两者。

如果未安装 nvm，且当前 Node.js 版本不兼容，可在 `npm install` 和 `npm run dev:local` 前添加 `npm exec --yes --package=node@22 --`，使用独立的 Node.js 22 运行时。

也可分别在两个终端执行 `npm run server:dev` 和 `npm run dev`。只运行前端时，使用 `npm run dev`。

### 构建与预览
```bash
npm run build
npm run preview -- --host 127.0.0.1
```

预览地址为 <http://127.0.0.1:4173>；验证 API 功能时需另行运行 `npm run server`。`npm run lint` 用于代码检查。

## 部署

### 使用Cloudflare Pages和 D1 数据库部署

#### 准备工作
1. 安装Wrangler CLI：
   ```
   npm install -g wrangler
   ```
2. 登录Cloudflare账户：
   ```
   wrangler login
   ```

#### 创建D1数据库
1. 创建一个新的D1数据库：
   ```
   wrangler d1 create meow-app-db
   ```
2. 记下输出的database_id

#### 设置访问密钥
1. 生成一个安全的密钥（可以使用以下命令）：
   ```
   openssl rand -base64 32
   ```
   或者使用在线工具生成一个随机字符串。
2. 在Cloudflare Pages设置中，添加环境变量：
   - 变量名：`PASSWORD`
   - 变量值：你生成的密钥
3. 这个密钥将用于保护你的应用，防止未授权访问。

#### 配置wrangler.toml
1. 编辑`wrangler.toml`文件，将`your-database-id`替换为上一步获取的database_id

#### 初始化D1数据库
1. 执行以下命令初始化数据库：
   ```
   wrangler d1 execute meow-app-db --file=./d1-schema.sql --remote
   ```

#### 部署到Cloudflare Pages
1. 将你的代码推送到GitHub仓库
2. 在Cloudflare控制台中连接你的GitHub仓库
3. 配置构建设置：
   - 构建命令：`npm run build`
   - 构建输出目录：`build`
4. 在Pages设置中，添加D1数据库绑定：
   - 变量名：`DB`
   - 数据库：选择你创建的D1数据库

### Docker 自部署（SQLite）

自部署版本复用了同一套前端构建产物，并通过自带的 Express + SQLite 后端提供 `/api` 接口。数据默认持久化在宿主机目录 `/data` 映射的 SQLite 文件中，与网页版依然兼容。

```
docker run -d \
   --name meownocode \
   -p 3000:3000 \
   -e APP_PASSWORD=your-strong-password \
   -v ./meownocode-data:/data \
   docker.cnb.cool/1oved/meownocode
```

> `./meownocode-data` 会在宿主机创建用于持久化的目录，容器中的 `SQLITE_DB_PATH` 默认为 `/data/meownocode.db`。


#### 环境变量说明

- `APP_PASSWORD`：前端登录所需的口令；留空表示关闭鉴权（不推荐）。
- `PORT`：后端监听端口，默认 `3000`。
- `SQLITE_DB_PATH`：SQLite 文件绝对路径，默认 `/data/meownocode.db`。
- `CORS_ALLOW_ORIGIN`：逗号分隔的允许域名，默认 `*`。
- `INIT_TOKEN`：可选的初始化口令，若配置则 `/api/init` 需要 `Authorization: Bearer <token>`。
- `SERVE_STATIC`：设为 `false` 时仅提供 API，不托管前端静态资源。

#### 本地一体化运行（无需 Docker）

```
npm run build
npm run server
```

构建产物会存放在 `build/` 下，后端同样监听 `http://localhost:3000` 并使用 `data/meownocode.db` 作为本地持久化文件。Docker 镜像会将构建产物复制到容器的 `dist/` 目录。

## 使用指南

### 云端同步
1. 在应用中打开设置
2. 在"数据"标签页中，启用"云端数据同步"
3. 选择你想要使用的云服务提供商（Supabase或Cloudflare D1）
4. 如果使用Supabase，需要先登录GitHub账号
5. 如果使用Cloudflare D1，需要先输入D1鉴权密钥进行验证
   - 密钥可以通过左侧栏中的密钥图标按钮输入
   - 也可以在设置界面中的D1选项卡中输入
6. 点击"备份到云端"或"从云端恢复"按钮进行数据同步

### 本地数据管理
1. 在设置中的"数据"标签页，你可以导出和导入本地数据
2. 导出的数据是JSON格式，包含所有想法、标签和设置

## 项目结构
- `src/` - 源代码
  - `components/` - React组件
  - `context/` - React Context
  - `lib/` - 工具库和数据库服务
- `d1-schema.sql` - D1数据库架构
- `worker.js` - Cloudflare Worker代码
- `wrangler.toml` - Cloudflare Workers配置

# 其他
## 数据库初始化与迁移

本项目支持两套后端存储：Cloudflare D1 。以下指引用于「全新初始化」与「更新既有数据库」。


### 更新既有数据库（迁移）

若你已有数据库，但表结构缺少新增字段，可按下面执行简单迁移。

- Cloudflare D1（SQLite）

```sql
-- 如缺少头像字段
ALTER TABLE user_settings ADD COLUMN avatar_config TEXT DEFAULT '{"imageUrl":""}';

-- 如缺少画布配置字段
ALTER TABLE user_settings ADD COLUMN canvas_config TEXT;

-- 如缺少双链数据
ALTER TABLE memos ADD COLUMN backlinks TEXT DEFAULT '[]';

-- 如需新增录音数据（audio_clips）
ALTER TABLE memos ADD COLUMN audio_clips TEXT DEFAULT '[]';

-- 如缺少 memos.created_at 索引
CREATE INDEX IF NOT EXISTS idx_memos_created_at ON memos(created_at);
```

- Supabase（Postgres）

```sql
-- 如缺少头像字段
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS avatar_config JSONB DEFAULT '{"imageUrl":""}'::jsonb;

-- 如缺少画布配置字段
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS canvas_config JSONB;

-- 如缺少双链数据
ALTER TABLE memos ADD COLUMN IF NOT EXISTS backlinks JSONB DEFAULT '[]'::jsonb;

-- 如需新增录音数据（audio_clips）
ALTER TABLE memos ADD COLUMN IF NOT EXISTS audio_clips JSONB DEFAULT '[]'::jsonb;

-- 如缺少 memos.created_at 索引
CREATE INDEX IF NOT EXISTS idx_memos_created_at ON memos(created_at);
```

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=y-shi23/MeowNocode&type=Date)](https://www.star-history.com/#y-shi23/MeowNocode&Date)
