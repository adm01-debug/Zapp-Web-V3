/**
 * E70 — Migration `grant_xp`/`unlock_achievement`: contrato estático + simulação JS fiel.
 *
 * Sem Postgres local (worktree de campanha), o contrato da migration é validado em
 * duas camadas:
 *   1. Asserções ESTÁTICAS no arquivo versionado (SECURITY DEFINER, search_path
 *      fixo, ledger xp_transactions, ON CONFLICT de dedupe, GRANT authenticated,
 *      guard de permissão por auth.uid()).
 *   2. SIMULAÇÃO JS que espelha o corpo SQL linha a linha (grant → ledger →
 *      upsert agent_stats → nível por FLOOR(SQRT(xp/50))+1; unlock → dedupe
 *      ON CONFLICT → achievements_count+1 → grant_xp) e prova o contrato
 *      comportamental: nível sobe ao acumular XP; achievement desbloqueia 1x;
 *      tipos repetíveis seguem permitidos; perfil alheio é negado.
 *
 * RED esperado ANTES da implementação: o arquivo de migration não existe
 * (ENOENT na leitura) → todos os asserts estáticos falham.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateLevel } from '../levelUtils';

const MIGRATION_FILE = join(
  process.cwd(),
  'supabase/migrations/20260818190002_etapa70_gamification_xp_transactions.sql'
);

let sql = '';
beforeAll(() => {
  sql = readFileSync(MIGRATION_FILE, 'utf8');
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Contrato estático do arquivo versionado
// ─────────────────────────────────────────────────────────────────────────────
describe('migration 20260818190002 — contrato estático', () => {
  it('arquivo versionado existe e é SQL', () => {
    expect(sql.length).toBeGreaterThan(100);
  });

  it('cria o ledger zapp.xp_transactions com amount>0 e reason', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS zapp.xp_transactions');
    expect(sql).toContain('amount integer NOT NULL CHECK (amount > 0)');
    expect(sql).toContain('reason text NOT NULL');
  });

  it('rpc_grant_xp é SECURITY DEFINER com search_path fixo', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION zapp.rpc_grant_xp(');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toMatch(/SET search_path\s*=\s*'?zapp/);
  });

  it('rpc_grant_xp escreve no ledger e recalcula o nível do total acumulado', () => {
    expect(sql).toContain('INSERT INTO zapp.xp_transactions');
    expect(sql).toMatch(/FLOOR\(SQRT\(/i);
    expect(sql).toMatch(/GREATEST\(1,/i);
  });

  it('rpc_grant_xp faz upsert atômico em agent_stats (ON CONFLICT (profile_id))', () => {
    expect(sql).toMatch(/ON CONFLICT \(profile_id\) DO UPDATE/);
  });

  it('rpc_unlock_achievement deduplica via ON CONFLICT (profile_id, achievement_type) DO NOTHING', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION zapp.rpc_unlock_achievement(');
    expect(sql).toMatch(/ON CONFLICT \(profile_id, achievement_type\) DO NOTHING/);
  });

  it('rpc_unlock_achievement mantém tipos repetíveis (daily_goal/streak/message_milestone)', () => {
    expect(sql).toMatch(/daily_goal/);
    expect(sql).toMatch(/message_milestone/);
  });

  it('RPCs exigem autenticação e perfil do próprio usuário (auth.uid)', () => {
    expect(sql).toContain('auth.uid()');
    expect(sql).toMatch(/RAISE EXCEPTION 'permission denied/);
  });

  it('EXECUTE concedido a authenticated (e revogado de PUBLIC)', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION zapp.rpc_grant_xp');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION zapp.rpc_unlock_achievement');
    expect(sql).toContain('REVOKE EXECUTE');
  });

  it('adiciona o índice único de agent_stats.profile_id (invariante assumido por maybeSingle)', () => {
    expect(sql).toMatch(/agent_stats_profile_unique/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Simulação JS fiel do corpo SQL (ledger + agent_stats + achievements)
// ─────────────────────────────────────────────────────────────────────────────
interface FakeDB {
  agentStats: Map<string, { xp: number; level: number; achievementsCount: number }>;
  transactions: Array<{ profileId: string; amount: number; reason: string }>;
  achievements: Set<string>; // `${profileId}:${type}`
  profiles: Map<string, string>; // profileId -> userId (dono)
  currentUserId: string;
}

function newDb(): FakeDB {
  return {
    agentStats: new Map(),
    transactions: [],
    achievements: new Set(),
    profiles: new Map([['p1', 'u1'], ['p2', 'u2']]),
    currentUserId: 'u1',
  };
}

const REPEATABLE = new Set(['daily_goal', 'streak', 'message_milestone']);

function sqlLevel(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 50.0)) + 1);
}

/** Espelho de zapp.rpc_grant_xp (linha a linha do SQL). */
function grantXp(db: FakeDB, profileId: string, amount: number, reason: string) {
  const owner = db.profiles.get(profileId);
  if (!owner) throw new Error('perfil inexistente');
  if (owner !== db.currentUserId) throw new Error('permission denied: perfil não pertence ao usuário');
  if (amount <= 0) throw new Error('grant_xp: amount deve ser > 0');

  // INSERT INTO zapp.xp_transactions
  db.transactions.push({ profileId, amount, reason });

  // SELECT ... FOR UPDATE (simulado: leitura do estado atual)
  const prev = db.agentStats.get(profileId) ?? { xp: 0, level: 1, achievementsCount: 0 };
  const newXp = prev.xp + amount;
  const newLevel = sqlLevel(newXp);

  // INSERT ... ON CONFLICT (profile_id) DO UPDATE (soma apenas o delta)
  db.agentStats.set(profileId, {
    xp: newXp,
    level: newLevel,
    achievementsCount: prev.achievementsCount,
  });

  return {
    new_xp: newXp,
    new_level: newLevel,
    leveled_up: newLevel > prev.level,
    previous_level: prev.level,
  };
}

