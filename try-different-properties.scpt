tell application "Notes"
    set targetFolder to folder "Notes"
    set targetNote to missing value
    
    -- 查找标题包含 "20250613165602" 的笔记
    repeat with aNote in notes of targetFolder
        if name of aNote contains "20250613165602" then
            set targetNote to aNote
            exit repeat
        end if
    end repeat
    
    if targetNote is missing value then
        return "未找到笔记"
    end if
    
    log "=== 笔记属性 ==="
    log "name: " & (name of targetNote)
    log "id: " & (id of targetNote)
    
    try
        log "body: " & (body of targetNote)
    end try
    
    try
        log "plaintext: " & (plaintext of targetNote)
    end try
    
    try
        log "container: " & (name of container of targetNote)
    end try
    
    try
        log "creation date: " & (creation date of targetNote)
    end try
    
    try
        log "modification date: " & (modification date of targetNote)
    end try
    
    -- 尝试获取 properties
    try
        set noteProps to properties of targetNote
        log "properties: " & noteProps
    end try
    
    return "完成"
end tell
