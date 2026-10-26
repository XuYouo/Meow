# Meow 新版 API 清单

更新：2026-10-24。本清单依据 `shared/contracts/` 和当前实际路由注册核对，共 **43 个公开 HTTP 端点**。共享 Zod schema 是输入、输出和枚举的唯一事实来源；本文解释权限、事务及传输语义，不另外定义一套 DTO。没有旧版接口别名、注册账户接口、Cloudflare/Electron 接口或客户端云存储凭据接口。

## 1. 共同约定

- 服务由同一 Node 应用提供 `/api`；开发通过 Vite 同源代理。公开路由由 [app](../server/app.ts)、[组合根](../server/bootstrap.ts)和各域 `routes/index.ts` 显式注册；[RouteRegistry](../server/system/http/RouteRegistry.ts)检测重复方法/路径、运行时验证输入与响应，未声明访问级别不能注册。
- `public` 表示允许 anonymous，仍按当前可信主体投影数据；`owner` 要求有效服务端会话。共享口令的 owner 拥有整个工作区，并非逐用户账户隔离。请求中的 ID、角色或客户端状态不能充当身份。
- 会话 cookie 为 `meow_v2_session`，`HttpOnly; SameSite=Strict; Path=/api`，生产加 `Secure`；响应 DTO 不含 token。浏览器请求使用 `credentials: 'same-origin'`，不把口令/token 写入 localStorage。
- 普通 GET 参数放 query，路径中的 `:id` 放 path；JSON 写请求其余参数放 body。所有非 GET/HEAD/OPTIONS 的 `/api/` 请求要求 `X-Meow-Request: 1`，并校验存在时的 `Origin`；`public` 的登录/退出也适用。JSON 请求体上限 1 MiB。二进制例外见第 10 节。
- ID/operationId 为 UUID，业务时间为带时区的 ISO datetime；有限状态、字段长度、分页上限以各域 schema 为准。`revision` 是对象条件版本；memo 的 `sequence` 是同步序列，二者不能互换。
- 普通成功响应是契约输出对象，当前没有统一 `{data: ...}` 包装。失败为 [ErrorResponseSchema](../shared/contracts/api.ts)：`{error:{code,message,requestId,details?}}`，并含 `X-Request-Id`。500 不返回 SQL、堆栈或秘密。
- 通用错误：400 `INVALID_INPUT/INVALID_JSON`，401 `UNAUTHENTICATED`，403 `CSRF_REJECTED`，404 `NOT_FOUND`，413 `PAYLOAD_TOO_LARGE`，未知故障 500 `INTERNAL_ERROR`。下表列域内主要附加错误；所有输入仍受共同校验。只有白名单冲突代码可以带安全 `details`，不能依赖其他错误泄露内部信息。
- 下表 **T** 表示由路由在一个同步 SQLite 工作单元中执行，并在提交前验证响应；失败整体回滚。**A** 表示网络/文件异步编排，路由不包长事务，内部只在必要写入处使用短工作单元。只读 T 也提供一致性边界，不代表会写业务数据。
- 标有 `operationId` 的写操作按各域回执匹配请求；复用同一操作标识和相同输入重放确认响应，复用不同输入返回 409。正常重试必须保留原请求及标识，不能用客户端时间预测新 revision。没有 operationId 的接口不承诺相同回执语义。
- [sendAPI](../src/system/api/sendAPI.ts)、[sendBinaryAPI](../src/system/api/sendBinaryAPI.ts)、[sendStreamAPI](../src/system/api/sendStreamAPI.ts)统一处理取消、错误及 401 会话失效通知。401 立即隐藏私有 UI/清除该 tab 已验证标记；网络失败不等于 owner 身份。单标签页写入权只保护本机 cache/outbox，不替代服务端权限或 revision。

## 2. system 与 identity（4）

契约：[health](../shared/contracts/system/health.ts)、[identity](../shared/contracts/identity/index.ts)。注册：[app](../server/app.ts)、[identity routes](../server/services/identity/routes/index.ts)。

