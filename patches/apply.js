#!/usr/bin/env node
/**
 * Postinstall script to patch node-dcom with critical bug fixes.
 * Fixes NTLM authentication issues for Node.js 18+ compatibility.
 */

const fs = require('fs');
const path = require('path');

const patches = [
    {
        src: path.join(__dirname, 'node-dcom', 'responses.js'),
        dst: path.join(__dirname, '..', 'node_modules', 'node-dcom', 'dcom', 'rpc', 'security', 'responses.js')
    },
    {
        src: path.join(__dirname, 'node-dcom', 'type3message.js'),
        dst: path.join(__dirname, '..', 'node_modules', 'node-dcom', 'dcom', 'rpc', 'security', 'messages', 'type3message.js')
    }
];

let patched = 0;
for (const p of patches) {
    try {
        if (fs.existsSync(p.src)) {
            fs.copyFileSync(p.src, p.dst);
            patched++;
            console.log(`  Patched: ${path.basename(p.dst)}`);
        }
    } catch (e) {
        console.warn(`  Warning: Could not patch ${path.basename(p.dst)}: ${e.message}`);
    }
}

if (patched > 0) {
    console.log(`node-red-contrib-opc-da: Applied ${patched} patch(es) to node-dcom`);
}
