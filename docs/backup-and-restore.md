# 新版备份、恢复与外部 Memos 导入

本文对应当前 TypeScript 实现与 `shared/contracts/transfer/index.ts`，不描述旧 Meow 导出格式。所有操作都需要工作区 owner 会话；共享口令代表整个工作区，不能区分不同个人。界面入口为「设置 → 数据」。测试使用临时 SQLite 与合成附件，未读取或改写真实用户数据。

## 完整工作区包

导出结果是未压缩 UTF-8 JSON，结构为 `manifest + entities + assets`，文件名通常为 `*.meow-backup.json`。通过有界二进制请求/响应传输，并非 ZIP，也不接受 ZIP、目录、旧版备份或任意数据库作为恢复输入。当前 `format=meow-workspace`、`formatVersion=1`、`schemaVersion=1`；未知字段/版本及格式错误会被拒绝。

| 部分 | 内容 |
| --- | --- |
| manifest | 备份 UUID、创建时间、来源 instanceId、实体/字节计数、排除项、没有包含字节的外部音乐清单 |
| memos | 笔记 ID、revision、创建/修改时间、内容、公开性、标签、links/backlinks、附件引用、实际置顶顺序，以及删除墓碑 |
| preferences | 工作区设置、revision/更新时间；包括外观、字体、头像/背景引用、一言、私有 AI 开关/模型、音乐开关与回顾时区 |
| canvas | 文档、形状/媒体引用、笔记位置、revision/更新时间 |
| reviews | memoId、业务日期、时区、PASS/FAIL/重置状态、revision/更新时间 |
| music | 曲库元数据、排序、歌词/弹幕、音频/封面/歌词媒体引用、实体 revision/时间、删除墓碑与曲库 revision |
| media | 所有 ready 媒体的 ID、文件名、MIME、大小、SHA-256、创建时间和资源引用公开性；assets 按相同 ID 存放实际文件的规范 Base64 |

口令/凭据、会话、第三方服务密钥、操作回执与设备偏好不在包内。设备偏好包括播放进度、音量、快捷键、侧栏固定状态等浏览器本机设置。外部 HTTPS 曲目保存 URL，manifest 的 `unbundledExternalTracks` 明列未打包音频字节；不会把远端链接称为已备份文件。

导出在一个同步 SQLite 工作单元中取得全部领域快照，再读取不可变媒体文件并逐一核对大小和 SHA-256。缺文件、文件变化、删除过程未完成、实体/包超限都会导致整个导出失败，不返回“部分完整包”。文件读取期间不占用数据库写事务。

## 容量与一致性边界

| 项目 | 当前上限 |
| --- | --- |
| 完整 JSON 包的实际 UTF-8 字节数 | 128 MiB（134,217,728 bytes，含 Base64 与元数据） |
| 单个媒体文件 | 25 MiB（26,214,400 bytes） |
| 笔记 / 笔记墓碑 / 媒体 | 每类各 5,000 |
| 回顾结果 / 媒体资源引用 | 每类各 100,000 |
| 自定义曲目 / 曲目墓碑 | 每类各 10,000 |
| 画布 | 1,000 形状、5,000 笔记位置；其他字符串/数组还受共享领域 schema 限制 |

接收端按实际读取字节计数，不能用虚假的 Content-Length 绕过限制；输入中断不进入领域提交。当前实现有界地在内存中解析包与校验文件，并非任意规模的流式归档。Base64 通常增加约三分之一大小，不能按原始附件总大小推断包一定可导出。每个公开普通 JSON 请求仍有自身较小的解析上限；恢复与 SQLite 预检走二进制通道。

包内计数、ID 唯一性、规范 Base64、大小/hash、实体关系及资源公开性均重新验证。引用必须与实体推导结果完全相同：memo/music 使用实体 UUID，preferences/canvas 使用固定 `workspace`；preferences 头像/背景公开，canvas/music 私有，memo 根据笔记公开性决定。手工修改引用公开性、丢失实体或混入路径不能绕过验证。文件名由已验证的媒体 UUID 构造，包不指定目标磁盘路径。

## 恢复到空的新实例

1. 为目标配置独立的新 `MEOW_DATA_DIR`，按部署说明启动并登录 owner。不要把数据目录指向旧版数据库，也不要为恢复删除已有真实数据。
2. 确认目标工作区为空，选择本版完整包并保留源文件，执行「验证并恢复完整包」。
3. 成功后重新加载页面，确认笔记、设置、画布、回顾、曲库和附件可访问。目标保留自己的新 instanceId，浏览器队列/缓存不会沿用来源实例命名空间。

“空”要求：没有 live memo、memo 墓碑、已保存设置（revision 必须为 0）、已保存画布（revision 必须为 0）、回顾结果、曲目/曲目墓碑或媒体，曲库 revision 也必须为 0。即使修改过设置后又改回默认，或对空曲库提交过排序，也不是空实例。身份初始化、登录会话、迁移记录和恢复回执不算业务内容。各领域 Restore 用例还各自检查空状态；不以清表代替恢复。