| 契约与方法/路径 | 输入 → 输出 schema | 认证、授权及数据 | 事务、重试与主要附加错误 | 前端/运维位置 |
|---|---|---|---|---|
| `healthContract` · GET `/api/health` | `{}` → `{status:'ready',instanceId,schemaVersion:1}` | public；检查数据库和迁移就绪，不公开业务数据 | T；只读；异常按通用 500 返回 | Docker healthcheck/运维探针；页面不定时轮询 |
| `sessionContract` · GET `/api/session` | `{}` → `SessionSchema` | public；有效 cookie 得 owner，否则 anonymous；返回当前 instanceId | T；只读；过期/无效 cookie 本身不会返回伪 owner | [GetSessionAPI](../src/apis/identity/GetSessionAPI.ts) → [App](../src/App.tsx) 启动/重连/登录后验证 |
| `loginContract` · POST `/api/session/login` | `{password:string(1..1024)}` → `SessionSchema`，同时 Set-Cookie | public；验证服务端口令，创建 owner session；客户端不能指定角色 | T；身份凭据/会话表；成功轮换当前会话；401 `INVALID_CREDENTIALS`，429 `RATE_LIMITED`；每地址 15 分钟最多 5 次尝试，成功清计数，无 operationId | [LoginAPI](../src/apis/identity/LoginAPI.ts) → [Login/Dialog](../src/pages/Login/index.tsx) |
| `logoutContract` · POST `/api/session/logout` | `{}` → anonymous `SessionSchema`，同时清 cookie | public；存在当前 owner session 时撤销；匿名也可退出 | T；会话表；重复调用保持匿名，不返回原会话 token | [LogoutAPI](../src/apis/identity/LogoutAPI.ts) → App；先隐藏私有区域，再等待服务端确认 |

## 3. memos（8）

契约及 DTO：[memos schema](../shared/contracts/memos/index.ts)。注册：[memos routes](../server/services/memos/routes/index.ts)。领域拥有 `memos/tags/memo_tags/memo_links/memo_pins/memo_attachments/memo_operations/memo_sequence/memo_tombstones`；所有写用例 T，组合根调用 media、canvas、review 的公开内部用例参与同一事务。

`MemoSchema`/`MemoDTO` 包含 `id,content,tags,links,backlinks,attachments,isPublic,isPinned,revision,createdAt,updatedAt`。附件是 `{mediaId,kind:'image'|'audio'|'file'}`，不传永久 Blob URL/Base64。公开投影仅保留公开目标的 links/backlinks。下表调用层均在 [src/apis/memos](../src/apis/memos/)，日常保存/同步由 [useWorkspace](../src/pages/Index/hooks/useWorkspace.ts)调用；画布编辑也使用同一 memo 操作入口。

| 契约与方法/路径 | 输入 → 输出 schema | 认证、授权及数据 | 事务、重试与主要附加错误 | 前端位置 |
|---|---|---|---|---|
| `ListMemos` · GET `/api/memos` | `ListMemosInputSchema` → `ListMemosOutputSchema`；offset 默认 0、limit 默认 50/最多 100；可选 search/tag/from/to | public；anonymous 只读公开笔记及公开关系，owner 可读全部 | T；只读；日期为有效 `YYYY-MM-DD` 且 from≤to；输出 items/total/offset/limit/nextOffset | [ListMemosAPI](../src/apis/memos/ListMemosAPI.ts) → 匿名公开列表分页；owner 日常同步走 changes |
| `GetMemo` · GET `/api/memos/:id` | `{id}` → `MemoSchema` | public；匿名读取私有 ID 与不存在均为 404，不泄漏实体存在性 | T；只读；404 `MEMO_NOT_FOUND` | [GetMemoAPI](../src/apis/memos/GetMemoAPI.ts) 提供单条读取单元；当前首页预览直接从已加载列表派生；后端 AI context 也调用该领域用例 |
| `GetMemoChanges` · GET `/api/memos/changes` | `GetMemoChangesInputSchema {since,limit≤100}` → `GetMemoChangesOutputSchema` | owner；读取全工作区变化序列及删除墓碑，不向匿名开放序列 | T；只读；返回按 sequence 排序的 updated/deleted、nextCursor、hasMore；不是 SSE 也不是分页列表快照 | [GetMemoChangesAPI](../src/apis/memos/GetMemoChangesAPI.ts) → useWorkspace 增量循环 |
| `CreateMemo` · POST `/api/memos` | `CreateMemoInputSchema {id,operationId,content,tags?,links?,attachments?,isPublic?,isPinned?}` → `MemoSchema` | owner；验证关联笔记存在、非自身，验证 media 可引用及 kind/MIME；维护标签/双链/置顶/媒体引用 | T；operationId 幂等；409 `MEMO_EXISTS/MEMO_DELETED/OPERATION_REUSED`，400 `INVALID_LINKS/INVALID_TAGS/INVALID_ATTACHMENTS` 及引用校验 | [CreateMemoAPI](../src/apis/memos/CreateMemoAPI.ts) → 持久 outbox |
| `UpdateMemo` · PATCH `/api/memos/:id` | `UpdateMemoInputSchema {id,operationId,baseRevision>0,content,tags?,links?,attachments?}` → `MemoSchema` | owner；只改正文及关系，公开性/置顶分开操作；不接受客户端 backlinks | T；operationId 幂等、条件 revision；404 `MEMO_NOT_FOUND`，409 `REVISION_CONFLICT/MEMO_DELETED/OPERATION_REUSED`；冲突 details 含 current 或 null | [UpdateMemoAPI](../src/apis/memos/UpdateMemoAPI.ts) → outbox；baseRevision 来自编辑开始/草稿，不能替换为后台新 revision |
| `DeleteMemo` · DELETE `/api/memos/:id` | `DeleteMemoInputSchema {id,operationId,baseRevision}` → `MemoTombstoneSchema` | owner；删除实体、关系、置顶/附件引用并更新相关笔记；组合根移除画布/回顾引用 | T；operationId 幂等、条件 revision；404/409 同更新；成功写 tombstone 和 sequence，不通过离线重试复活 | [DeleteMemoAPI](../src/apis/memos/DeleteMemoAPI.ts) → outbox |
| `SetMemoPin` · PATCH `/api/memos/:id/pin` | `SetMemoPinInputSchema {id,operationId,baseRevision,isPinned}` → `MemoSchema` | owner；改置顶关系和 memo 版本，不覆盖正文 | T；operationId 幂等、条件 revision；404/409 同更新 | [SetMemoPinAPI](../src/apis/memos/SetMemoPinAPI.ts) → 卡片菜单/outbox |
| `SetMemoVisibility` · PATCH `/api/memos/:id/visibility` | `SetMemoVisibilityInputSchema {id,operationId,baseRevision,isPublic}` → `MemoSchema` | owner；更新公开投影、相关笔记序列与媒体公开引用 | T；operationId 幂等、条件 revision；404/409 同更新；撤销公开后新的匿名请求不得读取对应私有媒体 | [SetMemoVisibilityAPI](../src/apis/memos/SetMemoVisibilityAPI.ts) → 卡片菜单/outbox |

