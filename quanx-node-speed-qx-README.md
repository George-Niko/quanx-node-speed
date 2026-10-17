# Quantumult X 节点网速测速

这是一个 Quantumult X `event-interaction` 脚本插件，用于测试当前选中节点的：

- 延迟
- 下载速度
- 上传速度
- 当前节点出口 IP
- IPPure 风险分数对应的 IP 纯净度分档
- IP 原生性判断（优先读取 IPPure `isResidential`）
- 标记：家庭住宅 IP、机房/代理 IP
- 运营商类型：ISP、Mobile ISP、Hosting/IDC
- 家宽 ISP 判断
- 用颜色圆球区分住宅、移动、机房/代理和未知状态

## 安装

1. 将 `quanx-node-speed-qx.js` 上传到 Quantumult X 的脚本资源位置，或改成你的远程脚本 URL。
2. 把 `quanx-node-speed-qx.snippet` 里的 `[task_local]` 内容加入配置文件。
3. 在 Quantumult X 的节点/策略页面，选择一个节点后执行「节点网速测速」。

也可以直接加入这一行：

```ini
event-interaction quanx-node-speed-qx.js, tag=节点网速测速, img-url=bolt.fill.system, timeout=120, enabled=true
```

如果脚本放在远程地址，把 `quanx-node-speed-qx.js` 换成完整的 `https://...` 地址即可。

## 参数调整

打开脚本顶部的 `CONFIG`：

- `downloadBytes`：默认 5 MB；网络很快时可改为 `10 * 1000 * 1000`。
- `uploadBytes`：默认 2 MB；上传速度较快时可改为 `5 * 1000 * 1000`。
- `samples`：默认每个方向测试 2 次，最终取中位数。
- `uploadSamples`：上传默认测试 1 次，避免 Quantumult X 连续 POST 大请求出现无效内容。
- `sampleRetries`：任意测速样本失败时的额外重试次数，默认 1 次；重试会重新生成请求和随机参数。

每次运行大约会消耗：下载 `5 MB × 2`、上传 `2 MB × 2`，另外有一次很小的延迟请求。请避免频繁连续执行。

## 结果说明

测速请求通过 Quantumult X 的 `opts.policy` 指定当前节点，因此结果反映的是“本地网络 → 当前节点 → Cloudflare 边缘”的综合表现，不等同于服务器网卡的理论峰值。不同时间、地区、移动网络和测速边缘节点都会造成结果变化。

IP 信息请求也会通过当前节点发送，结果中会按“IP 原生性 → 标记 → 运营商类型 → 家宽 ISP → ISP 名称”的顺序展示出口信息。脚本优先读取 IPPure 的 `isResidential`、`isBroadcast`、`isp`、国家字段，再读取 `ipapi.is` 的 `is_datacenter`、`is_mobile`、`is_vpn`、`is_proxy`、`is_tor`、`company.type`、`company.name` 和 ASN 字段，最后进行交叉比较。家宽 ISP 判断基于公开数据库字段：数据库缺失、命名不一致或存在分流时会显示“未知”，不能替代人工核验或付费 IP 数据库。

状态颜色说明：🟢 原生/家庭住宅 ISP；🔵 移动 ISP；🔴 机房、代理、VPN 或非住宅网络；🟠 数据不足或无法确认。

上传测速使用 Cloudflare 官方格式的 `__up?bytes=<n>` 请求，并为每次请求重新生成零内容请求体；不手动设置 `Content-Length`，以减少 Quantumult X 第二次 `$task.fetch` 出现“无效内容”的概率。如果上传接口仍被当前网络或 Quantumult X 拒绝，脚本会保留 IP、延迟和下载结果，并将上传显示为“未完成”，不会整次失败。下载/上传接口依据 Cloudflare Speedtest 开源项目的配置说明：

- https://github.com/cloudflare/speedtest#config-options
- https://speed.cloudflare.com/

本脚本没有使用 Cloudflare 的授权令牌，也不会上传订阅、节点配置或账号信息；测速请求本身仍会让测速服务看到请求出口 IP，这是网络测速的正常行为。
