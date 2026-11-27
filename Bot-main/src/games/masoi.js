/**
 * MA SOI - ban mo rong (them Tho san, Phu thuy, Cupid)
 *
 * Vong doi: LOBBY -> NIGHT -> DAY -> VOTE -> NIGHT -> ... -> ENDED
 * Hanh dong dem gui qua TIN NHAN RIENG voi bot.
 */

const NIGHT_MS = Number(process.env.MASOI_NIGHT || 70) * 1000;
const DAY_MS = Number(process.env.MASOI_DAY || 90) * 1000;
const VOTE_MS = Number(process.env.MASOI_VOTE || 60) * 1000;
const MIN_PLAYERS = Number(process.env.MASOI_MIN || 4);

const ROLE = {
  SOI: "Sói", DAN: "Dân làng", TIEN_TRI: "Tiên tri", BAO_VE: "Bảo vệ",
  THO_SAN: "Thợ săn", PHU_THUY: "Phù thủy", CUPID: "Cupid",
};

const ROLE_DESC = {
  [ROLE.SOI]: "Mỗi đêm cùng bầy chọn một người để cắn.",
  [ROLE.DAN]: "Không có năng lực. Thắng khi diệt hết sói.",
  [ROLE.TIEN_TRI]: "Mỗi đêm soi một người để biết họ có phải sói không.",
  [ROLE.BAO_VE]: "Mỗi đêm bảo vệ một người. Không bảo vệ cùng một người hai đêm liền.",
  [ROLE.THO_SAN]: "Khi bạn chết, bạn được bắn chết theo một người.",
  [ROLE.PHU_THUY]: "Bạn có 1 bình cứu và 1 bình độc, mỗi loại dùng một lần cả ván.",
  [ROLE.CUPID]: "Đêm đầu bạn ghép đôi hai người yêu nhau; một người chết thì người kia chết theo.",
};

