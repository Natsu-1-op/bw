# 雅思阅读复习

GitHub Pages 子页面：`/bw/ielts-reading/`。根目录播放器只增加入口链接，原播放逻辑不变。

现有35个表达的原句认义、原句填空、中文回忆英文、拓展语境及三维熟练度逻辑沿用本地版。登录和同步码均不需要；页面自动使用 `class-optic` 项目的 Realtime Database `ieltsReading/v2`。这是用户指定的单人共享进度模式。

- 本机：原 localStorage key `ielts.reading.recall.v1`，支持旧版导入导出。
- 云端：`progress` / `legacyProgress` 使用安全编码后的词条键；每个词每个维度独立合并，取较新的回答记录，保留不同设备的不同词条。
- 同时在两台设备回答同一个词同一维度时，以时间较新的那次记录为准；不是合并两次练习。
- 离线先保存本机，恢复连接后同步。状态栏显示真实同步状态。
- 本地文件和GitHub Pages属于不同来源。旧文件版的进度应先导出JSON，在网页导入一次。
- 每维保留最近30次明细和累计次数，评分规则不因云同步改变。

## 资料和生成

`data/words.json` 是发布用词库，包含原句、译文和教师自拟拓展例句，不包含本机附件路径。改词库后：

```sh
python3 tools/build.py
```

从学习记忆导入新增词：

```sh
python3 tools/sync_from_memory.py "/path/to/reading memory"
```

`review.template.html` 控制页面和原有学习逻辑，`cloud-sync.js` 只负责同步，`sync-core.js` 负责数据规范化和逐词合并。

## Firebase

复用 tutoring-booking 的 `class-optic` 项目。Web配置可公开，未使用服务端凭据。

`firebase/ielts-reading.rules.json` **只是新增节点片段，不是完整数据库规则**。在Firebase控制台将其 `ieltsReading` 字段加入现有 `rules`，保留全部原有节点（包括其他项目新增的节点）。不要用这个文件覆盖整套规则，也不要直接部署 tutoring-booking 尚未提交的本地规则。

本次按用户要求，`ieltsReading/v2` 允许免登录读写，其余节点的权限保持原状。不存预约、财务等业务数据。

## 检查

```sh
node tests/review.test.cjs
node tests/sync.test.cjs
```
