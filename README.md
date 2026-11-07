# zashboard

<p align="center">
  <img src="./readme/pc.png" height="300">
  <img src="./readme/mobile.png" height="300">
</p>

## **Requirement**

Browser support

- Chrome 111 (released March 2023)
- Firefox 128 (released July 2024)
- Safari 16.4 (released March 2023)
- Not supported on iOS 16.4 jailbroken version.

## cagedbird 分支

本仓库直接跟随 [Zephyruso/zashboard](https://github.com/Zephyruso/zashboard)，以原作者版本基线加中文主题补丁栈维护 sing-box 支持。原生适配继承自 [rainac1/zashboard](https://github.com/rainac1/zashboard)，由本分支继续维护；原生 API 协议以 [cagedbird043/sing-box](https://github.com/cagedbird043/sing-box) 为准。

在线面板：**https://board.cagedbird.cn/**。bj-edge 使用 Caddy 托管 `/srv/zashboard/current`，实际文件位于 `/srv/zashboard/releases/<提交>/`。入口与 Service Worker 每次回源校验，带哈希的静态资源缓存一年。

首次从公网站点连接本机 API 时，浏览器可能要求“本地网络访问”权限，请按浏览器提示授权本站。该权限不改变核心的监听地址或认证方式。

### sing-box 原生模式

连接时选择 **sing-box**，填写核心的 API 地址与 secret。常驻状态订阅使用 WebSocket，一元操作使用 gRPC-Web。页面仅为静态资源，直接由浏览器连接目标核心，托管服务器不保存 API secret 或订阅链接。

- **probe**：显示每个组成员的判定（合格、淘汰、冷却中、不参选、未检测），合格成员附主测量的总耗时中位数和吞吐；点击查看失败的 qualify 子句、得分、各测量统计和真实连接失败率。分组按钮的提示列出策略名和生效的表达式。
- **重新筛选**：触发该组所用策略的一次筛选，不是 urltest；合格判定、排名和切换由核心配置中的策略表达式决定。筛选开始与结束由核心推送，离线、暂停或失败会显示错误。
- **订阅提供商**：使用我们核心的 `daemon.ProviderService`，显示节点、流量、到期时间与更新时间，支持刷新和健康检查。完整订阅链接默认隐藏，可主动查看或复制。

probe 结果与订阅链接需要支持相应 API 字段的 cagedbird 核心。旧核心不支持时不会把普通延迟伪装成 probe 结果；上游核心没有 ProviderService 时不显示订阅页。订阅链接可能含凭据，请保护 API secret，并避免在截图中展示链接。

构建：`pnpm install --frozen-lockfile && pnpm build`。将 `dist/` 作为静态站点部署；本地存放全部资源，不依赖第三方在线面板。

### 补丁栈维护

- 工作分支：`singbox`；当前上游 tag 与精确 SHA 记录在 [`scripts/ci/upstream-base.json`](scripts/ci/upstream-base.json)。`upstream` 指向 `Zephyruso/zashboard`，`rainac1` 仅保留作来源参考，`origin` 指向本 fork。
- 基线之上只保留按主题组织的线性提交，不合入中间 fork 的 merge 历史。平时在栈顶提交；跟进新版本时再将同主题迭代整理到对应提交。
- 后端通信和数据适配放在 `src/api/singbox/`、`src/assembly/singbox/`；专属界面放在独立组件，翻译放在 `src/i18n/singbox/`。共享组件只保留必要接入点，不复制整套上游组件。
- 跟进前记录旧基线与工作分支 SHA，在候选分支执行 `git rebase --onto <新基线> <旧基线>`。逐项检查补丁，并用 `git range-diff <旧基线>..<旧SHA> <新基线>..<候选SHA>` 核对；已被上游实现的补丁直接删除。
- 每个主题提交必须能单独通过类型检查和生产构建；最终用真实核心验收 probe、订阅刷新、日志、连接及移动布局。验收后再晋升工作分支，推送使用 `git push --force-with-lease=refs/heads/singbox:<记录的旧SHA> origin singbox:refs/heads/singbox`，不移动已发布 tag。
- GitHub Actions 自动跟进原作者正式 tag，并在完整验收后晋升、部署；不跟进 `main` 中间提交，不自动修改客户端核心。人工修改共享文件仍须遵守下面的发布门槛。

### CI

推送到 `singbox`、`cagedbird/candidate-*`，或提交面向 `singbox` 的 PR 时运行 **Cagedbird CI**，也可手动运行。自动上游候选由同步工作流直接调用同一套 CI，避免重复触发。使用 Node.js 24 和 `packageManager` 锁定的 pnpm，冻结安装依赖，执行类型检查、只读 ESLint、生产构建，以及真实 headless Chrome 的代理行为、自动连接与折叠生命周期验收。浏览器固定为英语，保留浏览器沙箱。

原生验收使用 [`scripts/ci/sing-box-release.json`](scripts/ci/sing-box-release.json) 固定的 cagedbird 核心及 SHA256，隔离启动本地核心与 HTTP 订阅，不访问真实客户端。覆盖 probe 筛选生命周期、合格/淘汰/不参选结果按组隔离、合格节点保留，以及订阅链接遮蔽、复制和刷新后的节点与用量变化。

CI 构建全部七种字体变体，完整性清单和提交 SHA 随产物保存在 Actions artifacts 14 天。`singbox` 通过全部检查后自动部署其中的 all-fonts 产物；候选、PR 不部署。`cagedbird-release.yml` 仍仅允许显式手动触发 GitHub Release；原作者工作流保持不变。

### 自动跟进与部署

- **Cagedbird Upstream Sync** 每天 UTC 03:17、15:17 检查原作者严格的 `v主版本.次版本.补丁版本` tag，也可手动运行。只接受比已记录基线更新、且继承该基线的正式版本；预发布、移动过的基线 tag、非线性补丁栈或未知历史漂移均停止。
- 变基在隔离工作树进行，不自动解决代码冲突，也不自动丢弃代码补丁。仅移除旧的纯基线元数据提交，再写入本轮基线；冲突不修改 `singbox`。候选推送、完整 CI、旧 SHA 租约晋升依次执行，任一步失败都不继续上线；从 Actions 失败通知查看原因。
- 晋升后直接部署候选 CI 验收的同一份产物，不在服务器重新构建。我们自己的 `singbox` push 也使用相同部署流程。同步用仓库写入密钥，部署用另一把专用密钥，两者隔离。
- bj-edge 的 `board-deploy` 无 sudo 权限；SSH 公钥只能执行限定的产物获取、状态查询和版本切换协议。部署固定主机公钥，不使用 `StrictHostKeyChecking=no`。生产环境只允许 `singbox` 分支。
- CI 验证指定运行的唯一 `zashboard-all` 产物，并通过 SSH stdin 传递短期签名 URL、长度和 SHA256；服务器不持有 GitHub token。服务器仅从固定 GitHub 产物存储域名拉取已构建 ZIP，分段与整包校验后安全解包到 `/srv/zashboard/incoming/<完整SHA>/`，校验清单、拒绝额外文件和软链，确认远端 `singbox` 仍指向该 SHA 后，转存 `releases/<SHA>` 并原子切换 `current`。
- 切换后通过带真实域名与 TLS 校验的本机 HTTPS 请求核对版本、入口和资源；失败自动恢复旧链接。切换和检查由服务器单次命令在锁内完成，CI 断线也不依赖后续 SSH 才能回滚。保留当前、前一版及最近版本，未知命名的历史目录不自动删除。
- 仓库变量：`BOARD_DEPLOY_HOST`、`BOARD_DEPLOY_PORT`；Secrets：`UPSTREAM_SYNC_SSH_KEY`、`BOARD_DEPLOY_SSH_KEY`、`BOARD_DEPLOY_KNOWN_HOSTS`。凭据不进入构建、PR 和原生验收步骤。线上 [`/release.json`](https://board.cagedbird.cn/release.json) 可查询部署提交。

本地原生验收：先构建，再运行 `SING_BOX_BINARY=/path/to/sing-box node test/singbox.mjs`；未指定二进制时使用固定发布包。同步算法与部署回滚检查分别为 `python3 scripts/ci/test-upstream-sync.py`、`python3 scripts/deploy/test_deploy.py`。



## **Download**

You can download the zashboard files here:

- [Releases](https://github.com/cagedbird043/zashboard/releases)

> All builds include sing-box native API support.

## Tips

1. The connection table can be dragged with the left mouse button, and right-clicking can copy cell content.
2. Right-clicking on a node / node group card will perform a speedtest for the node / node group.
3. The proxy group sorting is based on the node order in the GLOBAL group. In Mihomo, it follows the configuration file order, while in sing-box, route.final is placed first, with the rest following the configuration file order. If you need custom ordering, you can specify the order by overriding the GLOBAL group.
4. The dashboard supports PWA (Progressive Web App), which can provide a native app-like experience on mobile devices through "Add to Home Screen".
5. The dashboard's upgrade button and auto-upgrade functionality require proper configuration of the core's UI download path ([mihomo](https://wiki.metacubex.one/config/general/#_9) | [sing-box](https://sing-box.sagernet.org/configuration/experimental/clash-api/#external_ui_download_url)), otherwise clicking update may result in updating to the core's default panel.

## 提示

1. 连接表格可被鼠标左键拖动，右键可复制单元格内容。
2. 右键点击节点/节点组卡片可对节点/节点组进行测速。
3. 面板的节点组排序是根据GLOBAL组中的节点顺序排序的，在Mihomo中会是按配置文件的顺序，在sing-box中会把route.final放到第一位，其余按照配置文件顺序，如果你需要自定义顺序，可通过覆盖GLOBAL组指定顺序
4. 面板支持PWA（Progressive Web App），可以在移动设备上通过"添加到主屏幕"获得类原生app的体验
5. 面板的更新按钮和自动更新功能需要正确的配置核心的ui下载路径 ([mihomo](https://wiki.metacubex.one/config/general/#_9) | [sing-box](https://sing-box.sagernet.org/configuration/experimental/clash-api/#external_ui_download_url)), 否则可能会在点击更新后更新为核心默认面板

## URL params format

#### basic example

http://host:port/#/setup?hostname=ipordomain&port=9090&secret=123456

1. **`protocol`**
   - Determines the protocol, `http` or `https`.
   - Default: current page protocol
   - The legacy `http` / `https` flag params (e.g. `?http=1`) are still supported for backward compatibility, but `protocol` takes precedence when both are present.

2. **`hostname`**
   - The Clash API's IP or domain.

3. **`port`**
   - The Clash API port.

4. **`secondaryPath`**
   - Optional path appended to the base URL.
   - Default: An empty string.

5. **`secret`**
   - Password for authentication.

6. **`disableUpgradeCore`**
   - Set '1' to hide upgrade core button

7. **`disableTunMode`**
   - Set '1' to hide tun switch

8. **`type`**
   - Selects the backend API: `clash` (Clash REST/WS), `dae` (dae native API) or `singbox` (sing-box native).
   - Default: `clash`

#### Automatic backend connection

When no backends have been saved and `hostname` is not specified in the URL query, zashboard tries to connect to the Clash API at the page's origin (the same protocol, hostname, and port). This applies to pages served over HTTP or HTTPS. The `protocol` and `port` URL parameters do not change this address. URL parameters such as `secret`, `label`, `type`, `disableUpgradeCore`, and `disableTunMode` also apply to the detected backend.

For example, with this mihomo configuration on remote server `192.168.1.1`:

```yaml
external-ui: ui
external-ui-url: https://github.com/Zephyruso/zashboard/archive/refs/heads/gh-pages.zip
external-controller: 0.0.0.0:9090
secret: ''
```

Opening `http://192.168.1.1:9090/ui` automatically connects to `http://192.168.1.1:9090` and saves the backend if the API probe succeeds. If mihomo requires authentication, pass its secret using `http://192.168.1.1:9090/ui?secret=your-secret`.

`http://127.0.0.1:9090` with an empty secret is probed at the same time as a fallback, and the same-origin backend takes priority. If a candidate rejects the secret, the form keeps that address so you only need to enter the secret. If no candidate responds, the form shows `http://127.0.0.1:9090` for manual configuration. Editing or submitting the form during detection cancels automatic connection.

Saved backends and explicit URL backend parameters retain their existing behavior. Automatic same-origin detection does not override them.

### I code not only for fun, but even more for money. If you really want to donate, send USDC on Polygon to `0xf51f0c7142e5771cf8fc7c3c498b0819b4239c21` to help the author buy a McDonald's 😊
