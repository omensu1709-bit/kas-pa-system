/**
 * Debug: Check Perspective module exports and custom element registration
 */

import axios from 'axios';

async function main() {
  console.log('=== MODULE DEBUG ===\n');

  // 1. Check perspective-viewer module
  console.log('[1] Checking perspective-viewer module exports...');
  try {
    const response = await axios.get('http://localhost:5173/node_modules/@finos/perspective-viewer/dist/esm/perspective-viewer.js', { timeout: 5000 });
    console.log(`    Module found: ${response.data.length} bytes`);

    // Check if it contains customElements.define
    if (response.data.includes('customElements.define')) {
      console.log('    Contains: customElements.define');
    } else {
      console.log('    NO customElements.define found');
    }

    // Check what it exports
    if (response.data.includes('export')) {
      console.log('    Contains: export statements');
    }
  } catch (e: any) {
    console.log(`    ERROR: ${e.message}`);
  }

  // 2. Check perspective (core) module
  console.log('\n[2] Checking perspective core module...');
  try {
    const response = await axios.get('http://localhost:5173/node_modules/@finos/perspective/dist/esm/perspective.js', { timeout: 5000 });
    console.log(`    Module found: ${response.data.length} bytes`);

    // Check exports
    if (response.data.includes('export')) {
      console.log('    Contains: export statements');
    }
    if (response.data.includes('worker')) {
      console.log('    Contains: worker function');
    }
  } catch (e: any) {
    console.log(`    ERROR: ${e.message}`);
  }

  // 3. List perspective packages
  console.log('\n[3] Checking installed perspective packages...');
  const packages = [
    '@finos/perspective',
    '@finos/perspective-viewer',
    '@finos/perspective-viewer-datagrid',
    '@finos/perspective-viewer-hypergrid',
  ];

  for (const pkg of packages) {
    try {
      const response = await axios.head(`http://localhost:5173/node_modules/${pkg}/package.json`, { timeout: 5000 });
      console.log(`    ${pkg}: ${response.status}`);
    } catch (e: any) {
      console.log(`    ${pkg}: ${e.response?.status || e.message}`);
    }
  }

  // 4. Check CSS file
  console.log('\n[4] Checking CSS file...');
  try {
    const response = await axios.head('http://localhost:5173/node_modules/@finos/perspective-viewer/dist/css/pro.css', { timeout: 5000 });
    console.log(`    pro.css: ${response.status}`);
  } catch (e: any) {
    console.log(`    pro.css: ${e.response?.status || e.message}`);
  }
}

main().catch(console.error);
