/**
 * Quantumult X 节点网速测速
 *
 * 用法：在 Quantumult X 的节点/策略页面执行 event-interaction 脚本。
 * Quantumult X 会把当前选中的节点名放进 $environment.params，脚本再用
 * opts.policy 强制测速请求走该节点。
 *
 * [task_local]
 * event-interaction quanx-node-speed-qx.js, tag=节点网速测速, img-url=bolt.fill.system, timeout=120, enabled=true
 *
 * 测速接口：
 * - https://speed.cloudflare.com/__down?bytes=<n>
 * - https://speed.cloudflare.com/__up
 *
 * 这两个接口来自 Cloudflare Speedtest 开源项目：
 * https://github.com/cloudflare/speedtest#config-options
 */

const SCRIPT_NAME = "节点网速测速";
const SCRIPT_VERSION = "2026-10-17.r3";
const IPPURE_URL = "https://my.ippure.com/v1/info";
const IPAPI_URL = "https://api.ipapi.is/";

const CONFIG = Object.freeze({
    downloadUrl: "https://speed.cloudflare.com/__down",
    uploadUrl: "https://speed.cloudflare.com/__up",
    latencyBytes: 0,
    downloadBytes: 5 * 1000 * 1000,
    uploadBytes: 2 * 1000 * 1000,
    samples: 2,
    userAgent: "QuantumultX-NodeSpeed/1.0",
});

const nodeName = readNodeName();

if (!nodeName) {
    finishError("没有获取到节点名。请在节点/策略页面执行「节点网速测速」。");
} else {
    run().catch((error) => finishError(errorMessage(error)));
}

async function run() {
    console.log(`[INFO] ${SCRIPT_NAME} ${SCRIPT_VERSION}`);
    console.log(`[INFO] 节点: ${nodeName}`);

    const startedAt = Date.now();
    const profileTask = discoverIPProfile();
    const latency = await measureLatency();
    const download = await measureDirection("download");
    const upload = await measureDirection("upload");
    const profile = await profileTask;
    const elapsedSeconds = (Date.now() - startedAt) / 1000;

    finish({
        title: `⚡️ ${SCRIPT_NAME} · ${nodeName}`,
        message: [
            `🌐 IP：${profile.ip}`,
            `🧼 IP 纯净度：${profile.purity.label}${profile.purity.detail ? `（${profile.purity.detail}）` : ""}`,
            `🗺️ IP 原生性：${profile.isp.native.label}${profile.isp.native.detail ? `（${profile.isp.native.detail}）` : ""}`,
            `🏷️ 标记：${profile.isp.marker.label}${profile.isp.marker.detail ? `（${profile.isp.marker.detail}）` : ""}`,
            `📡 运营商类型：${profile.isp.type.label}${profile.isp.type.detail ? `（${profile.isp.type.detail}）` : ""}`,
            `🏠 家宽 ISP：${profile.isp.home.label}${profile.isp.home.detail ? `（${profile.isp.home.detail}）` : ""}`,
            `🔀 双 ISP：${profile.isp.dual.label}${profile.isp.dual.detail ? `（${profile.isp.dual.detail}）` : ""}`,
            `📡 ISP：${profile.isp.primary || "⚪ 未识别"}`,
            "",
            `📶 延迟：${formatLatency(latency)} ms`,
            `⬇️ 下载：${formatSpeed(download.bps)} Mbps`,
            `⬆️ 上传：${formatSpeed(upload.bps)} Mbps`,
            `🧪 样本：下载 ${download.points.length} 次 / 上传 ${upload.points.length} 次`,
            `⏱️ 耗时：${elapsedSeconds.toFixed(1)} 秒`,
            "",
            "🛡️ IP 信息请求与测速请求均按当前节点转发。",
            "☁️ 测速源：speed.cloudflare.com",
        ].join("\n"),
    });
}

async function discoverIPProfile() {
    const results = await Promise.all([
        capture(requestJson(IPPURE_URL)),
        capture(requestJson(IPAPI_URL)),
    ]);
    const ippure = results[0].ok ? results[0].value : {};
    const ipapi = results[1].ok ? results[1].value : {};
    const ip = firstValidIP([ippure.ip, ipapi.ip]);

    if (!results[0].ok) console.log(`[WARN] IPPure: ${results[0].error}`);
    if (!results[1].ok) console.log(`[WARN] ipapi.is: ${results[1].error}`);

    return {
        ip: ip || "⚪ 未获取",
        purity: classifyPurity(ippure.fraudScore),
        isp: classifyISP(ippure, ipapi),
    };
}

