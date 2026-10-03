'use strict';
// Reads the NSD2 bundle written by scripts/build_site.py (format described there).
// Pure WebCrypto: no DOM, so the same file runs in the browser and under Node tests.
(function (root) {
  const enc = new TextEncoder();
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const wrong = () => { const e = new Error('Wrong username or passphrase.'); e.wrong = true; return e; };

  async function unlock(bytes, username, password) {
    if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'NSD2') throw new Error('Unrecognised bundle format. Reload the page.');
    const hlen = new DataView(bytes.buffer, bytes.byteOffset).getUint32(4);
    if (8 + hlen + 12 > bytes.length) throw new Error('The encrypted bundle is damaged.');
    const prefix = bytes.subarray(0, 8 + hlen);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + hlen)));
    const name = username.normalize('NFKC').trim().toLowerCase();
    const sid = hex(await crypto.subtle.digest('SHA-256', enc.encode(name)));
    const slot = header.slots.find(s => s.id === sid);
    if (!slot) throw wrong();
    if (!Number.isInteger(slot.it) || slot.it < 1 || slot.it > 5000000) throw new Error('The encrypted bundle is damaged.');
    const pw = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    const kek = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(slot.salt), iterations: slot.it },
      pw, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    let dkRaw;
    try {
      dkRaw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(slot.iv), additionalData: enc.encode('NSD2-slot:' + sid) },
        kek, b64(slot.wk));
    } catch (e) { throw wrong(); }
    const dk = await crypto.subtle.importKey('raw', dkRaw, 'AES-GCM', false, ['decrypt']);
    let plain;
    try {
      plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(prefix.length, prefix.length + 12), additionalData: prefix },
        dk, bytes.subarray(prefix.length + 12));
    } catch (e) { throw new Error('The encrypted bundle was modified or is damaged.'); }
    const text = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(text);
  }

  root.UnlockCore = { unlock };
  if (typeof module !== 'undefined') module.exports = root.UnlockCore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
