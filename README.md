# dsh-plugin-update-hub

给 DeepSeek Harness 的插件页补上**版本落后提示**与**按版本升级**。

从插件市场装的插件落后了,原来的插件页不会提示,只能卸载重装。这个插件在侧边栏的**插件**页加一个「插件更新」tab:一次列出所有已装插件的当前版本、安装时间和可升级版本,并支持按版本批量排队升级。

## 安装

- 插件市场 → **插件** → **发现** → 搜索 `插件更新` / `dsh-plugin-update-hub` → 安装。
- 装好后在**插件**页的 tab 行(已安装 / 发现 右边)出现 **插件更新**。

## 界面

- 每行显示:插件名、包名、简介、当前版本、安装时间、状态(已是最新 / 落后 N 个版本 / 内置 / Git 安装 / 已禁用)、最新版本
- 落后时出现版本下拉(已发布但比当前新的版本,最新在前)+「更新」按钮
- 插件名 / 包名 / 简介模糊搜索(多关键词与匹配)
- 分页:每页 10 / 20 / 50,默认 20,选择记在 localStorage
- 「显示内置」开关,默认关闭(内置 bundle 随 DSH 发行,不能单独升级)
- 「检查更新」手动按钮:一次检查当前结果集里所有可检查的插件,几个并发跑,其余显示「等待检查…」;打开 DSH 时自动检查一次(6 小时内不重复)
- 并发数按机器规模起算(2/3/4),并随 registry 响应时间自适应:慢了就减,快了再加回上限,避免一口气打满网络
- 更新支持**批量**:「批量更新 (N)」把当前筛选结果里所有可升级插件按所选版本排进队列;单个「更新」也是入队
- 队列串行执行(安装共用 profile 的 store,不能并行),顶部「更新队列」**默认折叠**,折叠时只显示一行汇总(如 `更新队列 · 1 个更新中 · 2 个排队中`)加当前进度百分比与细进度条,点这行展开看每个任务的 `等待更新… / 正在校验 / 移除 / 安装 / 已完成 / 失败` 与已用时间
- 队列只存在内存里:DSH 意外关闭或中断后,排队任务直接消失,不会在下次启动时被恢复;也可手动「清空队列」/「清空已完成」
- 进度按 Host 广播的 `plugin-manager/update-state` 步进(校验 / 移除 / 安装 / 回滚),失败会显示原因

## 实现

- `index.js`(Host 半边,`export const inject = ['webServer']`):注册 `/dsh-plugin-update-hub-api`,按包名返回 profile `node_modules` 的安装时间(mtime 取 pnpm symlink 自身)与 `package.json` 的简介/版本。profile 目录依次从 `DSH_PROFILE_DIR`、`DSH_HOME/profiles/$DSH_PROFILE`、宿主进程 argv、模块路径上溯、`~/.dsh/profiles/*` 里找(以 `node_modules` + `cordis.patch.yml` 判定,排除只读的 app.asar 安装目录)。
- `client.js`(Client 半边):注册 `plugins.tab`(插件页 tab 行)的 `{id:'updates', order:10, label:'插件更新'}`;数据走 `ctx.get('remote.pluginManager')` 的 `listBundles` / `listVersions` / `updateBundle` / `cancelInstall`,事件走 `ctx.get('remote').$on('plugin-manager/update-state' | 'plugin-manager/changed')`。Remote 调用返回 `{ok, value|error}` 信封,统一由 `unwrap()` 转成值或抛出。
- 只依赖 `react` 与 `--dsw-alias-*` 主题 token,不引入 Harness 客户端包,不写 JSX。

## 注意

- 更新由 Host 的 plugin manager 执行:registry 包会先校验「存在该版本 + 声明了 bundle + 接受当前 DSH 版本」,失败自动回滚重装旧版;有的更新要重启 DSH 才生效,界面会提示。
- Git 安装的插件不走版本升级(与 plugin manager 一致),行内会标注。
- 只对能从 registry 查到新版本的包生效;内置 bundle(official)不参与。

## License

MIT
