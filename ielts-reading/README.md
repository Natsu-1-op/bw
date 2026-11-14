# 雅思阅读复习

GitHub Pages 子页面：`/bw/ielts-reading/`。根目录播放器只增加入口链接，原播放逻辑不变。

原句认义、原句填空、中文回忆英文和拓展语境继续使用三个独立熟练度维度。登录和同步码均不需要；页面自动使用 `class-optic` 项目的 Realtime Database `ieltsReading/v2`。这是用户指定的单人共享进度模式。

- 本机：原 localStorage key `ielts.reading.recall.v1`，支持旧版导入导出。
- 云端：`progress` / `legacyProgress` 使用安全编码后的词条键；每个词每个维度独立合并，取较新的回答记录，保留不同设备的不同词条。
- 同时在两台设备回答同一个词同一维度时，以时间较新的那次记录为准；不是合并两次练习。
- 离线先保存本机，恢复连接后同步。状态栏显示真实同步状态。
- 本地文件和GitHub Pages属于不同来源。旧文件版的进度应先导出JSON，在网页导入一次。
- 每维保留最近30次明细和累计次数；每次评分只事务更新涉及的词条和更新时间，不重写全部记录。
- 每日目标默认为30个不同表达，可在今日进度旁调整（1–200）；按北京时间分日，系统共享当日词单与目标。
- 到期的新词、遗忘词和正常词按权重挑选，确保遗忘词和普通到期词都有机会；组内打乱。显示的“今日已复习词”按表达去重，重复练习不增加计数。
- 不记得后至少间隔3分钟独立回忆，连续记得3次后还须等到北京时间次日零点并通过回忆，才恢复初步记住。中途再忘记从头计数；早于到期时间额外练习不升级。之后间隔1、3、7、14、30天。三分钟和零点刷新是用户指定的规则，间隔并非个体记忆的精确预测。
- 旧记录保留；最近一次旧评分为遗忘或模糊的词谨慎进入0/3待巩固，不推测以前的巩固次数。请在各设备刷新到新版，旧版长期打开可能按旧格式覆盖新排期字段。
- 词单和进度离线仅缓存在本机，重新联网后同步；同时离线在两设备练同一词同一维度时，按最后记录合并，无法保证保留每次操作。

## 词库管理

词条保存在 Firebase Realtime Database 的 `ieltsReading/catalog/entries`；进度继续使用 `ieltsReading/v2`。页面首次迁移保留内置词库作离线后备，成功读取云端后缓存在当前浏览器，刷新复习页获取更新。词条 ID 保持稳定以保留熟练度。

- 网页 `manage.html`：选择已有词条编辑，或填写新词条后保存；同一 ID 的熟练度保留。
- Agent 批量更新：先按记忆流程补齐原句和语境，然后运行：

```sh
python3 tools/sync_from_memory.py "/path/to/reading memory" --publish
```

这个命令只向数据库添加云端不存在的词条，不重建页面，不覆盖管理页面已修改的词条。单个词条需要有意覆盖时用 `python3 tools/catalog.py upsert word.json`；`python3 tools/catalog.py list` 可导出云端词库。ID 一经使用，修改表达时保持 ID 不变。

未加参数的 `sync_from_memory.py` 仅用于更新仓库的离线初始快照并重建页面。首次迁移后，不必为生词提交或部署网页。

## 音标

- 页面从 GitHub Pages 加载约 4 KB 的 `phonetics.js` 静态词表，再按词条查找英式音标。复习和查词无需为音标请求 Firebase 或外部词典。
- 原句认义和拓展练习可在题面看音标；原句填空和中文回忆英文在揭晓后才显示。词汇库和组次回顾也能查看。
- 管理页的「自定义英式音标」可覆盖词表中的默认读法。留空即可自动查词表，只有手动填写的值会随词条保存到 Firebase。清空已有覆盖并保存后恢复默认读法。
- 篇末批量收录新词时，按原文词性核对英式音标后，把小写词条和读法追加到 `phonetics.js`，一并提交推送。新增音标只需改静态词表，页面无需重建；音标未确认时可暂缺。音标对应词条形式，短语提供一种英式读法。可查阅 [Cambridge Dictionary 英式音标说明](https://dictionary.cambridge.org/help/phonetics.html)。

## Firebase

复用 tutoring-booking 的 `class-optic` 项目。Web配置可公开，未使用服务端凭据。

`firebase/ielts-reading.rules.json` **只是新增节点片段，不是完整数据库规则**。在Firebase控制台将其 `ieltsReading` 字段加入现有 `rules`，保留全部原有节点（包括其他项目新增的节点）。不要用这个文件覆盖整套规则，也不要直接部署 tutoring-booking 尚未提交的本地规则。

按用户要求，`ieltsReading/v2` 和 `ieltsReading/catalog` 允许免登录读写；词库任何知道数据库地址的人均可读写，其余节点的权限保持原状。不存预约、财务等业务数据。

## 检查

```sh
node tests/study-core.test.cjs
node tests/daily-plan.test.cjs
node tests/review.test.cjs
node tests/sync.test.cjs
```

## 手机显示

沿用主站的蓝白配色、系统字体、7–10px圆角和按钮风格。手机端默认收起筛选与说明，开始后底部固定揭晓/提示/跳过或评级按钮。揭晓后聚焦答案与原句回顾，避免上下重复展示同一句。改样式编辑 `style.css`，改结构编辑 `review.template.html` 后重建。
