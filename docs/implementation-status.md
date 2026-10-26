# 新版本实施与验收记录

更新：2026-10-24。用户已授权完整实施 [P1–P8](refactoring-plan.md)，并明确**保留原有界面和视觉效果，只升级实现**。本文件区分自动测试、实际浏览器、进程与 Docker 的证据；外部服务未实测项不计作已通过。

## 实施范围

| 阶段 | 已实现内容 | 验证入口 |
|---|---|---|
| P0 | 完整现状盘点、8 个架构问题、领域/表/接口归属、无旧版兼容及退役决策 | [架构](architecture.md)、[计划](refactoring-plan.md)、[AGENTS](../AGENTS.md) |
| P1 | 前后端严格 TypeScript、ESLint、Vitest/RTL、锁文件、Node 22.23.4、质量 CI | `npm ci`、`npm run check`；CI 与本地使用同一命令 |
| P2 | 应用/进程分离、独立新实例、owner/anonymous、scrypt、到期/撤销会话、防 CSRF、统一错误 | `identity-system.test.ts`、`AppSession.test.tsx`、实际 HTTP 登录及 Docker 错误库拒启 |
| P3 | 共享 Zod 契约、领域 schema、版本化迁移、实例/主体存储隔离 | `architecture.test.ts`、`WorkspaceCache.test.ts`、新实例 API 与真实 SQLite |
| P4 | 笔记、标签、反链、公开/私有、置顶、条件 revision、幂等队列、删除记录、冲突与草稿恢复 | `memos-domain.test.ts`、`WorkspaceWriter.test.tsx`、双标签页实际接管 |
| P5 | 原列表、设置、画布、每日回顾、音乐界面的 TSX 实现；共享业务状态与设备态分离 | `workspace-domains.test.ts`、画布几何/存储/呈现、原界面与音乐生命周期测试；浏览器回归 |
| P6 | 实际媒体卷、Blob 暂存、权限/Range、上传补偿、受控 HTTPS、AI SSE、音乐/背景/一言集成 | `media-domain.test.ts`、`media-publication-race.test.ts`、`integrations.test.ts`、录音与 AI 故障测试 |
| P7 | 完整新版备份/空实例恢复、只读 Memos 预检导入、退役旧实现 | `transfer.test.ts`、备份/恢复及架构测试、实际 Docker 全域恢复比对 |
| P8 | 本地开发、构建后 Node、非 root Docker、持久卷、Compose、运行与备份说明 | 最终全量门禁、Node 重启、Docker 同卷重建/恢复、实际 Compose 与浏览器已验收；限制见末节 |

旧基线只有 Vite build 可运行；lint 缺配置，没有 test/typecheck。新工具链与测试已经取代这套基线。主机默认 Node 25 与目标不符，本次使用独立安装的 Node 22.23.4，Docker 使用相同版本。

## 自动验证及关键故障场景

最终执行 `npm run check` 通过：严格 TypeScript、零 warning ESLint、**30 个测试文件 / 193 项测试**、前后端生产构建全部通过。`npm audit`（包含开发依赖）结果为 **0 个已知漏洞**；`git diff --check` 与活跃文档本地链接检查通过。完整本机日志为 `/private/tmp/meow-final-check.log`。质量 CI 已配置相同入口，未推送触发远程运行。

