const ts=require('typescript');
const fs=require('fs');
const src=fs.readFileSync('src/content/guide.ts','utf8');
const out=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const m={exports:{}};new Function('module','exports',out)(m,m.exports);
fs.writeFileSync('scripts/.guide.json',JSON.stringify(m.exports));
console.log(Object.keys(m.exports));