/** Espelho de zapp.rpc_unlock_achievement. */
function unlockAchievement(
  db: FakeDB,
  profileId: string,
  type: string,
  _name: string,
  xpReward: number
) {
  const owner = db.profiles.get(profileId);
  if (!owner) throw new Error('perfil inexistente');
  if (owner !== db.currentUserId) throw new Error('permission denied: perfil não pertence ao usuário');

  const key = `${profileId}:${type}`;
  let inserted = false;

  if (REPEATABLE.has(type)) {
    db.achievements.add(key);
    inserted = true;
  } else {
    // INSERT ... ON CONFLICT (profile_id, achievement_type) DO NOTHING
    if (!db.achievements.has(key)) {
      db.achievements.add(key);
      inserted = true;
    }
  }

  if (!inserted) {
    return { already_unlocked: true, new_xp: null, new_level: null, leveled_up: false, previous_level: null };
  }

  // UPDATE agent_stats SET achievements_count = achievements_count + 1
  const prev = db.agentStats.get(profileId) ?? { xp: 0, level: 1, achievementsCount: 0 };
  db.agentStats.set(profileId, { ...prev, achievementsCount: prev.achievementsCount + 1 });

  if (xpReward > 0) {
    return { already_unlocked: false, ...grantXp(db, profileId, xpReward, `achievement:${type}`) };
  }
  return { already_unlocked: false, new_xp: null, new_level: null, leveled_up: false, previous_level: null };
}