恢复依次执行：全部包/文件验证 → 检查 active session 和空工作区 → 获取恢复租约 → 写暂存 journal/文件 → 排他发布文件 → 在短事务内再次检查租约、会话和空状态 → 调用各领域 Restore → 写批次回执 → 提交 → 清理暂存。实体写入共用一个 SQLite immediate 工作单元，任一领域失败全部回滚；保留原业务 ID/revision/time/order/墓碑。媒体上传操作号重新生成，来源操作回执不导入。

暂存位于 `uploads/.restore/<backupId>.<leaseId>/`。journal 先写入 `journal.json.tmp`，完整写入后通过 rename 原子发布为 `journal.json`，然后才允许暂存和发布附件。journal 记录 backupId、完整包 SHA-256、leaseId 与预期媒体 ID。暂存用 `wx` 创建，发布用硬链接，拒绝覆盖已经存在的目标文件；即使数据库为空，未登记在库内的未知文件也保留。回滚只删除 inode/device 与本批暂存文件相同的目标硬链接，不按文件名盲删。

上传、删除附件和恢复共用应用实例内的文件发布锁。恢复取得锁后重新检查会话、租约和空工作区，并持锁完成旧批清理、文件发布、领域提交和失败补偿，避免另一个上传请求收编文件后被旧补偿删除。接收网络输入和解析包在锁外进行；同步 SQLite 事务不等待文件或网络操作。这个边界适用于单 Node.js 进程／单容器副本独占一个 `MEOW_DATA_DIR`，不支持多个进程共享写入该目录。

### 重试、租约与清理结果

| 结果 | 含义与处理 |
| --- | --- |
| `restored:true, cleanupPending:false` | 领域数据与回执已提交，清理完成 |
| `restored:true, cleanupPending:true` | 领域数据与回执已提交；暂存清理失败。可重交同一原包重试清理，不能视为数据库回滚 |
| `RESTORE_CLEANUP_PENDING`（503） | 领域事务未提交，仍有本批暂存待回收。保留原包，修复存储问题后重交同一原包 |
| `TRANSFER_BUSY` / `TRANSFER_LEASE_LOST`（409） | 其他恢复持有租约，或当前操作者已失去租约；停止该次提交，稍后重试 |
| `RESTORE_REQUIRES_EMPTY`（409） | 目标已有业务数据，或暂存期间被其他写操作改变；没有覆盖已有工作区 |
| `RESTORE_FILE_EXISTS`（409） | 目标存在同 ID 文件；文件保留，需检查该独立目标的状态，不能直接删除未知文件 |
| `STORAGE_FULL`（507） | 磁盘空间不足且领域事务未提交；释放目标存储空间后重试 |
| `RESTORE_BATCH_CONFLICT` / `RESTORE_RECOVERY_REQUIRED` | 同备份 ID 内容不同，或 journal/目录异常；保留文件供检查，不自动清理未知内容 |

数据库租约默认有效期五分钟，在文件阶段及提交前续期并检查拥有者。失去租约的旧操作者不能继续提交。进程中断后，可等待旧租约过期，再上传同一完整包；程序校验旧 journal 的内容后回收本批文件并重新执行。若中断发生在 mkdir 或 journal 发布之前，只自动回收经过目录名与文件类型检查的空批目录，或仅含残缺 journal/临时 journal 的目录。若目录已有 `.bin`、其他未知条目或符号链接而缺少有效 journal，则返回明确的 `RESTORE_RECOVERY_REQUIRED`（503），保留全部文件供检查。这是同包重试时的恢复，不是后台任意目录清理任务。成功回执使用 backupId 与完整包摘要幂等：原包重复提交返回 `replayed:true`，不会重复落库；相同 backupId 更换内容被拒绝。即使业务数据后来变化，也可用成功原包重试其暂存清理，不重新覆盖业务数据。

测试覆盖注入 ENOSPC、journal 原子发布失败、所有领域写完后的提交前失败、会话中途撤销、并发恢复、上传重试与恢复补偿交错、输入中断、未知已存在文件、清理故障，以及 journal 发布前后构造的进程中断状态与重复包重试。无有效 journal 的既有附件和符号链接会保留。构造中断状态的测试不等于已经做过真实断电/硬件故障验收。

## 外部 Memos 导入范围

这是独立来源导入，不是旧 Meow 兼容或任意 Memos 版本支持。当前格式标识 `memos-memo-created_ts-v1`，只接受扩展名 `.db` / `.sqlite` / `.sqlite3` 的完整 SQLite 快照，最大 25 MiB。

