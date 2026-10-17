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
const SCRIPT_VERSION = "2026-10-17.r1";

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
    const latency = await measureLatency();
    const download = await measureDirection("download");
    const upload = await measureDirection("upload");
    const elapsedSeconds = (Date.now() - startedAt) / 1000;

    finish({
        title: `${SCRIPT_NAME} · ${nodeName}`,
        message: [
            `延迟：${formatLatency(latency)} ms`,
            `下载：${formatSpeed(download.bps)} Mbps`,
            `上传：${formatSpeed(upload.bps)} Mbps`,
            `样本：下载 ${download.points.length} 次 / 上传 ${upload.points.length} 次`,
            `耗时：${elapsedSeconds.toFixed(1)} 秒`,
            "",
            "测速请求已按当前节点转发；结果包含本地网络与节点出口链路。",
            "测速源：speed.cloudflare.com",
        ].join("\n"),
    });
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