- 身份：匿名不读私有实体/媒体/备份；500 不自动解锁私有缓存；401/退出隐藏私有内容；会话撤销在长上传/恢复后再次检查；错误日志不输出凭据或 SQL。
- 数据：事务中途异常完整回滚；DTO 在提交前校验；Promise 工作单元被拒绝；条件 revision 与 payload 指纹拒绝冲突；删除后离线重试不能复活原 ID；分页缺项不当作删除。
- 浏览器缓存：先持久化意图再发送，未知结果复用 operationId；单项失败保留草稿和 Blob；同 origin/实例/主体单 writer，其余标签页只读；过期异步响应与失权回调不得继续写入。
- 媒体：真实文件大小/hash/MIME、公开引用撤销、Range 206/416、未知同名文件保护、失踪文件修复、元数据失败补偿、清理失败重试。上传/删除/恢复共享应用实例内文件发布锁；专门交错测试证明失败补偿不会删除后来已确认的文件。
- 恢复：全域 DTO 和实际文件字节一致；损坏/缺文件/越界引用拒绝；暂存磁盘满、事务前后故障、过期 lease、同包重试、提交后 cleanupPending 分别验证。journal 原子发布；空目录/残缺 journal 的安全恢复与含未知文件时保留并拒绝都有测试。
- 外部服务：注入合成 HTTP/SSE 上游验证碎片 UTF-8、DONE、取消、失败、限额、URL 导入幂等；DNS/重定向/私网地址和 TLS 主机校验有明确边界。
- 架构：AST 检查运行入口无旧 JS/JSX、用例单一 plan、路由与契约对应、SQL 归表、对象无副作用、依赖无环及禁止跨域私有写表。不是仅按文件名检索后宣布合规。

## 实际浏览器验证

使用独立 loopback origin 和合成新数据，没有使用用户旧笔记、浏览器 profile 或真实麦克风权限。

| 已执行场景 | 实际观察 |
|---|---|
| 原主页、侧栏、窄屏菜单、主题和 Markdown/标签 | 与原呈现层对照；保留原 CSS/token/静态资源，中文输入和列表正常 |
| 新建笔记、Ctrl+Enter、刷新 | 笔记落库后重载仍可见，队列 ACK 后清除 |
| 两标签页 | 第二页只读；关闭 writer 后自动接管，准确恢复原页合成草稿并提交成功 |
| 字体设置 | 16→17 保存并刷新仍为17，再改回16；发现并修复 DTO 元信息误入 strict values 的集成问题 |
| 每日回顾 | 原玻璃卡片/翻面呈现；Space 翻面提示双链，ArrowDown 标记 PASS 后切换下一卡 |
| 画布 | 窄屏容器高度正确、原网格/工具/选项保留；实际绘制矩形、Enter 新增笔记、拖动卡片；刷新仍保留图形/笔记/缩放 |
| 本地音频 | 实际上传合成 WAV 并加入原曲库；选择播放、全屏与迷你切换，始终仅一个 audio；实际 duration=0.1、readyState=4、error=null |
| 分享图 | 实际下载最终 PNG 并打开检查：原字体/金饰模板保留，正文完整；失败/重复/取消/超时由专项测试覆盖 |
| 构建后 Node 与最终 Docker 页面 | 公开页仅显示1条公开笔记；真实登录后可见2条全域合成数据及反链；搜索更新URL，退出立即隐藏私有内容 |

实际浏览器包括1280px桌面与855px菜单布局；没有据此宣称所有手机尺寸/浏览器均已验收。原界面对照与最终 Docker 截图已留存。自动 DOM/音频 mock 与实际浏览器、真实麦克风录制分别报告，不互相替代。

## Node 与 Docker 实际证据

使用独立合成数据卷和仅绑定 loopback 的端口；没有重启、删除或替换已有生产服务。

- 最终镜像 `meow-upgrade-check:final`，SHA-256 `6fd622b1288d7dc77ccaad6bab1ffc2590af9cd87598d770eb865a0ad0059eee`，本机 Linux arm64，Node 22.23.4，uid1000（node）。通过锁文件干净安装与构建；镜像内实际检查无 `.env`、本机数据、旧 Electron 入口、源码及 TypeScript/Vitest/ESLint 开发工具。
- 构建后 Node 实例用独立目录完成同一全域 seed/verify，正常 SIGTERM 后重启，再次逐域和附件核对通过。
- 仓库原 `docker-compose.yml` 在独立项目 `meow-upgrade-compose-check` 实际启动，使用已构建最终镜像及独立合成卷、回环18404；相同全域 seed/verify 通过。Dockerfile 构建与 Compose 运行分别验证，没有把静态 config 检查当作实际部署。
- 实际写入两条公开/私有笔记、标签/反链/置顶、PNG/WAV 字节、设置、画布、回顾、音乐/LRC/弹幕，导出完整包。删除并重建测试容器后，同卷所有 DTO、instanceId、附件 hash 不变。
- 将完整包恢复到另一空的新卷，逐域比较 ID、revision、时间、顺序、引用与字节；目标 instanceId 独立。私有音频匿名404，公开背景可读，Range 返回206，匿名备份401。
- 三类错误数据卷（外来库、更新的格式版本、更新的迁移记录）均真实进程 exit1；数据库/哨兵 SHA-256 与目录清单不变，无额外 WAL/SHM。
- 新版后续迁移合成故障：已存在有内容的表，下一迁移建表并改行后抛错；回滚后以原版本重开，业务行、instanceId、迁移历史和数据库 SHA-256 保持一致。

