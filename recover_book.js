const fs = require('fs');
const content = fs.readFileSync('/Users/Bakers/.gemini/antigravity/brain/16973718-5b85-423b-aa7a-77f21c987ef3/.system_generated/logs/investigate_in_store_atelier_link.txt', 'utf8');

// I will extract the file from the tool response that printed it earlier in the conversation
const startMarker = 'File Path: `file:///Users/Bakers/Documents/Websites/My%20Clients/windross-tailoring/windross-tailoring/book.html`\nTotal Lines: 1254\nTotal Bytes: 46202\nShowing lines 1 to 1254';

const startIndex = content.indexOf(startMarker);

if (startIndex !== -1) {
    const codeStart = content.indexOf('1: ', startIndex);
    const codeEnd = content.indexOf('The above content shows the entire, complete file contents', codeStart);
    
    if (codeStart !== -1 && codeEnd !== -1) {
        let codeBlock = content.substring(codeStart, codeEnd);
        let cleanCode = codeBlock.replace(/^\d+:\s/gm, '');
        fs.writeFileSync('/Users/Bakers/Documents/Websites/My Clients/windross-tailoring/windross-tailoring/book.html', cleanCode);
        console.log('Restored perfectly from central memory log!');
        process.exit(0);
    }
}
console.log('Could not find the full file dump in the most recent log file. Let me check the others.');

const logDir = '/Users/Bakers/.gemini/antigravity/brain/16973718-5b85-423b-aa7a-77f21c987ef3/.system_generated/logs/';
const files = fs.readdirSync(logDir);

for (const file of files) {
  if (file.endsWith('.txt')) {
    const fileContent = fs.readFileSync(logDir + file, 'utf8');
    const idx = fileContent.indexOf(startMarker);
    if (idx !== -1) {
        const cStart = fileContent.indexOf('1: ', idx);
        const cEnd = fileContent.indexOf('The above content shows the entire, complete file contents', cStart);
        if (cStart !== -1 && cEnd !== -1) {
            let cb = fileContent.substring(cStart, cEnd);
            let cl = cb.replace(/^\d+:\s/gm, '');
            fs.writeFileSync('/Users/Bakers/Documents/Websites/My Clients/windross-tailoring/windross-tailoring/book.html', cl);
            console.log('Restored perfectly from log ' + file + '!');
            process.exit(0);
        }
    }
  }
}
console.log('Could not find it anywhere.');