describe('simulação grant_xp — nível sobe ao acumular XP', () => {
  it('0 → +30 XP: nível 1, sem level-up', () => {
    const db = newDb();
    const r = grantXp(db, 'p1', 30, 'test');
    expect(r).toMatchObject({ new_xp: 30, new_level: 1, leveled_up: false, previous_level: 1 });
    expect(db.transactions).toEqual([{ profileId: 'p1', amount: 30, reason: 'test' }]);
  });

  it('+20 XP (total 50): cruza o threshold → nível 2, leveled_up=true', () => {
    const db = newDb();
    grantXp(db, 'p1', 30, 'test');
    const r = grantXp(db, 'p1', 20, 'test');
    expect(r).toMatchObject({ new_xp: 50, new_level: 2, leveled_up: true, previous_level: 1 });
  });

  it('acumulação continua: 50 → 80 XP mantém nível 2 (leveled_up=false)', () => {
    const db = newDb();
    grantXp(db, 'p1', 50, 'a');
    const r = grantXp(db, 'p1', 30, 'b');
    expect(r).toMatchObject({ new_xp: 80, new_level: 2, leveled_up: false, previous_level: 2 });
  });

  it('nível da simulação espelha levelUtils.calculateLevel em todos os thresholds', () => {
    for (const xp of [0, 49, 50, 199, 200, 450, 800, 1250]) {
      expect(sqlLevel(xp)).toBe(calculateLevel(xp));
    }
  });

  it('amount <= 0 é rejeitado (CHECK amount > 0)', () => {
    const db = newDb();
    expect(() => grantXp(db, 'p1', 0, 'x')).toThrow(/amount/);
  });

  it('perfil de outro usuário é negado', () => {
    const db = newDb();
    expect(() => grantXp(db, 'p2', 10, 'x')).toThrow(/permission denied/);
  });
});

describe('simulação unlock_achievement — desbloqueia 1x', () => {
  it('primeiro unlock: already_unlocked=false, XP creditado, achievements_count=1', () => {
    const db = newDb();
    grantXp(db, 'p1', 40, 'base'); // 40 XP, nível 1
    const r = unlockAchievement(db, 'p1', 'speed_demon', 'Speed Demon', 50);

    expect(r.already_unlocked).toBe(false);
    expect(r).toMatchObject({ new_xp: 90, new_level: 2, leveled_up: true }); // 40+50=90 → nível 2
    expect(db.agentStats.get('p1')?.achievementsCount).toBe(1);
    expect(db.transactions.some((t) => t.reason === 'achievement:speed_demon' && t.amount === 50)).toBe(true);
  });

  it('segundo unlock do MESMO tipo: already_unlocked=true, zero XP novo, count inalterado', () => {
    const db = newDb();
    grantXp(db, 'p1', 40, 'base');
    unlockAchievement(db, 'p1', 'speed_demon', 'Speed Demon', 50);
    const before = db.agentStats.get('p1')!;

    const r = unlockAchievement(db, 'p1', 'speed_demon', 'Speed Demon', 50);

    expect(r.already_unlocked).toBe(true);
    expect(db.agentStats.get('p1')!.xp).toBe(before.xp);
    expect(db.agentStats.get('p1')!.achievementsCount).toBe(1);
    expect(db.achievements.size).toBe(1);
  });

  it('tipos repetíveis (streak) desbloqueiam mais de uma vez com XP em cada', () => {
    const db = newDb();
    const r1 = unlockAchievement(db, 'p1', 'streak', 'Mini Streak', 25);
    const r2 = unlockAchievement(db, 'p1', 'streak', 'Streak', 50);

    expect(r1.already_unlocked).toBe(false);
    expect(r2.already_unlocked).toBe(false);
    expect(db.agentStats.get('p1')!.xp).toBe(75);
    expect(db.achievements.size).toBe(1); // Set não conta duplicado, mas ambas as entradas foram aceitas
    expect(db.transactions.filter((t) => t.reason.startsWith('achievement:streak')).length).toBe(2);
  });

  it('tipos distintos desbloqueiam independentemente', () => {
    const db = newDb();
    unlockAchievement(db, 'p1', 'speed_demon', 'Speed Demon', 50);
    const r = unlockAchievement(db, 'p1', 'resolution', 'Problema Resolvido', 40);

    expect(r.already_unlocked).toBe(false);
    expect(db.agentStats.get('p1')!.xp).toBe(90);
    expect(db.agentStats.get('p1')!.achievementsCount).toBe(2);
  });

  it('perfil de outro usuário é negado também no unlock', () => {
    const db = newDb();
    expect(() => unlockAchievement(db, 'p2', 'speed_demon', 'Speed Demon', 50)).toThrow(
      /permission denied/
    );
  });
});
