const fs = require('fs');

// The actual path
const logDir = '/Users/Bakers/.gemini/antigravity/brain/16973718-5b85-423b-aa7a-77f21c987ef3/.system_generated/logs/';

if (!fs.existsSync(logDir)) {
    console.log("No log dir found!");
    process.exit(1);
}

const files = fs.readdirSync(logDir);

let bestFile = null;
let maxLines = 0;
let bestContent = '';

for (const file of files) {
  if (file.endsWith('.txt')) {
    const fileContent = fs.readFileSync(logDir + file, 'utf8');
    
    // Look for all occurrences of the file view output
    const startMarker = 'File Path: `file:///Users/Bakers/Documents/Websites/My%20Clients/windross-tailoring/windross-tailoring/book.html`';
    let idx = 0;
    
    while ((idx = fileContent.indexOf(startMarker, idx)) !== -1) {
        let linesInfoStart = fileContent.indexOf('Total Lines: ', idx);
        if (linesInfoStart !== -1 && linesInfoStart - idx < 200) {
            let nLinesStr = fileContent.substring(linesInfoStart + 13, fileContent.indexOf('\n', linesInfoStart));
            let numLines = parseInt(nLinesStr.trim());
            
            if (numLines > maxLines) {
                 // Try to extract the block
                 const cStart = fileContent.indexOf('1: ', linesInfoStart);
                 const cEnd = fileContent.indexOf('The above content shows the entire, complete file contents', cStart);
                 if (cStart !== -1 && cEnd !== -1 && cEnd - cStart > 1000) {
                     maxLines = numLines;
                     bestFile = file;
                     
                     let cb = fileContent.substring(cStart, cEnd);
                     bestContent = cb.replace(/^\d+:\s/gm, '');
                 }
            }
        }
        idx += startMarker.length;
    }
  }
}

if (bestFile) {
    console.log(`Found a version in ${bestFile} with ${maxLines} lines! Restoring.`);
    fs.writeFileSync('/Users/Bakers/Documents/Websites/My Clients/windross-tailoring/windross-tailoring/book.html', bestContent);
    process.exit(0);
} else {
    console.log("Could not find any suitable version.");
}