function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function startMaSoi(msg, adapter, { dmRoutes, onEnd, prefix = "!" }) {
  const PREFIX = prefix;
  const threadId = msg.threadId;
  const hostId = msg.senderId;

  let phase = "LOBBY";
  let players = [];
  let timer = null;
  let night = 0;
  let lastProtected = null;
  let nightActions = {};
  let votes = {};
  let lovers = null;
  let cupidDone = false;
  let witch = { heal: true, poison: true };
  let pendingHunter = null;

  const alive = () => players.filter((p) => p.alive);
  const wolves = () => alive().filter((p) => p.role === ROLE.SOI);
  const byId = (id) => players.find((p) => p.id === id);
  const has = (role) => alive().some((p) => p.role === role);

  const roster = (list = alive()) => list.map((p, i) => `${i + 1}. ${p.name}`).join("\n");
  function targetFrom(args, list) {
    const n = parseInt(args[0], 10);
    if (!n || n < 1 || n > list.length) return null;
    return list[n - 1];
  }
  function setTimer(fn, ms) {
    clearTimeout(timer);
    timer = setTimeout(() => fn().catch(console.error), ms);
  }

  async function announceLobby() {
    await adapter.send(threadId,
      `MA SÓI - phòng đã mở!\n\n${PREFIX}join để vào phòng\n${PREFIX}start để bắt đầu (cần ít nhất ${MIN_PLAYERS} người)\n${PREFIX}stop để huỷ\n\nLƯU Ý: bot nhắn riêng cho bạn vai trò và hành động đêm. Hãy nhắn cho bot một câu trước khi chơi.`);
  }

  async function join(m) {
    if (phase !== "LOBBY") return true;
    if (byId(m.senderId)) { await adapter.send(threadId, `${m.senderName} đã ở trong phòng.`); return true; }
    players.push({ id: m.senderId, name: m.senderName, role: null, alive: true });
    await adapter.send(threadId, `${m.senderName} đã vào. (${players.length} người)\n${roster(players)}`);
    return true;
  }

  async function begin(m) {
    if (phase !== "LOBBY") return true;
    if (m.senderId !== hostId && !byId(m.senderId)) return true;
    if (players.length < MIN_PLAYERS) {
      await adapter.send(threadId, `Cần ít nhất ${MIN_PLAYERS} người. Đang có ${players.length}.`); return true;
    }
    assignRoles();
    await adapter.send(threadId, `Ván bắt đầu với ${players.length} người!\nSố sói: ${wolves().length}\n\nKiểm tra tin nhắn riêng để biết vai trò.`);
    await sendRoles();
    await toNight();
    return true;
  }

  function assignRoles() {
    const n = players.length;
    const nSoi = Math.max(1, Math.floor(n / 4));
    const roles = Array(nSoi).fill(ROLE.SOI);
    if (n >= 5) roles.push(ROLE.TIEN_TRI);
    if (n >= 6) roles.push(ROLE.BAO_VE);
    if (n >= 7) roles.push(ROLE.THO_SAN);
    if (n >= 8) roles.push(ROLE.PHU_THUY);
    if (n >= 9) roles.push(ROLE.CUPID);
    while (roles.length < n) roles.push(ROLE.DAN);
    const shuffled = shuffle(roles);
    players.forEach((p, i) => { p.role = shuffled[i]; dmRoutes.set(p.id, game); });
  }

  async function sendRoles() {
    const wolfNames = wolves().map((w) => w.name).join(", ");
    await Promise.all(players.map((p) => {
      let text = `Vai trò của bạn: ${p.role.toUpperCase()}\n${ROLE_DESC[p.role]}`;
      if (p.role === ROLE.SOI && wolves().length > 1) text += `\n\nĐồng đội: ${wolfNames}`;
      return adapter.dm(p.id, text).catch(() => {});
    }));
  }

  async function toNight() {
    phase = "NIGHT";
    night++;
    nightActions = { kill: {}, protect: null, seer: null, witchHeal: false, witchHealTarget: null, witchPoison: null };
    const list = alive();
    await adapter.send(threadId, `--- ĐÊM ${night} ---\nCả làng đi ngủ. Người có chức năng kiểm tra tin nhắn riêng.\nCòn sống (${list.length}):\n${roster(list)}`);
    const menu = (verb, cmd) => `ĐÊM ${night}. ${verb}\n${roster(list)}\n\nGõ: ${PREFIX}${cmd} <số>`;
    await Promise.all(list.map((p) => {
      if (p.role === ROLE.SOI) return adapter.dm(p.id, menu("Chọn người để cắn:", "kill")).catch(() => {});
      if (p.role === ROLE.TIEN_TRI) return adapter.dm(p.id, menu("Chọn người để soi:", "soi")).catch(() => {});
      if (p.role === ROLE.BAO_VE) return adapter.dm(p.id, menu("Chọn người để bảo vệ:", "bv")).catch(() => {});
      if (p.role === ROLE.CUPID && night === 1 && !cupidDone)
        return adapter.dm(p.id, `ĐÊM 1. Ghép đôi yêu nhau:\n${roster(list)}\n\n${PREFIX}gheptinh <số1> <số2>`).catch(() => {});
      if (p.role === ROLE.PHU_THUY) {
        let t = `ĐÊM ${night}. Phù thuỷ.\n`;
        t += witch.heal ? `${PREFIX}cuu - cứu người bị cắn đêm nay\n` : "(đã dùng bình cứu)\n";
        t += witch.poison ? `${PREFIX}doc <số> - đầu độc một người\n${roster(list)}` : "(đã dùng bình độc)";
        return adapter.dm(p.id, t).catch(() => {});
      }
      return null;
    }));
    setTimer(resolveNight, NIGHT_MS);
  }

  async function resolveNight() {
    if (phase !== "NIGHT") return;
    clearTimeout(timer);
    const tally = {};
    for (const t of Object.values(nightActions.kill)) tally[t] = (tally[t] || 0) + 1;
    let victimId = null, best = 0;
    for (const [id, c] of Object.entries(tally)) if (c > best) { best = c; victimId = id; }
    const deaths = new Set();
    if (victimId) {
      const saved = victimId === nightActions.protect || (nightActions.witchHeal && nightActions.witchHealTarget === victimId);
      if (!saved) deaths.add(victimId);
    }
    if (nightActions.witchPoison) deaths.add(nightActions.witchPoison);
    lastProtected = nightActions.protect;
    await adapter.send(threadId, `--- SÁNG NGÀY ${night} ---`);
    await applyDeaths(deaths, "đêm qua");
    if (phase === "ENDED") return;
    if (await checkWin()) return;
    if (pendingHunter) return;
    await toDay();
  }

  async function applyDeaths(idSet, when) {
    const queue = [...idSet];
    const dead = [];
    while (queue.length) {
      const id = queue.shift();
      const p = byId(id);
      if (!p || !p.alive) continue;
      p.alive = false;
      dmRoutes.delete(p.id);
      dead.push(p);
      if (lovers && lovers.includes(id)) {
        const otherId = lovers[0] === id ? lovers[1] : lovers[0];
        const other = byId(otherId);
        if (other && other.alive) {
          queue.push(otherId);
          await adapter.send(threadId, `💔 ${other.name} là người yêu của ${p.name}, sẽ chết theo.`);
        }
      }
      if (p.role === ROLE.THO_SAN) pendingHunter = p.id;
    }
    if (dead.length === 0) await adapter.send(threadId, `Không ai chết ${when}.`);
    else await adapter.send(threadId, dead.map((p) => `☠️ ${p.name} đã chết. Vai trò: ${p.role}.`).join("\n"));

    if (pendingHunter) {
      const h = byId(pendingHunter);
      dmRoutes.set(h.id, game);
      const list = alive();
      await adapter.send(threadId, `${h.name} là THỢ SĂN! Chờ thợ săn chọn bắn một người (nhắn riêng cho bot).`);
      await adapter.dm(h.id, `Bạn chết nhưng được bắn theo một người:\n${roster(list)}\n\n${PREFIX}ban <số>  (hoặc ${PREFIX}ban 0 để bỏ qua)`).catch(() => {});
      setTimer(async () => { await finishHunter(null); }, 45 * 1000);
    }
  }

  async function finishHunter(targetId) {
    if (!pendingHunter) return;
    const h = byId(pendingHunter);
    pendingHunter = null;
    dmRoutes.delete(h.id);
    if (targetId) {
      const t = byId(targetId);
      if (t && t.alive) {
        await adapter.send(threadId, `🏹 ${h.name} bắn chết ${t.name}.`);
        await applyDeaths(new Set([targetId]), "");
      }
    } else {
      await adapter.send(threadId, `${h.name} không bắn ai.`);
    }
    if (phase === "ENDED") return;
    if (await checkWin()) return;
    if (pendingHunter) return;
    if (phase === "NIGHT") await toDay();
    else if (phase === "VOTE") await toNight();
  }

  async function toDay() {
    phase = "DAY";
    const list = alive();
    await adapter.send(threadId, `Thảo luận ${DAY_MS / 1000}s. Còn sống (${list.length}):\n${roster(list)}`);
    setTimer(toVote, DAY_MS);
  }

  async function toVote() {
    phase = "VOTE";
    votes = {};
    const list = alive();
    await adapter.send(threadId, `--- BỎ PHIẾU ---\n${roster(list)}\n\nGõ ${PREFIX}vote <số> để treo cổ. ${VOTE_MS / 1000}s.`);
    setTimer(resolveVote, VOTE_MS);
  }

  async function vote(args, m) {
    if (phase !== "VOTE") return true;
    const voter = byId(m.senderId);
    if (!voter || !voter.alive) return true;
    const list = alive();
    const target = targetFrom(args, list);
    if (!target) { await adapter.send(threadId, `Số không hợp lệ. ${PREFIX}vote 1..${list.length}`); return true; }
    votes[voter.id] = target.id;
    await adapter.send(threadId, `${voter.name} bỏ phiếu cho ${target.name}. (${Object.keys(votes).length}/${list.length})`);
    if (Object.keys(votes).length >= list.length) await resolveVote();
    return true;
  }

  async function resolveVote() {
    if (phase !== "VOTE") return;
    clearTimeout(timer);
    const tally = {};
    for (const t of Object.values(votes)) tally[t] = (tally[t] || 0) + 1;
    let top = [], best = 0;
    for (const [id, c] of Object.entries(tally)) {
      if (c > best) { best = c; top = [id]; } else if (c === best) top.push(id);
    }
    if (top.length !== 1 || best === 0) await adapter.send(threadId, "Phiếu hoà hoặc không ai bỏ phiếu. Không ai bị treo cổ.");
    else { await adapter.send(threadId, "Làng quyết định treo cổ..."); await applyDeaths(new Set([top[0]]), ""); }
    if (phase === "ENDED") return;
    if (await checkWin()) return;
    if (pendingHunter) return;
    await toNight();
  }

  async function checkWin() {
    if (lovers) {
      const a = byId(lovers[0]), b = byId(lovers[1]);
      if (a?.alive && b?.alive && alive().length === 2)
        return end(`💞 CẶP ĐÔI YÊU NHAU THẮNG! ${a.name} và ${b.name} là hai người cuối cùng.`);
    }
    const w = wolves().length;
    const v = alive().length - w;
    if (w === 0) return end("DÂN LÀNG THẮNG! Toàn bộ sói đã bị tiêu diệt.");
    if (w >= v) return end("PHE SÓI THẮNG! Số sói đã bằng hoặc vượt số dân.");
    return false;
  }

  async function end(text) {
    phase = "ENDED";
    clearTimeout(timer);
    const reveal = players.map((p) => `${p.name}: ${p.role}${p.alive ? "" : " (chết)"}`).join("\n");
    await adapter.send(threadId, `${text}\n\n--- VAI TRÒ ---\n${reveal}`);
    for (const p of players) dmRoutes.delete(p.id);
    onEnd();
    return true;
  }

  const game = {
    name: "masoi",
    async handle() { return false; },
    async command(cmd, args, m) {
      switch (cmd) {
        case "join": return join(m);
        case "start": return begin(m);
        case "vote": return vote(args, m);
        default: return false;
      }
    },
    async handleDM(m) {
      if (!m.text.startsWith(PREFIX)) return false;
      const [cmd, ...args] = m.text.slice(PREFIX.length).trim().split(/\s+/);
      const me = byId(m.senderId);
      if (!me) return false;

      if (cmd === "ban" && pendingHunter === me.id) {
        const n = parseInt(args[0], 10);
        if (n === 0) { await finishHunter(null); return true; }
        const list = alive();
        const t = targetFrom(args, list);
        if (!t) { await adapter.dm(me.id, `Số không hợp lệ. Chọn 1..${list.length} hoặc 0.`); return true; }
        await finishHunter(t.id);
        return true;
      }

      if (cmd === "gheptinh" && me.role === ROLE.CUPID && night === 1 && !cupidDone) {
        const list = alive();
        const a = list[parseInt(args[0], 10) - 1];
        const b = list[parseInt(args[1], 10) - 1];
        if (!a || !b || a.id === b.id) { await adapter.dm(me.id, "Chọn hai số khác nhau."); return true; }
        lovers = [a.id, b.id]; cupidDone = true;
        await adapter.dm(me.id, `Đã ghép ${a.name} ❤ ${b.name}.`);
        await adapter.dm(a.id, `💘 Bạn yêu ${b.name}. Một trong hai chết, người kia chết theo.`).catch(() => {});
        await adapter.dm(b.id, `💘 Bạn yêu ${a.name}. Một trong hai chết, người kia chết theo.`).catch(() => {});
        return maybeEarlyNight();
      }

      if (phase !== "NIGHT") return false;
      if (!me.alive) return false;
      const list = alive();
      const target = targetFrom(args, list);

      if (cmd === "kill" && me.role === ROLE.SOI) {
        if (!target) return dmErr(me, list);
        if (target.id === me.id) { await adapter.dm(me.id, "Không thể tự cắn mình."); return true; }
        nightActions.kill[me.id] = target.id;
        await adapter.dm(me.id, `Đã chọn cắn ${target.name}.`);
        return maybeEarlyNight();
      }
      if (cmd === "soi" && me.role === ROLE.TIEN_TRI) {
        if (!target) return dmErr(me, list);
        nightActions.seer = target.id;
        await adapter.dm(me.id, `${target.name} ${target.role === ROLE.SOI ? "LÀ SÓI." : "KHÔNG phải sói."}`);
        return maybeEarlyNight();
      }
      if (cmd === "bv" && me.role === ROLE.BAO_VE) {
        if (!target) return dmErr(me, list);
        if (target.id === lastProtected) { await adapter.dm(me.id, "Không được bảo vệ cùng một người hai đêm liền."); return true; }
        nightActions.protect = target.id;
        await adapter.dm(me.id, `Đã bảo vệ ${target.name}.`);
        return maybeEarlyNight();
      }
      if (cmd === "cuu" && me.role === ROLE.PHU_THUY) {
        if (!witch.heal) { await adapter.dm(me.id, "Bạn đã dùng bình cứu rồi."); return true; }
        const tally = {};
        for (const t of Object.values(nightActions.kill)) tally[t] = (tally[t] || 0) + 1;
        let vId = null, best = 0;
        for (const [id, c] of Object.entries(tally)) if (c > best) { best = c; vId = id; }
        if (!vId) { await adapter.dm(me.id, "Đêm nay chưa ai bị cắn để cứu."); return true; }
        nightActions.witchHeal = true; nightActions.witchHealTarget = vId; witch.heal = false;
        await adapter.dm(me.id, `Đã cứu ${byId(vId).name}.`);
        return maybeEarlyNight();
      }
      if (cmd === "doc" && me.role === ROLE.PHU_THUY) {
        if (!witch.poison) { await adapter.dm(me.id, "Bạn đã dùng bình độc rồi."); return true; }
        if (!target) return dmErr(me, list);
        nightActions.witchPoison = target.id; witch.poison = false;
        await adapter.dm(me.id, `Đã đầu độc ${target.name}.`);
        return maybeEarlyNight();
      }
      return false;
    },
    async stop() { return end("Ván đấu đã bị huỷ."); },
  };

  async function dmErr(me, list) {
    await adapter.dm(me.id, `Số không hợp lệ. Chọn 1..${list.length}`);
    return true;
  }

  async function maybeEarlyNight() {
    if (phase !== "NIGHT") return true;
    const list = alive();
    const needWolf = list.filter((p) => p.role === ROLE.SOI).length;
    const done =
      Object.keys(nightActions.kill).length >= needWolf &&
      (!has(ROLE.TIEN_TRI) || nightActions.seer) &&
      (!has(ROLE.BAO_VE) || nightActions.protect) &&
      (night !== 1 || !has(ROLE.CUPID) || cupidDone);
    if (done) await resolveNight();
    return true;
  }

  announceLobby();
  return game;
}

module.exports = { startMaSoi };