changes 在路由注册时排在 `:id` 之前。列表中“本页没有出现某笔记”不是删除证据；owner 必须使用变化流中的墓碑。离线/未知响应保留原 outbox；400/413 变为可修正意图，409 保留本地内容与远端 DTO，只有明确选择后才产生后续写入。

## 4. media（4）

契约：[media schema](../shared/contracts/media/index.ts)。注册：[media routes](../server/services/media/routes/index.ts)。持久数据为 `media_assets`、`media_references` 和 `uploads/<id>.bin`；公开性由当前资源引用决定，不是上传时永久授予。

| 契约与方法/路径 | 输入 → 输出 schema | 认证、授权及数据 | 事务、重试与主要附加错误 | 前端位置 |
|---|---|---|---|---|
| `UploadMedia` · POST `/api/media/upload` | query `UploadMediaInputSchema {id,operationId,fileName,mimeType}` + 原始二进制 body → `MediaSchema` | owner；白名单 MIME、文件名/大小/魔数校验；异步读取结束及写入前重查活动 session | A；暂存→排他发布→短事务 metadata；相同 id/op/元数据/hash 返回同实体；400 `EMPTY_MEDIA/INVALID_MEDIA_TYPE` 或类型校验，409 `OPERATION_CONFLICT/UPLOAD_IN_PROGRESS`，413 超过 25 MiB；失败补偿见第10节 | [UploadMediaAPI](../src/apis/media/UploadMediaAPI.ts) → [pendingMedia](../src/features/media/pendingMedia.ts)、录音、画布/设置/曲库附件及导入映射 |
| `GetMedia` · GET `/api/media/:id` | `{id}` → `MediaSchema` | public；owner 可读 ready metadata；匿名仅有当前公开引用的 ready 资产 | T；只读；无权限/非 ready/不存在均为404 `NOT_FOUND` | [GetMediaAPI](../src/apis/media/GetMediaAPI.ts) → pendingMedia 上传确认恢复校验 |
| `ReadMedia` · GET `/api/media/:id/content` | `{id}` + 可选 `Range` header → 文件字节，契约输出 `null` 是直写响应标记 | public；按当前引用鉴权；文件异步 stat 后再次验证可见性/owner 会话 | A；200 或单 Range 206，416 `INVALID_RANGE`；404 `NOT_FOUND`、503 `MEDIA_UNAVAILABLE`；`private,no-store` | [ReadMediaAPI](../src/apis/media/ReadMediaAPI.ts) 按契约生成资源 URL，由 `<img>/<audio>/<a>` 发起请求；[useMediaURL](../src/features/media/useMediaURL.ts) 支持本机 Blob 预览，不解析 JSON |
| `DeleteUnusedMedia` · DELETE `/api/media/:id` | `{id}` → `{deleted:true}` | owner；只允许没有任何业务引用的资产，不能删除正在使用的文件 | A；短事务标 deleting→删除文件→短事务删 metadata；deleting 阻止新引用；409 `MEDIA_REFERENCED`，404 `NOT_FOUND`，503 `CLEANUP_FAILED` 可重试；成功后再次删除为404 | 当前 UI 未直接调用；供 owner 管理/清理的真实已注册接口，无占位按钮或虚构调用单元 |

## 5. preferences 与 canvas（5）

