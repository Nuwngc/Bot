/**
 * Adapter cho @dongdev/fca-unofficial (thay ws3-fca da ngung cap nhat).
 *
 * BAO MAT - doc truoc khi sua:
 * Thu vien nay mac dinh:
 *   - autoUpdate/checkUpdate.install = true  -> tu `npm install` phien ban moi
 *     trong luc dang chay. Server nay giu cookie cua moi nguoi thue, nen khong
 *     the de code la tu cai vao ma khong ai xem.
 *   - autoLogin + apiServer -> khi co email/mat khau trong config, se GUI
 *     email + mat khau + ma 2FA toi may chu rieng cua tac gia thu vien.
 * Ham lockConfig() ben duoi ghi de fca-config.json de tat het cac muc nay
 * truoc moi lan dang nhap.
 */

const fs = require("fs");
const path = require("path");

const LOCKED_CONFIG = {
  autoUpdate: false,
  checkUpdate: { enabled: false, install: false, notifyIfCurrent: false },
  mqtt: { enabled: true, reconnectInterval: 3600 },
  autoLogin: false,
  apiServer: "",
  apiKey: "",
  credentials: { email: "", password: "", twofactor: "" },
  antiGetInfo: { AntiGetThreadInfo: false, AntiGetUserInfo: false },
  remoteControl: { enabled: false, url: "", token: "", autoReconnect: false },
  threadCache: { maxAgeMs: 900000, invalidateIntervalMs: 900000 },
};

function lockConfig() {
  const p = path.join(process.cwd(), "fca-config.json");
  fs.writeFileSync(p, JSON.stringify(LOCKED_CONFIG, null, 2) + "\n", "utf8");
}

/**
 * Thu vien tu sao luu cookie cua MOI tai khoan dang van ban tho vao
 * ./Fca_Database/database.sqlite (duong dan viet cung, khong co cong tat).
 * Dieu do vo hieu hoa lop ma hoa AES cua panel.
 *
 * Cach chan: tao san bang app_state_backups voi trigger RAISE(IGNORE) cho
 * INSERT va UPDATE. Moi lenh ghi backup bi SQLite bo qua, cookie khong bao
 * gio duoc luu. Dong thoi xoa sach du lieu cu va VACUUM de khong con sot
 * lai trong cac trang da giai phong cua file.
 */
function neuterBackups() {
  try {
    const { DatabaseSync } = require("node:sqlite");
    const dir = path.join(process.cwd(), "Fca_Database");
    fs.mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, "database.sqlite"));
    db.exec(`
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS app_state_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userID VARCHAR(255), type VARCHAR(255), data TEXT,
        createdAt DATETIME, updatedAt DATETIME
      );
      DELETE FROM app_state_backups;
      CREATE TRIGGER IF NOT EXISTS no_backup_insert
        BEFORE INSERT ON app_state_backups BEGIN SELECT RAISE(IGNORE); END;
      CREATE TRIGGER IF NOT EXISTS no_backup_update
        BEFORE UPDATE ON app_state_backups BEGIN SELECT RAISE(IGNORE); END;
    `);
    db.exec("VACUUM");
    db.close();
  } catch (e) {
    console.error("[fca] Khong chan duoc backup cookie cua thu vien:", e?.message || e);
  }
}

// Khoa config va chan backup TRUOC khi nap thu vien
lockConfig();
neuterBackups();
const fca = require("@dongdev/fca-unofficial");
const login = typeof fca === "function" ? fca : fca.login;

const OPTIONS = {
  listenEvents: true,
  selfListen: false,
  autoMarkRead: true,
  online: false,
  updatePresence: false,
  autoReconnect: true,
};

