import { exec } from "child_process";
import { promisify } from "util";
import { writeFile } from "fs/promises";

const execAsync = promisify(exec);

async function checkActualHTML() {
    const script = `
        tell application "Notes"
            set targetFolder to folder "Notes"
            set targetNote to first note of targetFolder whose name contains "图片测试"
            set noteBody to body of targetNote
            return noteBody
        end tell
    `;

    try {
        const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
        
        // 保存原始 HTML
        await writeFile('actual-html-output.html', stdout);
        console.log('✓ 已保存原始 HTML 到 actual-html-output.html');
        console.log('HTML 长度:', stdout.length);
        console.log('包含 <object>:', stdout.includes('<object'));
        console.log('包含 base64:', stdout.includes('base64'));
        
        // 检查 object 标签
        const objectMatches = stdout.match(/<object[^>]*>/g);
        if (objectMatches) {
            console.log('\n找到 object 标签:', objectMatches.length);
            console.log('第一个 object 标签:');
            console.log(objectMatches[0]);
        }
        
        // 检查 data 属性
        const dataMatches = stdout.match(/data="[^"]*"/g);
        if (dataMatches) {
            console.log('\n找到 data 属性:', dataMatches.length);
            dataMatches.forEach((match, i) => {
                console.log(`\ndata ${i + 1} (前200字符):`);
                console.log(match.substring(0, 200));
            });
        }
        
        // 检查是否有换行符在 base64 数据中
        const base64Pattern = /data="data:image\/[^;]+;base64,([^"]+)"/;
        const base64Match = stdout.match(base64Pattern);
        if (base64Match) {
            const base64Data = base64Match[1];
            console.log('\n找到 base64 数据:');
            console.log('长度:', base64Data.length);
            console.log('包含换行符:', base64Data.includes('\n'));
            console.log('包含回车符:', base64Data.includes('\r'));
            console.log('前100字符:', base64Data.substring(0, 100));
        }
        
    } catch (error) {
        console.error('错误:', error);
    }
}

checkActualHTML();
