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

- **probe**：显示每个组成员的首字节时间、传输比值及合格状态，点击结果查看传输时间、检测时间或失败原因。`prefer_order` 跳过的成员显示“未检测”。
- **重新筛选**：触发 node-probe service 的共享完整筛选，不是 urltest；当前节点仍合格就不切换。筛选开始与结束由核心推送，离线、暂停或失败会显示错误。
- **订阅提供商**：使用我们核心的 `daemon.ProviderService`，显示节点、流量、到期时间与更新时间，支持刷新和健康检查。完整订阅链接默认隐藏，可主动查看或复制。

probe 结果与订阅链接需要支持相应 API 字段的 cagedbird 核心。旧核心不支持时不会把普通延迟伪装成 probe 结果；上游核心没有 ProviderService 时不显示订阅页。订阅链接可能含凭据，请保护 API secret，并避免在截图中展示链接。

构建：`pnpm install --frozen-lockfile && pnpm build`。将 `dist/` 作为静态站点部署；本地存放全部资源，不依赖第三方在线面板。

### 补丁栈维护

- 工作分支：`singbox`；当前基线：原作者 `v3.30.0`（`bf4f00bb8d905f8a78f627af7cf84457c4db53c4`）。`upstream` 指向 `Zephyruso/zashboard`，`rainac1` 仅保留作来源参考，`origin` 指向本 fork。
- 基线之上只保留按主题组织的线性提交，不合入中间 fork 的 merge 历史。平时在栈顶提交；跟进新版本时再将同主题迭代整理到对应提交。
- 后端通信和数据适配放在 `src/api/singbox/`、`src/assembly/singbox/`；专属界面放在独立组件，翻译放在 `src/i18n/singbox/`。共享组件只保留必要接入点，不复制整套上游组件。
- 跟进前记录旧基线与工作分支 SHA，在候选分支执行 `git rebase --onto <新基线> <旧基线>`。逐项检查补丁，并用 `git range-diff <旧基线>..<旧SHA> <新基线>..<候选SHA>` 核对；已被上游实现的补丁直接删除。
- 每个主题提交必须能单独通过类型检查和生产构建；最终用真实核心验收 probe、订阅刷新、日志、连接及移动布局。验收后再晋升工作分支，推送使用 `git push --force-with-lease=refs/heads/singbox:<记录的旧SHA> origin singbox:refs/heads/singbox`，不移动已发布 tag。
- 仓库历史整理和公网部署分开执行。静态构建验收通过后才部署，保留上一版 release 目录以便回滚；不自动变基、自动部署或修改客户端核心。

### CI

推送到 `singbox`、`cagedbird/candidate-*`，或提交面向 `singbox` 的 PR 时运行 **Cagedbird CI**，也可手动运行。使用 Node.js 24 和 `packageManager` 锁定的 pnpm，冻结安装依赖，执行类型检查、只读 ESLint、生产构建，以及真实 headless Chrome 的代理行为、自动连接与折叠生命周期验收。浏览器固定为英语，避免系统语言影响测试选择器。

CI 构建全部七种字体变体，产物保存在 Actions artifacts 14 天，不创建 Release、不部署公网面板。`cagedbird-release.yml` 仅允许显式手动触发发布；原作者工作流保持不变。



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