本机详细证据留在 `/private/tmp/meow-docker-evidence.json`、`meow-built-final-evidence.json`、`meow-compose-final-evidence.json`、对应完整备份、`meow-docker-refusal-report.json`、`meow-docker-migration-report.json` 与 `meow-final-docker-build.log`。这些是本次验证产物，不是仓库运行依赖；测试卷和真实用户卷明确分开。验收后已正常停止并移除临时容器/网络，关闭本次 Node/Vite 服务；保留最终镜像、合成数据卷与报告，没有删除用户数据。

## 退役核对与适用限制

- Cloudflare Pages/Workers/D1、Supabase、Electron、客户端 S3/R2 运行路径及旧 JS/JSX 业务入口已移除；原 CSS、SVG、图片、emoji、教程等共享静态资产保留。被移除源码在 Git 历史及本次临时 SHA-256 清单中可追溯。
- 新版不读取、转换或清空旧数据库、旧浏览器键、profile 或云资源；不提供旧协议/备份兼容层。外部 Memos 导入是单独声明格式的产品能力。
- 单数据目录仅支持单 Node 进程/单 Docker 副本独占；进程内锁不代表支持共享文件卷多进程写入。
- Web Locks 需要受支持浏览器和安全上下文；无能力时安全只读。离线能力覆盖已载入内容、草稿和待提交队列，不声称完整离线 PWA。
- 当前网络 DNS 将外部域名解析为 Clash Fake-IP 保留网段，受控请求按设计拒绝。已验证合成上游和失败隔离，**没有宣称真实 AI、音乐、随机背景、一言服务全部端到端成功**；真实 AI 也未提供密钥。没有修改用户代理或放宽私网校验。
- 真实麦克风录制、其他浏览器/操作系统、远程 GitHub CI 和远端 HTTPS 生产部署未执行。录音以生命周期故障测试与实际合成音频文件覆盖；没有为完成验证接受额外麦克风授权。
- 构建仍有核心 JS chunk 约569 kB、大于500 kB 的体积提示。已拆可选模块且没有提高警告阈值；不影响类型、测试或产物生成。
- 本轮 P0–P8 实现与上述范围验收完成，没有提交、推送或部署生产环境；源码与说明留在工作区供审阅。

## 2026-10-26 环境配置清理

- 本机 `.env` 已删除不再读取的旧版 `PASSWORD`、`APP_PASSWORD`、Supabase 和旧后端配置，保留当前配置读取器使用的 `MEOW_*` 项；没有修改数据库或附件。
- `.env` 与 `.env.example` 不预置密码或 API 密钥。网页登录密码为注释中的 `MEOW_OWNER_PASSWORD`，用户取消注释、填写 12–1024 字符密码并重启后生效；未设置时仅可公开浏览。可选 `MEOW_AI_API_KEY` 留空，并明确其用途是 AI 服务商鉴权。
- `.gitignore` 忽略 `.env` 及 `.env.*` 本机配置，保留 `.env.example` 模板可跟踪；覆盖文档推荐的 `.env.v2`。
- 已使用 `dotenv` 与实际 `readConfig` / `readIntegrationConfig` 验证两份配置的默认解析、未配置秘密时的状态和合成密码/AI 密钥配置；逐项核对变量均被运行时或 Compose 使用，检查本机 `.env` 权限仍为 `0600`、Git 忽略规则及 `git diff --check` 通过。配置检查使用主机 Node 25.3.0 与现有 tsx，仅调用纯配置读取器；未启动服务、打开数据库或重跑 Node 22.23.4 全量门禁。
