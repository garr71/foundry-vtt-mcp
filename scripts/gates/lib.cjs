const net = require('net');
function call(name, args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(31414, '127.0.0.1');
    let buf = '';
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('timeout')); }, timeoutMs);
    sock.on('connect', () =>
      sock.write(JSON.stringify({ id: 'g', method: 'call_tool', params: { name, args } }) + '\n'));
    sock.on('data', (d) => {
      buf += d.toString();
      const i = buf.indexOf('\n');
      if (i === -1) return;
      clearTimeout(timer); sock.destroy();
      const r = JSON.parse(buf.slice(0, i));
      try { resolve(JSON.parse(r.result.content[0].text)); }
      catch { resolve({ __raw: r.result?.content?.[0]?.text, __isError: r.result?.isError }); }
    });
    sock.on('error', reject);
  });
}
function listTools(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(31414, '127.0.0.1');
    let buf = '';
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('timeout')); }, timeoutMs);
    sock.on('connect', () => sock.write(JSON.stringify({ id: 'p', method: 'list_tools', params: {} }) + '\n'));
    sock.on('data', (d) => {
      buf += d.toString();
      const i = buf.indexOf('\n');
      if (i === -1) return;
      clearTimeout(timer); sock.destroy();
      resolve(JSON.parse(buf.slice(0, i)));
    });
    sock.on('error', reject);
  });
}
module.exports = { call, listTools };