function classifyPurity(value) {
    const score = numberOrNull(value);
    if (score === null || score < 0 || score > 100) {
        return { label: "⚪ 未知", detail: "IPPure 未返回风险分" };
    }
    if (score < 40) return { label: "🟢 较纯净", detail: `风险 ${score}/100` };
    if (score < 70) return { label: "🟠 一般", detail: `风险 ${score}/100` };
    if (score < 80) return { label: "🔴 有风险", detail: `风险 ${score}/100` };
    return { label: "⛔ 高风险", detail: `风险 ${score}/100` };
}

function classifyISP(ippure, ipapi) {
    const company = ipapi && ipapi.company ? ipapi.company : {};
    const asn = ipapi && ipapi.asn ? ipapi.asn : {};
    const candidates = [
        ippure && ippure.isp,
        ippure && ippure.organization,
        company.name,
        company.network,
        asn.org,
        asn.name,
        ipapi && ipapi.isp,
        ipapi && ipapi.organization,
        ippure && ippure.asOrganization,
    ];
    const providers = uniqueProviders(candidates);
    const primary = firstNonEmpty([
        ippure && ippure.isp,
        company.name,
        asn.org,
        company.network,
        ippure && ippure.organization,
    ]) || providers[0] || "";
    const type = cleanValue(company.type || ipapi.type);
    const signalText = [
        type,
        company.name,
        company.network,
        asn.org,
        asn.name,
        ippure && ippure.isp,
        ippure && ippure.organization,
    ].filter(Boolean).join(" ");
    const normalized = signalText.toLowerCase();
    const datacenterSignal = hasPositiveFlag(ipapi, [
        "is_datacenter", "isDatacenter", "datacenter", "is_hosting", "isHosting", "hosting",
    ]) || hasPositiveFlag(company, ["is_datacenter", "isDatacenter", "datacenter", "is_hosting", "isHosting"]);
    const mobileSignal = hasPositiveFlag(ipapi, ["is_mobile", "isMobile", "mobile"])
        || hasPositiveFlag(company, ["is_mobile", "isMobile", "mobile"]);
    const vpnSignal = hasPositiveFlag(ipapi, ["is_vpn", "isVpn", "vpn"]);
    const proxySignal = hasPositiveFlag(ipapi, ["is_proxy", "isProxy", "proxy"]);
    const torSignal = hasPositiveFlag(ipapi, ["is_tor", "isTor", "tor"]);
    const residentialSignal = hasPositiveFlag(ipapi, ["is_residential", "isResidential", "residential"])
        || hasPositiveFlag(company, ["is_residential", "isResidential", "residential"])
        || /^(isp|residential|fixed[\s_-]*line|broadband|telecom|cable|fiber|wireless)$/i.test(type)
        || /(residential|fixed\s*line|broadband|cable|fiber|telecom|wireless|\bisp\b)/i.test(normalized);
    const hostingSignal = datacenterSignal
        || /^(hosting|datacenter|data[\s_-]*center|cloud|server|transit|cdn)$/i.test(type)
        || /(hosting|data\s*center|datacenter|cloud|server|transit|cdn)/i.test(normalized);
    const blockedSignal = hostingSignal || vpnSignal || proxySignal || torSignal;

    const location = ipapi && ipapi.location ? ipapi.location : {};
    const country = firstNonEmpty([
        location.country,
        location.country_name,
        ipapi && ipapi.country,
        ippure && ippure.country,
    ]);
    const countryCode = firstNonEmpty([
        location.country_code,
        location.countryCode,
        ipapi && ipapi.country_code,
        ipapi && ipapi.countryCode,
    ]);
    const countryText = [countryFlag(countryCode), country].filter(Boolean).join(" ");

    let home;
    if (blockedSignal) {
        home = { label: "🔴 否", detail: type || "检测到机房、代理或 VPN 信号" };
    } else if (residentialSignal) {
        home = { label: "🟢 是", detail: type || "检测到家庭宽带/ISP 信号" };
    } else {
        home = { label: "⚪ 未知", detail: type || "数据不足，不能确认" };
    }

    const marker = blockedSignal
        ? { label: "🔴 机房/代理 IP", detail: vpnSignal ? "VPN" : proxySignal ? "Proxy" : torSignal ? "Tor" : "Datacenter/Hosting" }
        : residentialSignal
            ? { label: "🟢 家庭住宅 IP", detail: mobileSignal ? "移动 ISP" : "固定宽带 ISP" }
            : { label: "⚪ 未识别", detail: "数据库没有返回住宅/机房标记" };

    const operatorType = blockedSignal
        ? { label: "🔴 Hosting/IDC", detail: type || "机房或云服务" }
        : mobileSignal
            ? { label: "🟢 Mobile ISP", detail: "移动运营商" }
            : residentialSignal
                ? { label: "🟢 ISP", detail: "住宅/宽带运营商" }
                : { label: "⚪ 未知", detail: type || "缺少运营商类型" };

    const native = blockedSignal
        ? { label: "🔴 非原生 IP", detail: countryText || "检测到代理/机房信号" }
        : residentialSignal
            ? { label: "🟢 原生 IP", detail: countryText || "住宅 ISP" }
            : { label: "⚪ 待确认", detail: countryText || "数据不足" };

    const dual = providers.length > 1
        ? { label: "🟠 疑似", detail: providers.slice(0, 2).join(" / ") }
        : providers.length === 1
            ? { label: "🟢 否", detail: `单一网络：${providers[0]}` }
            : { label: "⚪ 未知", detail: "没有可用于对比的 ISP/ASN 名称" };

    return { primary, providers, home, dual, marker, type: operatorType, native, country, countryCode };
}

