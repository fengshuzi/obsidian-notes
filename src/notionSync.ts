/**
 * Notion 同步：调用 Notion API 拉取页面与块，转为 Markdown，图片下载到 vault 的 assets。
 * 图片按笔记名重命名：笔记名-001.ext；链接最简路径 ![](笔记名-001.ext)
 * API 参考: https://developers.notion.com/reference
 *
 * 使用 Node https 发起请求以绕过 CORS（Obsidian 渲染进程中的 fetch 会受 app:// 源限制）。
 */

import * as https from "https";
import * as http from "http";
import { URL } from "url";

const NOTION_VERSION = "2022-06-28";
const REQUEST_DELAY_MS = 350;
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp"]);

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 使用 Node https/http 发起请求，绕过 CORS（Obsidian 中 fetch 会报 CORS） */
function nodeRequest(
  urlStr: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer>; json(): Promise<any>; text(): Promise<string> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const isHttps = url.protocol === "https:";
    const mod = isHttps ? https : http;
    const reqOpts: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || "GET",
      headers: options.headers || {},
    };
    const req = mod.request(reqOpts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const resObj = {
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode || 0,
          arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
          json: () => Promise.resolve(JSON.parse(buf.toString("utf-8"))),
          text: () => Promise.resolve(buf.toString("utf-8")),
        };
        resolve(resObj);
      });
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

export function normalizePageId(pageIdOrUrl: string): string {
  let s = pageIdOrUrl.trim();
  if (s.includes("notion.so") || s.includes("notion.site")) {
    s = s.split("?")[0].replace(/\/+$/, "");
    s = s.split("/").pop() || s;
    if (s.includes("-")) {
      const suffix = s.split("-").pop() || "";
      if (suffix.length === 32 && /^[a-zA-Z0-9]+$/.test(suffix)) {
        s = suffix;
      }
    }
  }
  s = s.replace(/-/g, "");
  if (s.length === 32 && /^[a-zA-Z0-9]+$/.test(s)) {
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
  }
  return pageIdOrUrl;
}

