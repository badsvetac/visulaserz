import fs from 'node:fs/promises';
import { parse } from 'acorn';

// Keep GLSL token boundaries and preprocessor newlines intact. No runtime decoder,
// name/property mangling or control-flow rewriting is added to the render loop.
export function compactShader(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\r\n]*/g, '')
    .split(/\r?\n/).map(line => line.trim().replace(/[\t ]+/g, ' ')).filter(Boolean).join('\n') + '\n';
}

export const shaderPlugin = {
  name: 'compact-static-glsl',
  setup(build) {
    build.onLoad({ filter: /(?:[\\/]scenes[\\/][a-z0-9-]+|[\\/]gfx[\\/](?:glsl|scene-kit))\.js$/ }, async args => {
      let contents = await fs.readFile(args.path, 'utf8');
      const edits = [];
      function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'TemplateLiteral' && !node.expressions.length) {
          const text = node.quasis[0].value.cooked;
          if (text && /#version|\bvoid\s+main\s*\(|\b(?:uniform|vec[234])\s+\w/.test(text)) {
            edits.push({ start: node.start, end: node.end, text: JSON.stringify(compactShader(text)) });
          }
          return;
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach(visit);
          else if (value && typeof value === 'object') visit(value);
        }
      }
      visit(parse(contents, { ecmaVersion: 'latest', sourceType: 'module' }));
      for (const edit of edits.sort((a, b) => b.start - a.start)) contents = contents.slice(0, edit.start) + edit.text + contents.slice(edit.end);
      return { contents, loader: 'js' };
    });
  },
};