契约：[preferences](../shared/contracts/preferences/index.ts)、[canvas](../shared/contracts/canvas/index.ts)。注册：[preferences routes](../server/services/preferences/routes/index.ts)、[canvas routes](../server/services/canvas/routes/index.ts)。

| 契约与方法/路径 | 输入 → 输出 schema | 认证、授权及数据 | 事务、重试与主要附加错误 | 前端位置 |
|---|---|---|---|---|
| `GetPublicPreferences` · GET `/api/preferences/public` | `{}` → `PublicPreferencesSchema` | public；只读公开外观；省略 reviewTimezone/aiEnabled/aiModel/musicEnabled，不附带曲库 | T；`workspace_preferences` 只读；字体、主题、背景/头像 mediaId 等按 schema 投影 | [GetPublicPreferencesAPI](../src/apis/preferences/GetPublicPreferencesAPI.ts) → [PreferencesProvider](../src/features/settings/PreferencesProvider.tsx) 匿名分支 |
| `GetPreferences` · GET `/api/preferences` | `{}` → `PreferencesSchema` | owner；读取完整业务设置、revision/updatedAt | T；只读；不包含上游 API key/base URL | [GetPreferencesAPI](../src/apis/preferences/GetPreferencesAPI.ts) → PreferencesProvider |
| `UpdatePreferences` · PATCH `/api/preferences` | `{values:PreferenceValuesSchema,baseRevision≥0,operationId}` → `PreferencesSchema` | owner；全量校验设置，背景/头像必须为有效 image media；公开外观引用设为公开 | T；设置/回执及 media 引用同事务；operationId 幂等、条件 revision；409 `PREFERENCES_CONFLICT/OPERATION_REUSED`，媒体校验错误；schema 禁止无 image mode 时保留 mediaId | [UpdatePreferencesAPI](../src/apis/preferences/UpdatePreferencesAPI.ts) → PreferencesProvider/Settings、主题切换和当前随机背景收藏 |
| `GetCanvas` · GET `/api/canvas` | `{}` → `CanvasSchema` | owner；读取 document、revision、updatedAt；空画布 revision=0 | T；`canvases` 只读；document 只存形状/viewport/memoPositions，不复制 memo 正文 | [GetCanvasAPI](../src/apis/canvas/GetCanvasAPI.ts) → [useCanvasDocument](../src/features/canvas/hooks/useCanvasDocument.ts) |
| `SaveCanvas` · PATCH `/api/canvas` | `SaveCanvasInputSchema {document,baseRevision≥0,operationId}` → `CanvasSchema` | owner；验证 memoPositions 和 image media 引用；document 最多1000形状/5000笔记位置 | T；document、回执和 media 引用同事务；operationId 幂等，409 `CANVAS_CONFLICT/OPERATION_REUSED`；400 无效 memo/media 引用 | [SaveCanvasAPI](../src/apis/canvas/SaveCanvasAPI.ts) → useCanvasDocument 持久队列；复用主 workspace 的 canWrite，localOnly 不发送 |

设备快捷键、侧栏固定、匿名主题覆盖、播放器设备状态不写 UpdatePreferences。访客深浅主题只写新实例的设备字段，不获得 owner 写权限。设置字段的全量提交须保留当前全部 values；不能只拼旧字段而重置后来增加的业务配置。

## 6. review（4）

契约：[review schema](../shared/contracts/review/index.ts)。注册：[review routes](../server/services/review/routes/index.ts)。领域拥有 `review_results/review_operations`；键为 memoId + day + IANA timezone，均 owner，均 T。

| 契约与方法/路径 | 输入 → 输出 schema | 认证、授权及数据 | 事务、重试与主要附加错误 | 前端位置 |
|---|---|---|---|---|
| `ListReviewResults` · GET `/api/review/results` | `{timezone,day?,offset=0,limit≤500}` → `{items:ReviewResultSchema[],total,nextOffset}` | owner；只读指定时区/可选业务日的结果 | T；只读；day 为有效日历日期，不是 datetime | [ListReviewResultsAPI](../src/apis/review/ListReviewResultsAPI.ts) → [ReviewPanel](../src/features/review/ReviewPanel.tsx) 和首页重置；均循环到 nextOffset=null |
| `RecordReview` · POST `/api/review/results` | `{memoId,day,timezone,result:'PASS'|'FAIL',baseRevision≥0,operationId}` → `ReviewResultSchema` | owner；笔记须存在；修改该业务日结果 | T；operationId 幂等、条件 revision；409 `REVIEW_CONFLICT/OPERATION_REUSED`，不存在 memo 的404 | [RecordReviewAPI](../src/apis/review/RecordReviewAPI.ts) → 回顾卡片 PASS/FAIL |
| `ResetReview` · DELETE `/api/review/results` | `{memoId,day,timezone,baseRevision,operationId}` → `ReviewResultSchema` | owner；将单条结果置 null，保留版本化记录；不是删掉 memo | T；operationId 幂等、条件 revision；同 RecordReview 错误 | [ResetReviewAPI](../src/apis/review/ResetReviewAPI.ts) 调用单元已存在；当前原界面的整组“重置为待回顾”使用下一接口 |
| `ResetReviewGroup` · POST `/api/review/reset-group` | `{day,timezone,entries:[{memoId,baseRevision,operationId}]}`，1..5000且 memoId 不重复 → `{items:ReviewResultSchema[]}` | owner；把所选整组设为 FAIL；每条校验笔记及原版本 | T；整组一个工作单元，任一失败全部回滚；每条 operationId 重放；409同 RecordReview；不能以多次独立请求假装原子 | [ResetReviewGroupAPI](../src/apis/review/ResetReviewGroupAPI.ts) → ReviewPanel 日期组和 [Index](../src/pages/Index/index.tsx) 左侧“重置今日” |

