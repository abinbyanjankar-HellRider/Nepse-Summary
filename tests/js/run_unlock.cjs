const fs = require('fs');
const { unlock } = require('../../scripts/unlock_core.js');
(async () => {
  const [, , blob, user, pass] = process.argv;
  try {
    const files = await unlock(new Uint8Array(fs.readFileSync(blob)), user, pass);
    console.log(JSON.stringify({ ok: true, files }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, wrong: !!e.wrong, message: e.message }));
  }
})();
