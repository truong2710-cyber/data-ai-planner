const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync('Data AI program planner_files/data.js', 'utf8'), context, {timeout: 1000});
const data = context.DATA_AI;
assert(data && Array.isArray(data.courses) && data.courses.length > 0);
assert.equal(new Set(data.courses.map(c => c.code)).size, data.courses.length);
for (const c of data.courses) {
  assert(typeof c.code === 'string' && c.code && typeof c.name === 'string');
  assert(Number.isFinite(c.ects) && c.ects >= 0);
  assert(Array.isArray(c.events));
  assert.equal(c.has_cal, c.events.length > 0);
  for (const e of c.events) {
    assert(Number.isFinite(Date.parse(e.s)) && Number.isFinite(Date.parse(e.e)));
    assert(e.s < e.e, `Invalid interval for ${c.code}`);
  }
}
for (const level of Object.values(data.rules)) {
  for (const codes of Object.values(level.mandatory_groups)) {
    for (const code of codes) assert(data.courses.some(c => c.code === code), `Missing mandatory course ${code}`);
  }
}
console.log(`Validated ${data.courses.length} courses and ${data.courses.reduce((n,c)=>n+c.events.length,0)} sessions.`);