function getUserInfo(api, id) {
  return new Promise((resolve, reject) => {
    try {
      const r = api.getUserInfo(id, (err, data) => (err ? reject(err) : resolve(data)));
      if (r && typeof r.then === "function") r.then(resolve, reject);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * @param {object}   opts
 * @param {Array}    opts.appState  mang cookie {key,value,...}
 * @param {function} opts.onLog
 */
function createAdapter({ appState, onLog = () => {} }) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(appState) || appState.length === 0) {
      return reject(new Error("appState rong hoac sai dinh dang (can mang cookie)."));
    }

    lockConfig();
    neuterBackups();

    // Chi truyen appState - KHONG bao gio truyen email/password vao day
    login({ appState }, OPTIONS, async (err, api) => {
      if (err) {
        const m = err?.error || err?.message || String(err);
        return reject(new Error(`Dang nhap that bai: ${m}`));
      }

      const botId = String(api.getCurrentUserID());
      const nameCache = new Map();
      let emitter = null;

      // Xac minh phien con song bang mot request that
      let selfName;
      try {
        const info = await getUserInfo(api, botId);
        selfName = info?.[botId]?.name;
        if (!selfName) throw new Error("khong lay duoc ten tai khoan");
        nameCache.set(botId, selfName);
      } catch (e) {
        return reject(
          new Error(
            "Cookie khong dung hoac da het han. Dang nhap lai tren trinh duyet, lay cookie moi va dan lai. (" +
              (e?.message || e) +
              ")"
          )
        );
      }

      async function getName(userId) {
        if (nameCache.has(userId)) return nameCache.get(userId);
        try {
          const info = await getUserInfo(api, userId);
          const name = info?.[userId]?.name || "Ban";
          nameCache.set(userId, name);
          return name;
        } catch (_) {
          return "Ban";
        }
      }

      async function send(threadId, text, opts = {}) {
        const payload = typeof text === "string" ? { body: text } : { ...text };
        if (opts.mentions) payload.mentions = opts.mentions;
        try {
          // Chu ky kieu cu: (msg, threadID, callback, replyToMessage)
          return await api.sendMessage(payload, threadId, undefined, opts.replyTo);
        } catch (e) {
          onLog("error", `Gui that bai toi ${threadId}: ${e?.message || e?.error || e}`);
        }
      }

      // Boc callback -> Promise cho cac ham nhom
      const p = (fn, ...args) =>
        new Promise((resolve, reject) => {
          try {
            fn(...args, (err, data) => (err ? reject(err) : resolve(data)));
          } catch (e) {
            reject(e);
          }
        });

      const groupApi = {
        addUser: (userId, threadId) => p(api.addUserToGroup, userId, threadId),
        removeUser: (userId, threadId) => p(api.removeUserFromGroup, userId, threadId),
        threadInfo: (threadId) => p(api.getThreadInfo, threadId),
      };

      resolve({
        botId,
        selfName,
        raw: api,
        send,
        dm: (userId, text) => send(userId, text),
        getName,

        async onMessage(handler) {
          emitter = api.listenMqtt(async (e, event) => {
            if (e) return onLog("error", `listen: ${e?.error || e?.message || e?.type || e}`);
            if (!event) return;

            // Su kien nhom: them/bot thanh vien
            if (event.type === "event" || event.type === "log:subscribe" || event.type === "log:unsubscribe") {
              const lmt = event.logMessageType || event.type;
              const data = event.logMessageData || event.logMessageData || {};
              let kind = null;
              if (lmt === "log:subscribe") kind = "join";
              else if (lmt === "log:unsubscribe") kind = "leave";
              if (kind) {
                try {
                  handler({
                    isEvent: true,
                    kind,
                    threadId: String(event.threadID),
                    authorId: String(event.author || ""),
                    // join: danh sach nguoi vua them; leave: nguoi vua roi
                    addedIds: (data.addedParticipants || []).map((p) => String(p.userFbId || p.userID || p)),
                    leftId: data.leftParticipantFbId ? String(data.leftParticipantFbId) : null,
                  });
                } catch (err) {
                  onLog("error", `event handler: ${err?.message || err}`);
                }
              }
              return;
            }

            if (event.type !== "message" && event.type !== "message_reply") return;
            if (!event.body) return;
            if (String(event.senderID) === botId) return;

            const mentionedIds = Object.keys(event.mentions || {});
            const threadId = String(event.threadID);
            const senderId = String(event.senderID);

            try {
              handler({
                threadId,
                senderId,
                senderName: await getName(senderId),
                text: String(event.body).trim(),
                messageId: event.messageID,
                isGroup: event.isGroup ?? threadId !== senderId,
                mentionedIds,
                mentionsBot: mentionedIds.includes(botId),
              });
            } catch (err) {
              onLog("error", `handler: ${err?.message || err}`);
            }
          });
        },

        stop() {
          try {
            if (emitter?.stopListeningAsync) emitter.stopListeningAsync().catch(() => {});
            else if (emitter?.stopListening) emitter.stopListening();
            else if (typeof emitter === "function") emitter();
          } catch (_) {}
        },
      });
    });
  });
}

module.exports = { createAdapter, lockConfig, neuterBackups, LOCKED_CONFIG };