| 表 / 字段 | 当前规则 |
| --- | --- |
| `memo.id` | 必需；非空字符串或安全整数，转换为来源 ID 字符串 |
| `memo.content` | 必需；非空，最多 200,000 字符 |
| `memo.created_ts` | 必需；非负整数 Unix 秒，转换为 ISO 时间 |
| `updated_ts` | 可选；缺失时沿用创建时间，不能早于创建时间 |
| `payload` | 可选 JSON 字符串；只提取其中 tags 数组；正文 `#tag` 也提取为标签，去重后每条最多 100 个、每个最多 80 字符 |
| `pinned` | 可选 0/1，保留置顶；来源没有独立排序字段时按读取顺序排列 |
| `visibility` | 可选 PUBLIC/PRIVATE/PROTECTED；只有 PUBLIC 公开，缺失或其余值私有 |
| `row_status` | 存在时只导入 NORMAL；其他行记入 `archivedExcluded`，不视为已导入 |
| `memo_resource` | 可选；存在时必须含 memo_id/resource_id，并存在 resource 表 |
| `resource` | id 必需；可选 filename/type/size 作为附件元数据，filename 只取路径末段作显示名，不访问来源路径 |

未知字段不导入，不推断其他版本的字段含义。源双链、评论、账号、设置、画布、回顾等不在该来源格式范围。正文仍保留其文本，不自动解析并重写来源双链协议。单快照最多 5,000 活跃笔记、5,000 资源、100,000 资源关系，每条最多 100 附件；预检报告范围与警告供用户确认。

### 快照一致性与只读预检

不要直接复制运行中依赖 WAL 的主数据库文件。请使用来源应用导出或 SQLite backup / `VACUUM INTO` 取得完整快照；输出文件还需符合当前非 WAL 主文件头要求。例如可在掌握来源位置与权限后，使用 SQLite CLI 为来源生成新的独立文件：

```sh
sqlite3 /path/to/source.sqlite "VACUUM INTO '/path/to/new-snapshot.sqlite';"
```

以上是操作示例，程序不会替用户运行命令。不要复用已经存在的目标路径。单独 `-wal`/`-shm` 文件、文件头仍为 WAL 模式的复制品、未知 schema、损坏数据库均拒绝。程序把上传内容放入私有临时目录，以 readonly/query_only/trusted_schema=OFF 打开，执行 quick_check 与声明字段校验；不会迁移或改写原文件字节。临时 SQLite 文件在预检后清理。

预检结果缓存于 `uploads/.imports/<previewId>.json`，有效期一小时，最多 20 个有效预检；单缓存上限 32 MiB。创建预检时只清理能识别且已过期的缓存，不删除未知文件。过期后重新上传快照。

### 附件、身份与批次

来源路径、远端链接或 SQLite BLOB 不会自动当作实际附件导入。预检列出每个被引用资源的文件名、MIME 与来源笔记 ID。用户可提供对应文件，先上传到本实例 media，再以 sourceResourceId→mediaId 映射导入；服务端核对 ready 状态、声明 MIME/大小和引用类型。未提供资源时必须明确接受缺失附件，导入结果返回缺失清单；不会伪造成功附件。资源元数据自身缺失属于不一致输入，直接拒绝。

完整源文件 SHA-256 决定来源 UUID，来源 UUID 与 memo 来源 ID 决定稳定的新笔记 UUID。相同字节的快照作为同一 source batch，只导入一次；新 operationId 重交也返回先前批次结果。相同 operationId 更换输入映射/缺失确认会冲突。**SQLite 文件任意字节变化都属于新的来源批次**，即使逻辑笔记 ID 相同也可能产生新的映射；这不是跨快照增量同步或“自动更新已有 Memos 笔记”。

导入可以追加到已有新工作区；所有新 memo、关系、媒体引用与批次回执在一个事务内提交，保留来源创建/修改时间，初始化新 memo revision=1。ID/tombstone 冲突或资源不一致时全批回滚。附件预上传不在该数据库事务内；失败后未引用的已上传媒体仍可在媒体暂存/清理流程中处理，不能声称网络上传随导入事务回滚。

## API 与访问边界

| 用例 | 方法 / 路径 | 输入 / 响应 |
| --- | --- | --- |
| GetTransferStatus | GET `/api/transfer/status` | 空业务状态与两个包限额 |
| ExportBackup | GET `/api/transfer/backup` | octet-stream 完整包，带下载文件名 |
| RestoreBackup | POST `/api/transfer/restore` | octet-stream 原包；restored/backupId/counts/replayed/cleanupPending |
| PreviewMemosImport | POST `/api/transfer/memos/preview?fileName=…` | octet-stream SQLite；数量、范围、缺失附件、source/preview 标识 |
| ImportMemos | POST `/api/transfer/memos/import` | JSON previewId/operationId/allowMissingAssets/assets；导入数量、缺失报告、是否重放 |

所有写入继承统一 CSRF 策略：`X-Meow-Request: 1`、同源 Origin 检查、owner HttpOnly 会话。异步读取/暂存后提交前重新验证 active session；注销/到期不能借用较早验证结果继续发布。普通错误使用 requestId 关联，不将 SQL、堆栈、源路径或凭据返回客户端。local-only 页面允许阅读本机缓存，禁用这些网络操作；恢复成功后重新加载所有领域状态。
