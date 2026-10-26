/**
 * Kho luu tru cho module (tien ao, cai dat nhom...).
 *
 * Moi bot (moi user_id) co khong gian rieng, cac module khong dam vao nhau
 * qua tien to. Du lieu nam trong bang store cua chinh app.db, nen backup
 * chung voi database.
 */

const { db } = require("../../server/db");

db.exec(`
  CREATE TABLE IF NOT EXISTS module_store (
    owner   INTEGER NOT NULL,
    ns      TEXT NOT NULL,        -- ten module
    key     TEXT NOT NULL,
    value   TEXT,
    PRIMARY KEY (owner, ns, key)
  );
`);

const qGet = db.prepare("SELECT value FROM module_store WHERE owner=? AND ns=? AND key=?");
const qSet = db.prepare(
  "INSERT INTO module_store (owner, ns, key, value) VALUES (?,?,?,?) ON CONFLICT(owner,ns,key) DO UPDATE SET value=excluded.value"
);
const qDel = db.prepare("DELETE FROM module_store WHERE owner=? AND ns=? AND key=?");
const qList = db.prepare("SELECT key, value FROM module_store WHERE owner=? AND ns=?");

/**
 * Tao mot store gan voi (owner = user_id cua bot, ns = ten module).
 * Gia tri tu dong JSON hoa.
 */
function makeStore(owner, ns) {
  return {
    get(key, fallback = null) {
      const row = qGet.get(owner, ns, String(key));
      if (!row) return fallback;
      try {
        return JSON.parse(row.value);
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      qSet.run(owner, ns, String(key), JSON.stringify(value));
      return value;
    },
    del(key) {
      qDel.run(owner, ns, String(key));
    },
    all() {
      const out = {};
      for (const r of qList.all(owner, ns)) {
        try {
          out[r.key] = JSON.parse(r.value);
        } catch (_) {}
      }
      return out;
    },
    /** tien ich cho tien ao: cong/tru so, tra ve so du moi */
    add(key, delta) {
      const cur = Number(this.get(key, 0)) || 0;
      const next = cur + Number(delta || 0);
      this.set(key, next);
      return next;
    },
  };
}

module.exports = { makeStore };