## 7. music（5）

契约：[music schema](../shared/contracts/music/index.ts)。注册：[music routes](../server/services/music/routes/index.ts)。均 owner、均 T；涉及 `music_tracks/music_library/music_tombstones/music_operations`，写曲目时组合根维护私有 media 引用。

| 契约与方法/路径 | 输入 → 输出 schema | 认证、授权及数据 | 事务、重试与主要附加错误 | 前端位置 |
|---|---|---|---|---|
| `ListTracks` · GET `/api/music/tracks` | `{offset=0,limit≤500}` → `{items:TrackSchema[],total,nextOffset,revision}` | owner；自定义曲库及整个 library revision；不返回设备播放进度 | T；只读；Track source 为 media 或不含凭据的 HTTPS external URL | [ListTracksAPI](../src/apis/music/ListTracksAPI.ts) → [MusicProvider](../src/features/music/MusicProvider.tsx) 分页；内置静态曲目无需此接口 |
| `CreateTrack` · POST `/api/music/tracks` | `{id,operationId,values:TrackValuesSchema}` → `TrackSchema` | owner；验证音频/封面/歌词 media 类型，维护顺序及引用 | T；operationId 幂等；409 `TRACK_EXISTS/OPERATION_REUSED`，400媒体校验 | [CreateTrackAPI](../src/apis/music/CreateTrackAPI.ts) → MusicLibrary/MusicSearchCard |
| `UpdateTrack` · PATCH `/api/music/tracks/:id` | `{id,operationId,baseRevision>0,values}` → `TrackSchema` | owner；修改完整曲目 values 及 media 引用 | T；operationId 幂等、曲目条件 revision；404 `TRACK_NOT_FOUND`，409 `MUSIC_CONFLICT/OPERATION_REUSED` | [UpdateTrackAPI](../src/apis/music/UpdateTrackAPI.ts) → [MusicLibrary](../src/features/music/MusicLibrary.tsx) |
| `DeleteTrack` · DELETE `/api/music/tracks/:id` | `{id,operationId,baseRevision}` → `TrackDeletionSchema` | owner；删除自定义曲目/引用，记录 tombstone 并更新曲库版本；内置资源不伪装为服务端曲目 | T；operationId 幂等、条件 revision；404/409 同更新 | [DeleteTrackAPI](../src/apis/music/DeleteTrackAPI.ts) → MusicLibrary、[usePlayback](../src/features/music/usePlayback.ts) |
| `ReorderTracks` · PATCH `/api/music/order` | `{ids,baseRevision,operationId}` → `{ids,revision}` | owner；ids 必须无重复且完整包含当前全部曲目；baseRevision 是 library 版本 | T；整组排序和回执原子；409 `MUSIC_CONFLICT/OPERATION_REUSED`，400 `INVALID_TRACK_ORDER` | [ReorderTracksAPI](../src/apis/music/ReorderTracksAPI.ts) → MusicLibrary 拖拽/排序 |

## 8. integrations（8）

契约：[integrations schema](../shared/contracts/integrations/index.ts)。注册：[integrations routes](../server/services/integrations/routes/index.ts)。本域不拥有业务表；上游 URL/key/默认 model 只在服务端配置。网络请求统一走 SafeHttp 的 HTTPS、DNS/IP、重定向、超时、限额和取消边界。公共 GET 不是任意 URL 代理。

