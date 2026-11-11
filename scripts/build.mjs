// Derleme: once musteri goruntuleyicisi tek dosyaya paketlenir, sonra Studyo onu metin olarak icine alir
// (boylece "Musteri dosyasi indir" kendi basina calisan tek bir HTML uretebilir).
import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';

await mkdir('build', { recursive: true });
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/viewer.js'], bundle: true, format: 'esm', minify: true, outfile: 'build/viewer.bundle.txt' });
await build({ entryPoints: ['src/studio.js'], bundle: true, format: 'esm', minify: true, loader: { '.txt': 'text' }, outfile: 'dist/app.js' });
await copyFile('src/index.html', 'dist/index.html');
console.log('dist/ hazır');
