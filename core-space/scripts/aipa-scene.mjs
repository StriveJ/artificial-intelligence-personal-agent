// scene
function arg(name){ const i=process.argv.indexOf('--'+name); return i>=0 ? process.argv[i+1] : ''; }
const text=arg('text')||'';
const fileType=arg('file-type')||'';
if(/bookkeeping|fitness|health|\u8bb0\u8d26|\u5065\u8eab|\u5065\u5eb7/i.test(text)) console.log('life');
else if(/study|learning|notes|\u5b66\u4e60|\u7b14\u8bb0/i.test(text)||fileType==='.md') console.log('study');
else console.log('work');