| 契约与方法/路径 | 输入 → 输出 schema | 认证、授权及数据 | 事务、重试与主要附加错误 | 前端位置 |
|---|---|---|---|---|
| `GetIntegrationStatus` · GET `/api/integrations/status` | `{}` → `{aiConfigured,aiModel,musicConfigured,backgroundConfigured,hitokotoConfigured}` | owner；仅返回可公开状态与模型名，无秘密/配置地址 | T；只读，无网络请求 | [GetIntegrationStatusAPI](../src/apis/integrations/GetIntegrationStatusAPI.ts) → Index、SettingsCard、AI/音乐功能状态 |
| `GetRepositoryStats` · GET `/api/integrations/repository` | `{}` → `{stars,url:'https://github.com/y-shi23/MeowNocode'}` | public；只访问固定仓库统计，无用户可控目标 | A；无业务写入；上游/网络校验 502/5xx | [GetRepositoryStatsAPI](../src/apis/integrations/GetRepositoryStatsAPI.ts) → SettingsCard 关于区域；失败不伪造星数 |
| `SearchMusic` · GET `/api/integrations/music/search` | `{query,limit≤50}` → `{items:SongSchema[]}` | owner；受控音乐服务，标准化搜索结果，不自动写曲库 | A；无数据库写入；503 `NOT_CONFIGURED`，502 `INVALID_EXTERNAL_RESPONSE`/安全网络错误 | [SearchMusicAPI](../src/apis/integrations/SearchMusicAPI.ts) → MusicSearchCard |
| `ResolveMusic` · GET `/api/integrations/music/resolve` | `{sourceId:1..20位数字}` → `SongSchema` | owner；解析选定歌曲，不能传任意代理 URL | A；无数据库写入；503未配置，502 `NO_AUDIO_URL/INVALID_EXTERNAL_RESPONSE` | [ResolveMusicAPI](../src/apis/integrations/ResolveMusicAPI.ts) → MusicSearchCard 播放/加入曲库前解析 |
| `GetHitokoto` · GET `/api/integrations/hitokoto` | `{types?:逗号分隔a..l}` → `{text,source}` | public；读取服务端指定的一言服务，types 只影响分类 | A；无业务写入；503未配置，502上游无效；自动请求失败由 UI 静默回退内置文案 | [GetHitokotoAPI](../src/apis/integrations/GetHitokotoAPI.ts) → 原 MemoEditor 页脚 |
| `FetchBackground` · POST `/api/integrations/background` | `{id,operationId}` → `MediaSchema` | owner；下载服务端配置的图片，不直接修改 Preferences | A；外部图片最多10 MiB，再调用 media 上传短事务；稳定 media id/op 重试；503未配置、502 `INVALID_IMAGE`，上传409/413等 | [FetchBackgroundAPI](../src/apis/integrations/FetchBackgroundAPI.ts) → SettingsCard 随机背景/刷新；收藏当前图只改 Preferences，不调用本接口 |
| `ImportImageURL` · POST `/api/integrations/images/import` | `{id,operationId,url}` → `MediaSchema` | owner；用户 URL 仍须 SafeHttp HTTPS/无凭据/公网解析校验；只接受支持的图片 | A；最多10 MiB；已有同 id/op 的确认实体先重放，否则导入为 media；不自动建立业务引用；502 `INVALID_IMAGE`，安全网络/上传错误 | [ImportImageURLAPI](../src/apis/integrations/ImportImageURLAPI.ts) → Settings ImageUpload、Canvas、音乐封面 |
| `Chat` · POST `/api/integrations/chat` | `ChatInputSchema` → **SSE**，不是 JSON `null` | owner；mode=continue/optimize/chat；只读取明确给出的 contextMemoIds，最多100；每条调用 memo 公共用例校验权限 | A；读 context 用短 T，无持久业务写入/无 operationId；400 `CONTEXT_TOO_LARGE`，503未配置，502上游失败；已发 headers 后错误为 SSE error | [ChatAPI](../src/apis/integrations/ChatAPI.ts) → [useEditorAI](../src/features/ai/useEditorAI.ts)、[AIDialog](../src/features/ai/AIDialog.tsx)；详见第10节 |

## 9. transfer（5）

契约、包结构及限额：[transfer schema](../shared/contracts/transfer/index.ts)。注册：[transfer routes](../server/services/transfer/routes/index.ts)。本域拥有 `transfer_batches/transfer_leases`、恢复 journal/暂存文件；不绕过各业务域表模块写实体。操作入口为设置中的 [Transfer](../src/features/transfer/index.tsx)。

