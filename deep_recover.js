const fs = require('fs');

const possibleLogs = [
  '/Users/Bakers/.gemini/antigravity/brain/16973718-5b85-423b-aa7a-77f21c987ef3/.system_generated/logs/investigate_in_store_atelier_link.txt',
  '/Users/Bakers/.gemini/antigravity/brain/16973718-5b85-423b-aa7a-77f21c987ef3/.system_generated/logs/refactoring_managers_and_logic.txt',
  '/Users/Bakers/.gemini/antigravity/brain/16973718-5b85-423b-aa7a-77f21c987ef3/.system_generated/logs/centralize_region_logic.txt'
];

let successful = false;

for (const logPath of possibleLogs) {
    if (!fs.existsSync(logPath)) continue;
    const content = fs.readFileSync(logPath, 'utf8');
    
    // We are looking for the view_file tool call output for book.html that showed the entire file.
    let startTag = 'File Path: `file:///Users/Bakers/Documents/Websites/My%20Clients/windross-tailoring/windross-tailoring/book.html`\nTotal Lines: 1254\nTotal Bytes: 46202\nShowing lines 1 to 1254';
    
    let startIndex = content.indexOf(startTag);
    if (startIndex !== -1) {
        let codeStart = content.indexOf('1: <!DOCTYPE html>', startIndex);
        let codeEnd = content.indexOf('The above content shows the entire, complete file contents', codeStart);
        
        if (codeStart !== -1 && codeEnd !== -1) {
            let codeBlock = content.substring(codeStart, codeEnd);
            let cleanCode = codeBlock.replace(/^\d+:\s/gm, '');
            fs.writeFileSync('/Users/Bakers/Documents/Websites/My Clients/windross-tailoring/windross-tailoring/book.html', cleanCode);
            console.log('Successfully perfectly restored book.html from ' + logPath);
            successful = true;
            break;
        }
    }
}

if (!successful) console.log("Failed to find a full printout of 1254 lines from the logs.");
