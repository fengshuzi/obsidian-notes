#!/usr/bin/env python3
"""
Joplin 导出脚本（与 Obsidian Notes 插件逻辑一致，可独立运行）
- 图片放在 vault 根目录的 assets 文件夹
- 图片按笔记名重命名：笔记名-001.ext、笔记名-002.ext
- 图片链接使用最简路径：![](笔记名-001.ext)
"""

import os
import sqlite3
import re
import shutil
from pathlib import Path

# === 配置 ===
DB_PATH = os.path.expanduser("~/.config/joplin-desktop/database.sqlite")
JOPLIN_RESOURCE_DIR = os.path.expanduser("~/.config/joplin-desktop/resources")
VAULT_DIR = "/Users/lizhifeng/Library/Mobile Documents/iCloud~md~obsidian/Documents/漂泊者及其影子"
OUTPUT_FOLDER = "joplin"
ASSETS_FOLDER = "assets"
TARGET_FOLDER_NAME = "joplin"

IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'}


def sanitize_filename(name):
    return re.sub(r'[\\/:"*?<>|]+', "_", name)


def build_resource_lookup():
    lookup = {}
    if not os.path.exists(JOPLIN_RESOURCE_DIR):
        return lookup
    for fname in os.listdir(JOPLIN_RESOURCE_DIR):
        if re.match(r"^[a-f0-9]{32}\.\w+$", fname):
            rid = fname.split(".")[0]
            lookup[rid] = fname
    return lookup


def get_folder_hierarchy(cursor, target_folder_name):
    cursor.execute(
        "SELECT id FROM folders WHERE title = ? AND parent_id = ''",
        (target_folder_name,)
    )
    root_folder = cursor.fetchone()
    if not root_folder:
        raise ValueError(f"❌ 找不到名为 '{target_folder_name}' 的 Joplin 笔记本")
    root_folder_id = root_folder[0]
    folder_hierarchy = {root_folder_id: ""}

    def build_hierarchy(parent_id, path=""):
        cursor.execute(
            "SELECT id, title FROM folders WHERE parent_id = ?",
            (parent_id,)
        )
        for folder_id, folder_title in cursor.fetchall():
            folder_path = os.path.join(path, sanitize_filename(folder_title)) if path else sanitize_filename(folder_title)
            folder_hierarchy[folder_id] = folder_path
            build_hierarchy(folder_id, folder_path)

    build_hierarchy(root_folder_id)
    return folder_hierarchy, root_folder_id


def process_resources(body, resource_lookup, note_base_name, assets_dir):
    resource_matches = re.findall(r'!\[\]\(:/([a-f0-9]{32})\)', body)
    rid_to_new_filename = {}
    image_counter = 0
    seen_rids = set()
    unique_rids = [r for r in resource_matches if r not in seen_rids and not seen_rids.add(r)]

    for rid in unique_rids:
        if rid not in resource_lookup:
            continue
        res_filename = resource_lookup[rid]
        ext = res_filename.split(".")[-1].lower()
        if ext in IMAGE_EXTENSIONS:
            image_counter += 1
            rid_to_new_filename[rid] = f"{note_base_name}-{image_counter:03d}.{ext}"
        else:
            rid_to_new_filename[rid] = res_filename

    assets_created = False
    for rid, new_filename in rid_to_new_filename.items():
        src_path = os.path.join(JOPLIN_RESOURCE_DIR, resource_lookup[rid])
        dst_path = os.path.join(assets_dir, new_filename)
        if os.path.exists(src_path) and not os.path.exists(dst_path):
            if not assets_created and not os.path.exists(assets_dir):
                os.makedirs(assets_dir, exist_ok=True)
                assets_created = True
            shutil.copyfile(src_path, dst_path)

    def replace_resource(match):
        rid = match.group(1)
        return f"![]({rid_to_new_filename[rid]})" if rid in rid_to_new_filename else match.group(0)

    return re.sub(r'!\[\]\(:/([a-f0-9]{32})\)', replace_resource, body).replace("&nbsp;", " ")


def export_notes():
    if not os.path.exists(DB_PATH):
        print(f"❌ Joplin 数据库不存在: {DB_PATH}")
        return
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        folder_hierarchy, _ = get_folder_hierarchy(cursor, TARGET_FOLDER_NAME)
        resource_lookup = build_resource_lookup()
        folder_ids = list(folder_hierarchy.keys())
        placeholders = ','.join('?' * len(folder_ids))
        cursor.execute(
            f"SELECT id, title, body, parent_id FROM notes "
            f"WHERE parent_id IN ({placeholders}) AND is_conflict = 0 AND deleted_time = 0",
            folder_ids
        )
        notes = cursor.fetchall()
        if not notes:
            print(f"❌ '{TARGET_FOLDER_NAME}' 中没有找到笔记")
            return
        output_dir = os.path.join(VAULT_DIR, OUTPUT_FOLDER) if OUTPUT_FOLDER else VAULT_DIR
        assets_dir = os.path.join(VAULT_DIR, ASSETS_FOLDER)
        success_count = fail_count = 0
        for note_id, title, body, parent_id in notes:
            try:
                folder_path = folder_hierarchy.get(parent_id, "")
                safe_title = sanitize_filename((title or "Untitled").strip())[:100]
                note_dir = os.path.join(output_dir, folder_path) if folder_path else output_dir
                output_file = os.path.join(note_dir, f"{safe_title}.md")
                processed_body = (body or "")
                if processed_body:
                    processed_body = process_resources(processed_body, resource_lookup, safe_title, assets_dir)
                os.makedirs(note_dir, exist_ok=True)
                with open(output_file, "w", encoding="utf-8") as f:
                    f.write(processed_body)
                success_count += 1
            except Exception as e:
                fail_count += 1
                print(f"❌ 导出失败: {title} - {e}")
        print(f"🎉 导出完成！成功 {success_count} 个，失败 {fail_count} 个")
    except ValueError as e:
        print(str(e))
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    export_notes()
