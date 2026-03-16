const fs = require('fs');

const path = 'book.html';
const content = fs.readFileSync(path, 'utf8');

// The multi_replace removed everything from line 754 to 1121 and replaced it with a tiny snippet.
// I will check out the last logged version from before my edit, we can grab it from my cache or git if I init one. Wait, let's see if there's an original version we can pull from the system logs if not.
// Since I over-wrote it, I'll gracefully reconstruct the `view-measurements` and `view-instore` <div>s that got deleted.
