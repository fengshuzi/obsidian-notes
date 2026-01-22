-- ===== macOS 15.6+ 原生 Markdown 导出 =====
-- 需要 macOS 26 Beta 或更高版本

-- ===== 配置导出目录 =====
set exportDir to (POSIX path of (path to home folder)) & "NotesExportMarkdown/"
do shell script "mkdir -p " & quoted form of exportDir

-- ===== 激活 Notes =====
tell application "Notes"
	activate
	delay 0.5
	
	set targetFolder to folder "Notes"
	set allNotes to notes of targetFolder
	set noteCount to count of allNotes
	
	log "找到 " & noteCount & " 个笔记，开始导出..."
	
	repeat with aNote in allNotes
		set noteTitle to name of aNote
		
		-- 显示笔记
		show aNote
		delay 0.3
		
		tell application "System Events"
			tell process "Notes"
				set frontmost to true
				
				-- 方法 1: 使用菜单 File -> Export as Markdown
				try
					click menu item "Export as Markdown" of menu 1 of menu bar item "File" of menu bar 1
					delay 0.5
					
					-- 等待保存对话框
					repeat until exists sheet 1 of window 1
						delay 0.1
					end repeat
					
					tell sheet 1 of window 1
						-- 跳转到导出目录
						keystroke "G" using {command down, shift down}
						delay 0.3
						keystroke exportDir
						delay 0.3
						key code 36 -- Enter
						delay 0.5
						
						-- 保存
						key code 36 -- Enter/Save
						delay 0.5
					end tell
					
					log "✓ 已导出: " & noteTitle
					
				on error errMsg
					log "✗ 导出失败: " & noteTitle & " - " & errMsg
					
					-- 如果菜单不存在，尝试使用共享表单
					try
						keystroke "e" using {command down}
						delay 0.5
						-- 这里需要根据实际的共享菜单调整
					end try
				end try
				
			end tell
		end tell
		
		delay 0.5
		
	end repeat
	
	log "导出完成！文件保存在: " & exportDir
	
end tell

-- 显示完成通知
display notification "已导出 " & noteCount & " 个笔记" with title "Notes 导出完成" sound name "Glass"
