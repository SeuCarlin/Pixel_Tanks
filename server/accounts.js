import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MEDAL_TIERS } from '../shared/achievements.js';

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const cleanName = (value) => String(value || '').normalize('NFC').trim();
const emptyTotals = () => ({ matches: 0, wins: 0, losses: 0, draws: 0, playMs: 0, movement: 0, jumps: 0, flightMs: 0, glideMs: 0, teleports: 0, territoryCells: 0, damage: 0, destruction: 0, kills: 0, damageTaken: 0, healed: 0, healingDone: 0, shots: 0, arsenalUses: 0, powerupUses: 0, reactionMs: 0, reactionCount: 0, classes: {}, arsenal: {}, powerups: {} });

export class AccountStore {
  constructor(filePath = path.join(process.env.TANKDOTS_DATA_DIR || path.join(process.cwd(), 'data'), 'accounts.json')) {
    this.filePath = filePath;
    this.data = existsSync(filePath) ? JSON.parse(readFileSync(filePath, 'utf8')) : { version: 1, accounts: [], sessions: {} };
    this.data.sessions ||= {};
  }

  save() {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.data), { encoding: 'utf8', mode: 0o600 });
    renameSync(temporary, this.filePath);
  }

  accountForToken(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    const session = this.data.sessions[hashToken(token)];
    if (!session || session.expiresAt <= Date.now()) return null;
    return this.data.accounts.find((account) => account.id === session.accountId) || null;
  }

  profile(account) {
    if (!account) return null;
    const { id, username, createdAt, totals, medals, history } = account;
    return { id, username, createdAt, totals, medals, history };
  }

  issueToken(account) {
    const token = crypto.randomBytes(32).toString('hex');
    this.data.sessions[hashToken(token)] = { accountId: account.id, expiresAt: Date.now() + SESSION_MS };
    this.save();
    return { token, profile: this.profile(account) };
  }

  register(usernameInput, passwordInput) {
    const username = cleanName(usernameInput);
    const password = String(passwordInput || '');
    if (!/^[\p{L}\p{N}_-]{3,18}$/u.test(username)) throw new Error('Use de 3 a 18 letras, números, _ ou - no usuário.');
    if (password.length < 8 || password.length > 128) throw new Error('A senha deve ter de 8 a 128 caracteres.');
    if (this.data.accounts.some((account) => account.username.toLocaleLowerCase('pt-BR') === username.toLocaleLowerCase('pt-BR'))) throw new Error('Esse usuário já existe.');
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
    const account = { id: crypto.randomUUID(), username, createdAt: Date.now(), salt, passwordHash, totals: emptyTotals(), medals: {}, history: [] };
    this.data.accounts.push(account);
    return this.issueToken(account);
  }

  login(usernameInput, passwordInput) {
    const username = cleanName(usernameInput);
    const account = this.data.accounts.find((entry) => entry.username.toLocaleLowerCase('pt-BR') === username.toLocaleLowerCase('pt-BR'));
    const salt = account?.salt || '00000000000000000000000000000000';
    const expected = Buffer.from(account?.passwordHash || '0'.repeat(128), 'hex');
    const actual = crypto.scryptSync(String(passwordInput || ''), salt, 64);
    if (!account || !crypto.timingSafeEqual(expected, actual)) throw new Error('Usuário ou senha inválidos.');
    return this.issueToken(account);
  }

  logout(token) {
    if (typeof token !== 'string') return;
    delete this.data.sessions[hashToken(token)];
    this.save();
  }

  recordMatch(room, result) {
    let changed = false;
    for (const entry of result.players) {
      const roomPlayer = room.players.find((player) => player.id === entry.playerId);
      const account = this.data.accounts.find((item) => item.id === roomPlayer?.accountId);
      if (!account || account.history.some((history) => history.matchId === result.matchId)) continue;
      const won = ['teams', 'teamHill', 'coop'].includes(room.game.mode) ? Boolean(room.game.winningTeam && room.game.winningTeam === roomPlayer.team) : room.game.winner === entry.playerId;
      const draw = !room.game.winner && !room.game.winningTeam;
      const totals = account.totals ||= emptyTotals();
      totals.matches += 1;
      totals[draw ? 'draws' : won ? 'wins' : 'losses'] += 1;
      for (const [key, value] of Object.entries(entry.metrics)) {
        if (typeof value === 'number' && Number.isFinite(value) && key in totals) totals[key] += value;
        else if (value && typeof value === 'object' && !Array.isArray(value) && key in totals) for (const [item, count] of Object.entries(value)) totals[key][item] = (totals[key][item] || 0) + count;
      }
      for (const medal of entry.medals) {
        for (let index = 0; index <= MEDAL_TIERS.indexOf(medal.tier); index += 1) {
          const id = `${medal.id}:${MEDAL_TIERS[index]}`;
          account.medals[id] = (account.medals[id] || 0) + 1;
        }
      }
      account.history.unshift({ matchId: result.matchId, endedAt: result.endedAt, mode: room.game.mode, classType: entry.classType, result: draw ? 'draw' : won ? 'win' : 'loss', metrics: entry.metrics, medals: entry.medals });
      account.history = account.history.slice(0, 30);
      changed = true;
    }
    if (changed) this.save();
    return changed;
  }
}