function firstNonEmpty(values) {
    for (let index = 0; index < (values || []).length; index += 1) {
        const value = cleanValue(values[index]);
        if (value) return value;
    }
    return "";
}

function hasPositiveFlag(source, names) {
    if (!source || typeof source !== "object") return false;
    return (names || []).some((name) => isPositiveFlag(source[name]));
}

function isPositiveFlag(value) {
    if (value === true || value === 1) return true;
    if (typeof value === "string") return /^(true|yes|y|1|on)$/i.test(value.trim());
    if (!value || typeof value !== "object") return false;
    return Object.keys(value).some((key) => isPositiveFlag(value[key]));
}

function countryFlag(code) {
    const normalized = cleanValue(code).toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalized)) return "";
    return String.fromCodePoint(
        normalized.charCodeAt(0) + 127397,
        normalized.charCodeAt(1) + 127397,
    );
}

function uniqueProviders(values) {
    const result = [];
    const keys = [];
    (values || []).forEach((value) => {
        const name = cleanValue(value);
        const key = providerKey(name);
        if (!name || key.length < 3 || keys.some((item) => item === key || item.indexOf(key) >= 0 || key.indexOf(item) >= 0)) return;
        result.push(name);
        keys.push(key);
    });
    return result;
}

function providerKey(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/\bas\s*\d+\b/g, "")
        .replace(/\b(inc|llc|ltd|limited|corp|corporation|company|communications?|network|networks|internet|services?)\b/g, "")
        .replace(/[^a-z0-9]+/g, "");
}

async function measureLatency() {
    const url = `${CONFIG.downloadUrl}?bytes=${CONFIG.latencyBytes}&r=${cacheBust()}`;
    const startedAt = Date.now();
    await request("GET", url);
    return Math.max(1, Date.now() - startedAt);
}

async function measureDirection(direction) {
    const points = [];
    const bytes = direction === "download" ? CONFIG.downloadBytes : CONFIG.uploadBytes;
    const body = direction === "upload" ? buildUploadBody(bytes) : null;
    let lastError = null;

    for (let index = 0; index < CONFIG.samples; index += 1) {
        try {
            const point = direction === "download"
                ? await measureDownload(bytes)
                : await measureUpload(bytes, body);
            points.push(point);
            console.log(`[INFO] ${direction} #${index + 1}: ${formatSpeed(point.bps)} Mbps`);
        } catch (error) {
            lastError = error;
            console.log(`[WARN] ${direction} #${index + 1}: ${errorMessage(error)}`);
        }
    }

    if (!points.length) {
        throw new Error(`${direction === "download" ? "下载" : "上传"}测速失败：${errorMessage(lastError)}`);
    }

    return {
        bps: median(points.map((point) => point.bps)),
        points,
    };
}