function sanitizeFilename(name: string): string {
  return (name || "untitled").replace(/[\\/:"*?<>|]+/g, "_").trim() || "untitled";
}

export interface NotionPageEntry {
  id: string;
  outputFolder?: string;
}

interface NotionSyncContext {
  token: string;
  vault: any;
  /** 图片保存目录（相对 vault 根，如 assets 表示根目录下 assets） */
  notionAssetsDir: string;
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function notionGet(url: string, token: string, params?: Record<string, string>): Promise<any> {
  await delay(REQUEST_DELAY_MS);
  let fullUrl = url;
  if (params && Object.keys(params).length) {
    fullUrl = url + "?" + new URLSearchParams(params).toString();
  }
  const res = await nodeRequest(fullUrl, { method: "GET", headers: headers(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function notionPost(url: string, token: string, body: object): Promise<any> {
  await delay(REQUEST_DELAY_MS);
  const res = await nodeRequest(url, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getPage(pageId: string, token: string): Promise<any> {
  const id = normalizePageId(pageId);
  return notionGet(`https://api.notion.com/v1/pages/${id}`, token);
}

async function getPageSafe(pageId: string, token: string): Promise<any> {
  const id = normalizePageId(pageId);
  await delay(REQUEST_DELAY_MS);
  const res = await nodeRequest(`https://api.notion.com/v1/pages/${id}`, {
    method: "GET",
    headers: headers(token),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Notion API ${res.status}`);
  return res.json();
}

async function getDatabase(databaseId: string, token: string): Promise<any> {
  const id = normalizePageId(databaseId);
  return notionGet(`https://api.notion.com/v1/databases/${id}`, token);
}

async function queryDatabaseEntries(databaseId: string, token: string): Promise<any[]> {
  const id = normalizePageId(databaseId);
  const url = `https://api.notion.com/v1/databases/${id}/query`;
  const out: any[] = [];
  let startCursor: string | undefined;
  do {
    const body: any = { page_size: 100 };
    if (startCursor) body.start_cursor = startCursor;
    const r = await notionPost(url, token, body);
    out.push(...(r.results || []));
    startCursor = r.has_more ? r.next_cursor : undefined;
  } while (startCursor);
  return out;
}

async function getBlockChildren(blockId: string, token: string, startCursor?: string): Promise<any> {
  const id = normalizePageId(blockId);
  const params: Record<string, string> = { page_size: "100" };
  if (startCursor) params.start_cursor = startCursor;
  return notionGet(`https://api.notion.com/v1/blocks/${id}/children`, token, params);
}

async function fetchAllBlocks(blockId: string, token: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const r = await getBlockChildren(blockId, token, cursor);
    out.push(...(r.results || []));
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

function pageTitleFromProperties(properties: any): string {
  for (const key of ["title", "Name", "name"]) {
    const prop = properties?.[key];
    if (prop?.type === "title" && Array.isArray(prop.title)) {
      const t = prop.title.map((x: any) => x.plain_text || "").join("");
      if (t) return t;
    }
  }
  return "Untitled";
}

function richTextToMd(richText: any[]): string {
  if (!Array.isArray(richText) || !richText.length) return "";
  return richText
    .map((t: any) => {
      let plain = t.plain_text || "";
      const ann = t.annotations || {};
      if (ann.code) plain = "`" + plain + "`";
      else {
        if (ann.bold) plain = "**" + plain + "**";
        if (ann.italic) plain = "*" + plain + "*";
        if (ann.strikethrough) plain = "~~" + plain + "~~";
      }
      return t.href ? `[${plain}](${t.href})` : plain;
    })
    .join("");
}

function extractRichText(block: any): any[] {
  const btype = block?.type || "paragraph";
  const data = block?.[btype] || block?.paragraph || {};
  return data.rich_text || data.text || [];
}

function getFileUrl(block: any): { url: string | null; name: string } {
  const btype = block?.type;
  const data = block?.[btype] || {};
  const typ = data.type;
  if (typ === "external") {
    const url = data.external?.url ?? null;
    const name = data.name || (url ? url.split("/").pop()?.split("?")[0] : "file") || "file";
    return { url, name };
  }
  if (typ === "file") {
    const url = data.file?.url ?? null;
    const name = data.name || (url ? url.split("/").pop()?.split("?")[0] : "file") || "file";
    return { url, name };
  }
  return { url: null, name: "file" };
}

/** 下载文件到 vault 的 assets 路径（使用 Node https 绕过 CORS） */
async function downloadToVault(
  url: string,
  _vaultPath: string,
  token: string,
  vault: any
): Promise<ArrayBuffer | null> {
  try {
    const requestHeaders =
      url && (url.includes("notion-static.com") || url.includes("notion.so"))
        ? headers(token)
        : { "User-Agent": "Notion-Export/1.0" };
    const res = await nodeRequest(url, { method: "GET", headers: requestHeaders });
    if (!res.ok) return null;
    return res.arrayBuffer();
  } catch {
    return null;
  }
}

/** 单块转 Markdown 行；返回 { line, localRef }，localRef 为图片/文件的 vault 相对路径（用于替换） */
async function blockToMdLine(
  block: any,
  ctx: NotionSyncContext,
  noteBaseName: string,
  imageCounter: { n: number },
  assetsLinkPrefix: string,
  blockIdToChildren: Map<string, any[]>,
  indent: string
): Promise<{ line: string; localRef: string | null }> {
  const btype = block?.type || "paragraph";
  if (btype === "unsupported") {
    return { line: indent + "<!-- unsupported block -->\n", localRef: null };
  }

  const rt = extractRichText(block);
  let line = richTextToMd(rt);
  const { url, name } = getFileUrl(block);
  let localRef: string | null = null;

  const ext = (name ? name.split(".").pop() : "")?.toLowerCase()?.replace(/^\\./, "") || "";
  const isImage =
    IMAGE_EXTENSIONS.has(ext) || btype === "image";
  const assetsDir = ctx.notionAssetsDir.replace(/\/+$/, "");
  if (url && isImage && noteBaseName) {
    imageCounter.n++;
    const extSafe = ext || "png";
    const filename = `${sanitizeFilename(noteBaseName)}-${String(imageCounter.n).padStart(3, "0")}.${extSafe}`;
    const vaultAssetPath = assetsDir ? assetsDir + "/" + filename : filename;
    const buf = await downloadToVault(url, vaultAssetPath, ctx.token, ctx.vault);
    if (buf && ctx.vault?.adapter) {
      try {
        const parts = assetsDir.split("/").filter(Boolean);
        for (let i = 1; i <= parts.length; i++) {
          const dir = parts.slice(0, i).join("/");
          if (dir) await ctx.vault.adapter.mkdir(dir);
        }
        await ctx.vault.adapter.writeBinary(vaultAssetPath, buf);
        localRef = filename;
      } catch {
        localRef = null;
      }
    }
  }

  if (btype === "paragraph") return { line: line ? indent + line + "\n" : "", localRef };
  if (btype === "heading_1") return { line: indent + "# " + line + "\n", localRef };
  if (btype === "heading_2") return { line: indent + "## " + line + "\n", localRef };
  if (btype === "heading_3") return { line: indent + "### " + line + "\n", localRef };
  if (btype === "bulleted_list_item") return { line: indent + "- " + line + "\n", localRef };
  if (btype === "numbered_list_item") return { line: indent + "1. " + line + "\n", localRef };
  if (btype === "to_do") {
    const checked = block?.to_do?.checked ?? false;
    return { line: indent + "- " + (checked ? "[x]" : "[ ]") + " " + line + "\n", localRef };
  }
  if (btype === "quote") return { line: indent + "> " + line.replace(/\n/g, "\n> ") + "\n", localRef };
  if (btype === "callout") return { line: indent + "> " + line + "\n", localRef };
  if (btype === "code") {
    const lang = block?.code?.language || "plain text";
    return { line: indent + "```" + lang + "\n" + line + "\n```\n", localRef };
  }
  if (btype === "divider") return { line: indent + "---\n", localRef };
  if (btype === "bookmark") {
    const linkUrl = block?.bookmark?.url || "";
    return { line: indent + `[${line || linkUrl}](${linkUrl})\n`, localRef };
  }
  if (btype === "embed") {
    const linkUrl = block?.embed?.url || "";
    return { line: indent + `[${line || linkUrl}](${linkUrl})\n`, localRef };
  }
  if (btype === "link_preview") {
    const linkUrl = block?.link_preview?.url || "";
    return { line: indent + `[${line || linkUrl}](${linkUrl})\n`, localRef };
  }
  if (btype === "image") {
    if (localRef) return { line: indent + `![](${assetsLinkPrefix}${localRef})\n`, localRef: null };
    return { line: indent + `![]( ${url} )\n`, localRef: null };
  }
  if (["file", "video", "pdf", "audio"].includes(btype)) {
    if (localRef) return { line: indent + `[${line || name}](${assetsLinkPrefix}${localRef})\n`, localRef: null };
    return { line: indent + `[${line || name}](${url})\n`, localRef };
  }
  if (btype === "child_page") return { line: "", localRef: null };
  if (btype === "child_database") {
    const title = block?.child_database?.title || "Database";
    return { line: indent + `<!-- Database: ${title} -->\n`, localRef: null };
  }
  if (btype === "table_of_contents") return { line: indent + "<!-- Table of contents -->\n", localRef: null };
  if (btype === "breadcrumb") return { line: "", localRef: null };
  if (btype === "toggle") return { line: indent + "> " + line + "\n", localRef: null };
  if (btype === "equation") {
    const expr = block?.equation?.expression || "";
    return { line: indent + "$$" + expr + "$$\n", localRef: null };
  }
  return { line: line ? indent + line + "\n" : "", localRef };
}

async function blocksToMarkdown(
  blocks: any[],
  ctx: NotionSyncContext,
  token: string,
  noteBaseName: string,
  imageCounter: { n: number },
  assetsLinkPrefix: string,
  blockIdToChildren: Map<string, any[]>,
  indent: string,
  outputDir: string
): Promise<string> {
  const out: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const btype = block?.type || "paragraph";
    const bid = (block?.id || "").replace(/-/g, "");

    const { line, localRef } = await blockToMdLine(
      block,
      ctx,
      noteBaseName,
      imageCounter,
      assetsLinkPrefix,
      blockIdToChildren,
      indent
    );
    if (line) out.push(line);

    // 父页不渲染子页面/子数据库的内容：child_page / child_database 只作为占位，子内容单独导出为独立 .md
    if (block?.has_children && btype !== "child_page" && btype !== "child_database") {
      let children = blockIdToChildren.get(bid);
      if (!children) {
        children = await fetchAllBlocks(block.id, token);
        blockIdToChildren.set(bid, children);
      }
      const subIndent =
        ["bulleted_list_item", "numbered_list_item", "to_do", "toggle"].includes(btype)
          ? indent + "    "
          : indent;
      const sub = await blocksToMarkdown(
        children,
        ctx,
        token,
        noteBaseName,
        imageCounter,
        assetsLinkPrefix,
        blockIdToChildren,
        subIndent,
        outputDir
      );
      if (sub) out.push(sub);
    }

    if (btype === "table") {
      let rows = blockIdToChildren.get(bid);
      if (!rows) {
        rows = await fetchAllBlocks(block.id, token);
        blockIdToChildren.set(bid, rows);
      }
      for (const row of rows) {
        if (row?.type !== "table_row") continue;
        const cells = (row.table_row?.cells || []).map((c: any[]) => richTextToMd(c));
        out.push("| " + cells.join(" | ") + " |\n");
      }
      out.push("\n");
    }
  }
  return out.join("");
}

function collectChildPages(blocks: any[], blockIdToChildren: Map<string, any[]>, token: string): Promise<string[]> {
  const ids: string[] = [];
  async function walk(blks: any[]) {
    for (const block of blks) {
      if (block?.type === "child_page") ids.push(block.id);
      if (block?.has_children) {
        const bid = (block?.id || "").replace(/-/g, "");
        let children = blockIdToChildren.get(bid);
        if (!children) {
          children = await fetchAllBlocks(block.id, token);
          blockIdToChildren.set(bid, children);
        }
        await walk(children);
      }
    }
  }
  return walk(blocks).then(() => ids);
}

async function exportPage(
  pageId: string,
  outputDir: string,
  ctx: NotionSyncContext,
  token: string,
  blockIdToChildren: Map<string, any[]>,
  assetsLinkPrefix: string
): Promise<{ path: string; title: string; content: string } | null> {
  const id = normalizePageId(pageId);
  let page: any;
  try {
    page = await getPage(id, token);
  } catch (e) {
    console.error("Notion getPage failed", id, e);
    return null;
  }
  if (page?.code === "object_not_found") return null;

  const title = pageTitleFromProperties(page?.properties || {});
  const safeTitle = sanitizeFilename(title).slice(0, 200);
  const blocks = await fetchAllBlocks(id, token);
  blockIdToChildren.set(id.replace(/-/g, ""), blocks);

  const imageCounter = { n: 0 };
  const mdBody = await blocksToMarkdown(
    blocks,
    ctx,
    token,
    safeTitle,
    imageCounter,
    assetsLinkPrefix,
    blockIdToChildren,
    "",
    outputDir
  );

  const filePath = outputDir + "/" + safeTitle + ".md";
  return { path: filePath, title: safeTitle, content: mdBody };
}

async function exportTree(
  pageId: string,
  outputDir: string,
  ctx: NotionSyncContext,
  token: string,
  blockIdToChildren: Map<string, any[]>,
  seen: Set<string>,
  vault: any,
  assetsLinkPrefix: string
): Promise<{ path: string; content: string; title: string }[]> {
  const id = normalizePageId(pageId);
  if (seen.has(id)) return [];
  seen.add(id);

  const result = await exportPage(pageId, outputDir, ctx, token, blockIdToChildren, assetsLinkPrefix);
  if (!result) return [];
  const exported: { path: string; content: string; title: string }[] = [];
  exported.push({ path: result.path, content: result.content, title: result.title });

  const page = await getPage(id, token);
  const blocks = blockIdToChildren.get(id.replace(/-/g, "")) || [];
  const childIds = await collectChildPages(blocks, blockIdToChildren, token);
  const childOutputDir = outputDir + "/" + result.title;
  const assetsDir = ctx.notionAssetsDir.replace(/\/+$/, "");
  const childPrefix = getAssetsLinkPrefix(childOutputDir, assetsDir);
  for (const cid of childIds) {
    const childResults = await exportTree(
      cid,
      childOutputDir,
      ctx,
      token,
      blockIdToChildren,
      seen,
      vault,
      childPrefix
    );
    for (const r of childResults) {
      exported.push(r);
    }
  }
  return exported;
}

/** 确保文件路径的父文件夹存在（逐级创建），便于子页面写入子文件夹 */
async function ensureParentFolder(vault: any, filePath: string): Promise<void> {
  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 1) return;
  const folderParts = parts.slice(0, -1);
  for (let i = 1; i <= folderParts.length; i++) {
    const folderPath = folderParts.slice(0, i).join("/");
    const existing = vault.getAbstractFileByPath(folderPath);
    if (!existing) {
      await vault.createFolder(folderPath);
    }
  }
}

/** 根据笔记所在目录与 assets 目录，计算 Markdown 中图片链接的相对路径前缀 */
function getAssetsLinkPrefix(noteFolderVaultRelative: string, assetsDir: string): string {
  const dir = (assetsDir || "assets").replace(/\/+$/, "");
  const depth = noteFolderVaultRelative.replace(/\\/g, "/").split("/").filter(Boolean).length;
  const up = depth > 0 ? "../".repeat(depth) : "";
  return up + (dir ? dir + "/" : "");
}

/** 执行 Notion 同步：按配置的页面列表依次导出到 vault */
export async function syncNotion(
  app: any,
  token: string,
  pages: NotionPageEntry[],
  defaultOutputFolder: string,
  notionAssetsFolder: string
): Promise<{ success: number; fail: number; totalFiles: number }> {
  const vault = app.vault;
  const norm = (p: string) => p.replace(/\\/g, "/").trim();
  const assetsDir = (notionAssetsFolder || "assets").replace(/\\/g, "/").trim().replace(/\/+$/, "") || "assets";
  let success = 0;
  let fail = 0;
  let totalFiles = 0;
  const blockIdToChildren = new Map<string, any[]>();
  const seen = new Set<string>();

  for (const entry of pages) {
    const pageId = entry.id?.trim();
    if (!pageId) continue;

    const outputFolder = entry.outputFolder?.trim() || defaultOutputFolder;
    const outputDir = outputFolder ? norm(outputFolder) : norm(defaultOutputFolder);
    const ctx: NotionSyncContext = {
      token,
      vault,
      notionAssetsDir: assetsDir,
    };

    let rootPage: any;
    try {
      rootPage = await getPageSafe(pageId, token);
    } catch (e) {
      fail++;
      continue;
    }

    if (rootPage) {
      const assetsLinkPrefix = getAssetsLinkPrefix(outputDir, assetsDir);
      const results = await exportTree(
        pageId,
        outputDir,
        ctx,
        token,
        blockIdToChildren,
        seen,
        vault,
        assetsLinkPrefix
      );
      for (const r of results) {
        try {
          await ensureParentFolder(vault, r.path);
          const existing = vault.getAbstractFileByPath(r.path);
          if (existing) {
            await vault.modify(existing as any, r.content);
          } else {
            await vault.create(r.path, r.content);
          }
          totalFiles++;
          success++;
        } catch (e) {
          fail++;
        }
      }
    } else {
      try {
        await getDatabase(pageId, token);
      } catch {
        fail++;
        continue;
      }
      const entries = await queryDatabaseEntries(pageId, token);
      for (const dbEntry of entries) {
        const eid = dbEntry?.id;
        if (!eid) continue;
        const dbAssetsPrefix = getAssetsLinkPrefix(outputDir, assetsDir);
        const results = await exportTree(
          eid,
          outputDir,
          ctx,
          token,
          blockIdToChildren,
          seen,
          vault,
          dbAssetsPrefix
        );
        for (const r of results) {
          try {
            await ensureParentFolder(vault, r.path);
            const existing = vault.getAbstractFileByPath(r.path);
            if (existing) {
              await vault.modify(existing as any, r.content);
            } else {
              await vault.create(r.path, r.content);
            }
            totalFiles++;
            success++;
          } catch (e) {
            fail++;
          }
        }
      }
    }
  }

  return { success, fail, totalFiles };
}