| 契约与方法/路径 | 输入 → 输出 schema | 认证、授权及数据 | 事务、重试与主要附加错误 | 前端位置 |
|---|---|---|---|---|
| `TransferStatus` · GET `/api/transfer/status` | `{}` → `{empty,backupMaxBytes:134217728,memosSourceMaxBytes:26214400}` | owner；跨域只读快照判断新版业务数据是否为空，不把空身份表作为条件 | T；只读，不发文件；empty 只作 UI 提示，恢复提交前仍重新验证 | [GetTransferStatusAPI](../src/apis/transfer/GetTransferStatusAPI.ts) → Transfer |
| `ExportBackup` · GET `/api/transfer/backup` | `{}` → **下载字节** `BackupPackageSchema`，契约输出 null 是直写标记 | owner；完整实体一致性快照及真实媒体；不导出口令/会话/API key/操作回执/设备偏好 | A；实体一次短 T，之后读文件校验大小/hash，发送前重验 session；每次新 backupId；413 `BACKUP_LIMIT`，503 `BACKUP_ASSET_MISSING/CHANGED/HASH_MISMATCH`，不发缺文件的成功包 | [ExportBackupAPI](../src/apis/transfer/ExportBackupAPI.ts) → Transfer 保存 `.meow-backup.json` |
| `RestoreBackup` · POST `/api/transfer/restore` | 空 query；原始 backup 文件 body → `{restored:true,backupId,counts,replayed,cleanupPending}` | owner；只恢复到空新版工作区；完整校验 schema/hash/计数/跨域引用/公开性；不改变目标 instanceId/身份 | A；fenced lease/journal/文件暂存/排他发布，所有实体和回执一个短 T；backupId+包digest幂等；409 `RESTORE_REQUIRES_EMPTY/RESTORE_BATCH_CONFLICT/RESTORE_FILE_EXISTS/TRANSFER_BUSY/TRANSFER_LEASE_LOST`；400无效包/hash，413过大，503恢复/清理待处理，507存储不足 | [RestoreBackupAPI](../src/apis/transfer/RestoreBackupAPI.ts) → Transfer；相同包重试，不用新包覆盖不确定结果 |
| `PreviewMemosImport` · POST `/api/transfer/memos/preview` | query `{fileName}`；原始SQLite字节 body → `MemosPreviewSchema` | owner；只读外部 Memos 源，不写业务实体；支持明确 schema，报告 archivedExcluded/missingAssets/warnings/alreadyImported | A；源最多25 MiB，预检缓存最多32 MiB，有效期1小时；400 `UNSUPPORTED_MEMOS_FILE/SCHEMA/MEMOS_REQUIRES_SNAPSHOT/INVALID_MEMOS_SOURCE`，413 `MEMOS_IMPORT_LIMIT`，429 `IMPORT_PREVIEW_LIMIT`；新预检可有新 previewId，sourceDigest 不变 | [PreviewMemosImportAPI](../src/apis/transfer/PreviewMemosImportAPI.ts) → Transfer 选择源数据库并展示确认报告 |
| `ImportMemos` · POST `/api/transfer/memos/import` | `{previewId,operationId,allowMissingAssets,assets:[{sourceResourceId,mediaId}]}` → `{imported,sourceId,sourceDigest,missingAssets,replayed}` | owner；只接受预检结果；映射的 media 须存在且大小/MIME匹配；缺附件须提供或显式允许缺失导入 | A；先读预检文件，后一个短 T 调 memos/media 并记批次；operationId/输入指纹及 sourceDigest 去重，确定性新 memo ID；404预检不存在、410过期，400 `INVALID_IMPORT_MAPPING/IMPORT_ASSET_MISMATCH/IMPORT_ASSETS_REQUIRED`，409 `OPERATION_REUSED` | [ImportMemosAPI](../src/apis/transfer/ImportMemosAPI.ts) → Transfer 确认预检后提交；附件先走UploadMedia，不把本机源路径当服务端文件 |

外部导入只支持本实现声明的 `memo(id,content,created_ts)` 格式及已检查的可选列/资源关系；不是任意 Memos 版本/旧 Meow 备份兼容。单独 WAL/SHM、仍为 WAL 模式的数据库本体不能证明一致快照，必须先用 SQLite backup/VACUUM INTO 得到完整快照。完整包最多128 MiB，最多5000 memo/5000 assets，超限明确拒绝；参考[备份恢复运维说明](backup-and-restore.md)。

## 10. 特殊传输与恢复细节

### 10.1 二进制上传

UploadMedia、RestoreBackup、PreviewMemosImport 使用 `Content-Type: application/octet-stream` 的原始字节，**不使用 multipart/form-data，也不把文件 JSON/Base64 后提交**。所有 schema 元数据都在 URL query；例如：

```http
POST /api/media/upload?id=<uuid>&operationId=<uuid>&fileName=note.webm&mimeType=audio%2Fwebm
Content-Type: application/octet-stream
Accept: application/json
X-Meow-Request: 1
Cookie: meow_v2_session=<HttpOnly browser cookie>

<file bytes>
```

该示例 cookie 由浏览器自动管理，前端 JavaScript 不读取。录音 MIME 的 `;codecs=...` 参数在客户端规范化成契约 MIME，服务端仍独立验证魔数。文件上限在读取过程中执行，不只相信 Content-Length。UploadMedia 路由还检查二进制类型并设置30秒 socket超时；transfer 读取器按各自总字节上限检查，schema 之外不承诺它有额外 MIME/文件扩展兼容。

