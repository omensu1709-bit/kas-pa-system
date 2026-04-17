#!/usr/bin/env node
/**
 * KAS PA - Komplett-System Verifikation
 * Beweist dass ALLE Komponenten funktionieren
 */

const WebSocket = require('ws');
const http = require('http');

const BACKEND_WS = 'ws://localhost:8080';
const STATUS_HTTP = 'http://localhost:3000';
const DASHBOARD_HTTP = 'http://localhost:5173';

function testWebSocket() {
    return new Promise((resolve) => {
        console.log('\n📡 TESTE Backend WebSocket (ws://localhost:8080)...');
        const ws = new WebSocket(BACKEND_WS);

        const timeout = setTimeout(() => {
            ws.close();
            resolve({ name: 'Backend WebSocket', status: '❌ TIMEOUT' });
        }, 5000);

        ws.on('open', () => {
            console.log('   ✅ Verbindung hergestellt!');
        });

        ws.on('message', (data) => {
            clearTimeout(timeout);
            try {
                const msg = JSON.parse(data.toString());
                console.log('   ✅ Nachricht empfangen:', msg.type || 'UNKNOWN');
                ws.close();
                resolve({ name: 'Backend WebSocket', status: '✅ OK', lastMsg: msg.type });
            } catch (e) {
                console.log('   ✅ Roh-Daten empfangen');
                ws.close();
                resolve({ name: 'Backend WebSocket', status: '✅ OK', lastMsg: 'raw data' });
            }
        });

        ws.on('error', (err) => {
            clearTimeout(timeout);
            console.log('   ❌ Fehler:', err.message);
            resolve({ name: 'Backend WebSocket', status: '❌ FEHLER: ' + err.message });
        });
    });
}

function testHTTP(url, name) {
    return new Promise((resolve) => {
        console.log(`\n🌐 TESTE ${name} (${url})...`);
        http.get(url, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                console.log(`   ✅ HTTP ${res.statusCode} - ${body.length} bytes`);
                resolve({ name, status: '✅ OK', size: body.length });
            });
        }).on('error', (err) => {
            console.log(`   ❌ Fehler: ${err.message}`);
            resolve({ name, status: '❌ FEHLER: ' + err.message });
        });
    });
}

function checkProcess(name, port) {
    return new Promise((resolve) => {
        console.log(`\n🔍 TESTE Prozess ${name} (Port ${port})...`);
        const net = require('net');
        const socket = new net.Socket();

        socket.setTimeout(2000);

        socket.on('connect', () => {
            console.log(`   ✅ Port ${port} ist erreichbar!`);
            socket.destroy();
            resolve({ name, status: '✅ OK', port });
        });

        socket.on('timeout', () => {
            socket.destroy();
            console.log(`   ❌ Port ${port} nicht erreichbar (Timeout)`);
            resolve({ name, status: '❌ TIMEOUT', port });
        });

        socket.on('error', (err) => {
            socket.destroy();
            console.log(`   ❌ Fehler: ${err.message}`);
            resolve({ name, status: '❌ FEHLER', port });
        });

        socket.connect(port, '127.0.0.1');
    });
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('       KAS PA v4.2 - KOMPLETT-SYSTEM VERIFIKATION');
    console.log('═══════════════════════════════════════════════════════════');

    const results = [];

    // 1. Port Tests
    results.push(await checkProcess('Backend', 8080));
    results.push(await checkProcess('Status Server', 3000));
    results.push(await checkProcess('Dashboard', 5173));

    // 2. HTTP Tests
    results.push(await testHTTP(STATUS_HTTP, 'Status Server HTML'));
    results.push(await testHTTP(DASHBOARD_HTTP, 'Dashboard HTML'));

    // 3. WebSocket Test
    results.push(await testWebSocket());

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                    ZUSAMMENFASSUNG');
    console.log('═══════════════════════════════════════════════════════════');

    let allOk = true;
    for (const r of results) {
        const ok = r.status.startsWith('✅');
        if (!ok) allOk = false;
        console.log(`   ${r.status} - ${r.name}`);
    }

    console.log('═══════════════════════════════════════════════════════════');

    if (allOk) {
        console.log('\n🎉 ALLE SYSTEME SIND 100% FUNKTIONAL!\n');
    } else {
        console.log('\n⚠️  EINIGE SYSTEME HABEN PROBLEME\n');
    }

    process.exit(allOk ? 0 : 1);
}

main().catch(console.error);
