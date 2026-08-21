import { readFile } from "node:fs/promises";
import axios from "axios";

const SOURCE_PATH = new URL("../src/backend/majnetUploader.jsw", import.meta.url);
const DEFAULT_BASE_URL = "https://cn.majdata.net";

function readConfiguredCredentials(source) {
  const username = source.match(/USERNAME:\s*["']([^"']+)["']/)?.[1];
  const passwordMd5 = source.match(
    /const\s+PASSWORD_MD5\s*=\s*["']([0-9a-f]{32})["']/i
  )?.[1];

  if (!username || !passwordMd5) {
    throw new Error("无法从 majnetUploader.jsw 读取当前账号配置");
  }

  return { username, passwordMd5 };
}

function extractToken(setCookieHeaders) {
  const headers = Array.isArray(setCookieHeaders)
    ? setCookieHeaders
    : [setCookieHeaders].filter(Boolean);

  for (const header of headers) {
    const match = String(header).match(/(?:^|;\s*)token=([^;]+)/i);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

async function main() {
  const source = await readFile(SOURCE_PATH, "utf8");
  const { username, passwordMd5 } = readConfiguredCredentials(source);
  const baseUrl = String(
    process.env.MAJNET_BASE_URL || DEFAULT_BASE_URL
  ).replace(/\/$/, "");
  const form = new URLSearchParams({
    username,
    password: passwordMd5,
    rememberMe: "true",
  });

  const response = await axios.post(
    `${baseUrl}/api3/api/account/Login`,
    form.toString(),
    {
      headers: {
        Accept: "*/*",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "maimai-monthly-editi/session-token-setup",
      },
      timeout: 30000,
      validateStatus: () => true,
    }
  );
  const token = extractToken(response.headers["set-cookie"]);

  if (response.status !== 200 || !token) {
    const responseBody =
      typeof response.data === "string"
        ? response.data.substring(0, 300)
        : JSON.stringify(response.data).substring(0, 300);
    throw new Error(
      `创建持久会话失败: HTTP ${response.status}; ${responseBody}`
    );
  }

  const verification = await axios.get(
    `${baseUrl}/api3/api/account/info/`,
    {
      headers: {
        Accept: "application/json",
        Cookie: `token=${token}`,
        "User-Agent": "maimai-monthly-editi/session-token-setup",
      },
      timeout: 30000,
      validateStatus: () => true,
    }
  );

  if (verification.status !== 200) {
    throw new Error(`持久会话验证失败: HTTP ${verification.status}`);
  }

  console.log("持久会话创建并验证成功。");
  console.log("请在 Wix Secrets Manager 中创建或更新以下 Secret：");
  console.log("名称: MAJNET_SESSION_TOKEN");
  console.log(`值: ${token}`);
  console.log("请勿把该值提交到 Git、源码或公开日志中。");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