浏览器先将真实 Blob 和稳定 mediaId/operationId 写 [PendingMediaStore](../src/system/storage/PendingMediaStore.ts)，成功后才写草稿引用。memo/canvas 提交前 ensure 上传；确认上传后保留本机 Blob，业务 ACK 后才 release。若已上传记录需要恢复，先 GET metadata；网络/普通500不丢“已上传待核验”状态；404 换新 operationId 重传同 mediaId，`MEDIA_FILE_MISSING`（503）则用保留 Blob 和原 operationId 修复已确认记录的缺失文件。配额失败不显示为已保存。页面展示 Object URL 必须在生命周期结束释放。

### 10.2 媒体读取

`ReadMedia.output = z.null()` 表示用例直接写 response，不代表成功 body 是 JSON null。通常200；合法单一 `Range: bytes=start-end`/suffix 为206，响应含 Content-Range/Accept-Ranges/Content-Length；无效范围416。image/audio 默认 inline，其他类型 attachment。公开引用撤销后停止新的匿名读取；已经下载到浏览器的字节无法追回。

### 10.3 完整备份和恢复

ExportBackup 返回 `application/octet-stream`、Content-Disposition 和 Content-Length，内容是未压缩 UTF-8 JSON `BackupPackageSchema`，其中 assets 字节用 Base64 打包；这与上传协议不使用 Base64 是不同边界。导出会实际读取并验证全部媒体，包含 manifest 的 counts/hash/来源实例及未打包的 external 曲目地址。

RestoreBackup 的 HTTP body 是上述整个文件字节，成功仍返回 JSON。预验证和文件副作用不放在长数据库事务中；实体恢复/批次回执是一个事务。失败提交前补偿自己建立的文件；提交后清理失败返回 `cleanupPending:true`，不能宣称数据库回滚。相同 backupId+digest 可重试完成清理；不同内容复用标识409。journal/lease 防止过期恢复进程继续提交。恢复保持业务 ID/revision/time/order，但实例身份仍属于目标新实例，不继承来源浏览器缓存或会话。

### 10.4 AI SSE

请求为普通 JSON，`Accept: text/event-stream`。`Chat.output = z.null()` 同样是直写响应标记。成功响应 `Content-Type: text/event-stream; charset=utf-8`、`Cache-Control: no-cache, no-store`、`X-Accel-Buffering: no`，事件形态为：

```text
data: {"delta":"一段文本"}

data: {"done":true}

```

流中失败发送 `data: {"error":"可显示错误"}`；headers 发出前仍按普通 HTTP ErrorResponse 返回。服务端归一化上游 OpenAI 风格事件，客户端不解析上游私有格式。delta 为增量文本，不是累计全文；done 才表示完整结束，EOF 没有 done 是失败。总流上限2 MiB，正确处理 UTF-8/行分片和取消。取消、断网或异常时 UI 保留已收到的正文草稿，不伪造完成消息。这里只生成文本，保存 memo 仍需走独立 memo 用例及持久队列。

## 11. 内部用例：没有 HTTP 路由

以下 `<Action>APIMessage.plan` 由组合根、框架接入或 transfer 编排直接调用。名字中含 Export/Restore/Assert/Import 不代表存在同名 HTTP 接口。公开导出/恢复只有第9节 transfer 路由；没有 `/api/memos/export`、`/api/media/restore` 等隐藏别名。

| 所属域 | 内部用例及入口职责 |
|---|---|
| identity | `InitializeIdentity` 初始化/轮换配置口令哈希；`ResolveSession` 将 cookie 转可信主体；`AssertOwner`、`AssertActiveSession` 在组合调用及异步边界重验权限/会话 |
| memos | `AssertMemoReferences` 验证引用；`ExportMemos`/`RestoreMemos` 供完整快照恢复；领域内部 `ImportMemos` 接受已规范化实体，与 transfer 公开 ImportMemos 编排不是第二条路由 |
| media | `ValidateMediaReferences`、`SetMediaReferences` 统一类型/可见性关系；`FindUploadedMedia` 支持受控图片导入重放；`ExportMedia`、`RestoreMedia`、`IsMediaEmpty` 支持 transfer |
| canvas | `RemoveMemoReferences` 参与 memo 删除同事务；`ExportCanvas`、`RestoreCanvas` 支持 transfer |
| preferences | `ExportPreferences`、`RestorePreferences`、`IsPreferencesEmpty` 支持 transfer |
| review | `RemoveMemoReferences` 参与 memo 删除同事务；`ExportReviews`、`RestoreReviews`、`IsReviewsEmpty` 支持 transfer |
| music | `ExportMusic`、`RestoreMusic`、`IsMusicEmpty` 支持 transfer |

前端调用单元和后端公开用例按契约对应；当前没有 UI 动作的公开读取/清理端点已在表中明确标出，不为凑齐界面而添加占位入口。新增接口须同时更新共享 schema、实际注册、调用单元、边界测试与本清单。
