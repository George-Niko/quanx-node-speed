# Quantumult X 节点网速测速

这是一个 Quantumult X `event-interaction` 脚本插件，用于测试当前选中节点的：

- 延迟
- 下载速度
- 上传速度
- 当前节点出口 IP
- IPPure 风险分数对应的 IP 纯净度分档
- IP 原生性判断
- 标记：家庭住宅 IP、机房/代理 IP
- 运营商类型：ISP、Mobile ISP、Hosting/IDC
- 家宽 ISP 判断
- 多来源 ISP/ASN 名称对比，用于提示疑似双 ISP

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

每次运行大约会消耗：下载 `5 MB × 2`、上传 `2 MB × 2`，另外有一次很小的延迟请求。请避免频繁连续执行。

## 结果说明

测速请求通过 Quantumult X 的 `opts.policy` 指定当前节点，因此结果反映的是“本地网络 → 当前节点 → Cloudflare 边缘”的综合表现，不等同于服务器网卡的理论峰值。不同时间、地区、移动网络和测速边缘节点都会造成结果变化。

IP 信息请求也会通过当前节点发送，结果中会按“IP 原生性 → 标记 → 运营商类型 → 家宽 ISP → 双 ISP → ISP 名称”的顺序展示出口信息。脚本会优先读取 `ipapi.is` 的 `is_datacenter`、`is_mobile`、`is_vpn`、`is_proxy`、`is_tor`、`company.type`、`company.name` 和 ASN 字段，再与 IPPure 的 ISP/组织名称交叉比较。家宽 ISP 与双 ISP 都是基于公开数据库字段的判断：数据库缺失、命名不一致或存在分流时会显示“未知/疑似”，不能替代人工核验或付费 IP 数据库。

下载/上传接口依据 Cloudflare Speedtest 开源项目的配置说明：

- https://github.com/cloudflare/speedtest#config-options
- https://speed.cloudflare.com/

本脚本没有使用 Cloudflare 的授权令牌，也不会上传订阅、节点配置或账号信息；测速请求本身仍会让测速服务看到请求出口 IP，这是网络测速的正常行为。
