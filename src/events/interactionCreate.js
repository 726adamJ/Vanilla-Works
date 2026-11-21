const fs = require('fs');
const path = require('path');
const Module = require('module');

const dir = path.join(__dirname, 'ic_parts');
const code = ['c1.js', 'c2.js', 'c3.js']
  .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
  .join('');

const m = new Module(path.join(__dirname, 'interactionCreate.full.js'));
m.filename = path.join(__dirname, 'interactionCreate.full.js');
m.paths = module.paths;
m._compile(code, m.filename);
module.exports = m.exports;