async function measureDownload(bytes) {
    const url = `${CONFIG.downloadUrl}?bytes=${bytes}&r=${cacheBust()}`;
    const startedAt = Date.now();
    const response = await request("GET", url);
    const durationMs = Math.max(1, Date.now() - startedAt);
    const reportedBytes = parsePositiveNumber(header(response.headers, "content-length"));
    const transferBytes = reportedBytes || bytes;

    return {
        bps: transferBytes * 8 * 1000 / durationMs,
        durationMs,
        bytes: transferBytes,
    };
}

async function measureUpload(bytes, body) {
    const startedAt = Date.now();
    await request("POST", `${CONFIG.uploadUrl}?r=${cacheBust()}`, {
        body,
        headers: {
            "Content-Type": "text/plain;charset=UTF-8",
            "Content-Length": String(bytes),
        },
    });
    const durationMs = Math.max(1, Date.now() - startedAt);

    return {
        bps: bytes * 8 * 1000 / durationMs,
        durationMs,
        bytes,
    };
}

function request(method, url, options) {
    const config = options || {};
    return new Promise((resolve, reject) => {
        const requestOptions = {
            url,
            method: String(method || "GET").toUpperCase(),
            headers: Object.assign({
                Accept: "*/*",
                "User-Agent": CONFIG.userAgent,
                "Cache-Control": "no-cache",
            }, config.headers || {}),
            opts: {
                policy: nodeName,
            },
        };

        if (typeof config.body !== "undefined") requestOptions.body = config.body;

        $task.fetch(requestOptions).then((response) => {
            const status = Number(response && (response.statusCode || response.status));
            if (!Number.isFinite(status) || status < 200 || status >= 300) {
                reject(new Error(`HTTP ${status || "?"}`));
                return;
            }
            resolve(response || {});
        }, (error) => reject(new Error(errorMessage(error))));
    });
}

function readNodeName() {
    if (typeof $environment === "undefined" || !$environment) return "";
    return String($environment.params || "").trim();
}

function buildUploadBody(bytes) {
    const chunk = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_.~";
    let body = "";
    while (body.length < bytes) body += chunk;
    return body.slice(0, bytes);
}

function header(headers, name) {
    if (!headers || typeof headers !== "object") return "";
    const expected = String(name).toLowerCase();
    const key = Object.keys(headers).find((item) => String(item).toLowerCase() === expected);
    return key ? String(headers[key]) : "";
}

function median(values) {
    const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (!sorted.length) throw new Error("没有有效测速样本");
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function parsePositiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
}

function formatSpeed(bitsPerSecond) {
    return (Number(bitsPerSecond) / 1000 / 1000).toFixed(2);
}

function formatLatency(value) {
    return Number(value).toFixed(0);
}

function requestJson(url, options) {
    const config = options || {};
    return request(config.method || "GET", url, config).then((response) => {
        try {
            return JSON.parse(String(response.body || ""));
        } catch (_) {
            throw new Error("JSON 响应解析失败");
        }
    });
}

function capture(promise) {
    return Promise.resolve(promise).then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error: errorMessage(error) })
    );
}

function firstValidIP(values) {
    for (let index = 0; index < values.length; index += 1) {
        const value = String(values[index] || "").trim();
        if (isIPv4(value) || /^[0-9a-f:]+$/i.test(value) && value.indexOf(":") >= 0) return value;
    }
    return "";
}

function isIPv4(value) {
    const parts = String(value || "").trim().split(".");
    return parts.length === 4 && parts.every((part) => {
        return /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255;
    });
}

function numberOrNull(value) {
    if (value === null || typeof value === "undefined" || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function cleanValue(value) {
    if (value === null || typeof value === "undefined") return "";
    const text = String(value).trim();
    return /^(null|undefined|n\/a|unknown|-)$/i.test(text) ? "" : text;
}

function cacheBust() {
    return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function finish(result) {
    $done({
        title: result.title,
        message: result.message,
        icon: "bolt.fill",
    });
}

function finishError(message) {
    finish({
        title: SCRIPT_NAME,
        message: `失败：${message}`,
    });
}

function errorMessage(error) {
    return error && error.message ? String(error.message) : String(error || "未知错误");
}
