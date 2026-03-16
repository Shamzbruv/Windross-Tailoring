const fs = require('fs');
const path = require('path');

const logDir = '/Users/Bakers/.gemini/antigravity/brain/16973718-5b85-423b-aa7a-77f21c987ef3/.system_generated/logs';
const files = fs.readdirSync(logDir);

for (const file of files) {
  if (file.endsWith('.txt')) {
    const content = fs.readFileSync(path.join(logDir, file), 'utf8');
    
    // Search for a block showing the entire file contents of book.html
    const fileHeaderStrStr = 'File Path: `file:///Users/Bakers/Documents/Websites/My%20Clients/windross-tailoring/windross-tailoring/book.html`';
    
    let index = 0;
    while ((index = content.indexOf(fileHeaderStrStr, index)) !== -1) {
      // Find where the lines start showing
      const linesViewedStart = content.indexOf('Showing lines 1 to', index);
      if (linesViewedStart !== -1 && linesViewedStart - index < 200) {
           const codeStart = content.indexOf('1: ', linesViewedStart);
           const codeEnd = content.indexOf('The above content shows the entire, complete file contents', codeStart);

           if (codeStart !== -1 && codeEnd !== -1) {
               let codeBlock = content.substring(codeStart, codeEnd);
               
               // Strip out line numbers
               let cleanCode = codeBlock.replace(/^\d+:\s/gm, '');

               if (cleanCode.includes('id="view-instore"')) {
                   console.log('Found full backup in log: ' + file + '! Restoring...');
                   fs.writeFileSync('/Users/Bakers/Documents/Websites/My Clients/windross-tailoring/windross-tailoring/book.html', cleanCode);
                   process.exit(0);
               }
           }
      }
      index += fileHeaderStrStr.length;
    }
  }
}

console.log('Failed to find full backup in logs.');
