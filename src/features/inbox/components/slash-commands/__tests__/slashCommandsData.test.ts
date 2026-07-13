import { describe, it, expect } from 'vitest';
import { SLASH_COMMANDS, categoryColors, categoryLabels } from '../slashCommandsData';

// ── SLASH_COMMANDS — completeness ─────────────────────────────────────────────

describe('SLASH_COMMANDS — completeness', () => {
  it('has exactly 16 commands', () => {
    expect(SLASH_COMMANDS).toHaveLength(16);
  });

  it('every command has a non-empty id', () => {
    SLASH_COMMANDS.forEach((cmd) => {
      expect(typeof cmd.id).toBe('string');
      expect(cmd.id.length).toBeGreaterThan(0);
    });
  });

  it('every command has a non-empty command string', () => {
    SLASH_COMMANDS.forEach((cmd) => {
      expect(typeof cmd.command).toBe('string');
      expect(cmd.command.length).toBeGreaterThan(0);
    });
  });

  it('every command starts with "/"', () => {
    SLASH_COMMANDS.forEach((cmd) => {
      expect(cmd.command).toMatch(/^\//);
    });
  });

  it('every command has a non-empty label', () => {
    SLASH_COMMANDS.forEach((cmd) => {
      expect(typeof cmd.label).toBe('string');
      expect(cmd.label.length).toBeGreaterThan(0);
    });
  });

  it('every command has a non-empty description', () => {
    SLASH_COMMANDS.forEach((cmd) => {
      expect(typeof cmd.description).toBe('string');
      expect(cmd.description.length).toBeGreaterThan(0);
    });
  });

  it('every command has a truthy icon', () => {
    SLASH_COMMANDS.forEach((cmd) => {
      expect(cmd.icon).toBeTruthy();
    });
  });

  it('every command has a non-empty color', () => {
    SLASH_COMMANDS.forEach((cmd) => {
      expect(typeof cmd.color).toBe('string');
      expect(cmd.color.length).toBeGreaterThan(0);
    });
  });

  it('every command has a valid category', () => {
    const VALID_CATEGORIES = ['actions', 'templates', 'notes', 'tags', 'priority', 'internal'];
    SLASH_COMMANDS.forEach((cmd) => {
      expect(VALID_CATEGORIES).toContain(cmd.category);
    });
  });
});

// ── SLASH_COMMANDS — uniqueness ───────────────────────────────────────────────

describe('SLASH_COMMANDS — uniqueness', () => {
  it('all ids are unique', () => {
    const ids = SLASH_COMMANDS.map((cmd) => cmd.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all command strings are unique', () => {
    const commands = SLASH_COMMANDS.map((cmd) => cmd.command);
    expect(new Set(commands).size).toBe(commands.length);
  });
});

// ── SLASH_COMMANDS — shortcuts ────────────────────────────────────────────────

describe('SLASH_COMMANDS — shortcuts', () => {
  it('every shortcut (when present) is a single uppercase letter', () => {
    SLASH_COMMANDS.forEach((cmd) => {
      if (cmd.shortcut !== undefined) {
        expect(cmd.shortcut).toMatch(/^[A-Z]$/);
      }
    });
  });

  it('all shortcuts are unique among commands that have one', () => {
    const shortcuts = SLASH_COMMANDS
      .filter((cmd) => cmd.shortcut !== undefined)
      .map((cmd) => cmd.shortcut!);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });
});

// ── SLASH_COMMANDS — subCommands ──────────────────────────────────────────────

describe('SLASH_COMMANDS — subCommands', () => {
  it('transfer command has subCommands', () => {
    const cmd = SLASH_COMMANDS.find((c) => c.id === 'transfer');
    expect(cmd?.subCommands).toBeDefined();
    expect(cmd?.subCommands!.length).toBeGreaterThan(0);
  });

  it('each subCommand has id, label, and value', () => {
    SLASH_COMMANDS.forEach((cmd) => {
      if (cmd.subCommands) {
        cmd.subCommands.forEach((sub) => {
          expect(typeof sub.id).toBe('string');
          expect(typeof sub.label).toBe('string');
          expect(typeof sub.value).toBe('string');
        });
      }
    });
  });

  it('priority command has 3 subCommands (high/medium/low)', () => {
    const cmd = SLASH_COMMANDS.find((c) => c.id === 'priority');
    expect(cmd?.subCommands).toHaveLength(3);
    const values = cmd?.subCommands!.map((s) => s.value);
    expect(values).toContain('high');
    expect(values).toContain('medium');
    expect(values).toContain('low');
  });

  it('snooze command has 4 subCommands', () => {
    const cmd = SLASH_COMMANDS.find((c) => c.id === 'snooze');
    expect(cmd?.subCommands).toHaveLength(4);
  });
});

// ── SLASH_COMMANDS — spot checks ─────────────────────────────────────────────

describe('SLASH_COMMANDS — spot checks', () => {
  it('contains a "resolve" command', () => {
    expect(SLASH_COMMANDS.some((c) => c.id === 'resolve')).toBe(true);
  });

  it('"resolve" command string is "/resolve"', () => {
    const cmd = SLASH_COMMANDS.find((c) => c.id === 'resolve');
    expect(cmd?.command).toBe('/resolve');
  });

  it('"resolve" is in the "actions" category', () => {
    const cmd = SLASH_COMMANDS.find((c) => c.id === 'resolve');
    expect(cmd?.category).toBe('actions');
  });

  it('contains an "internal-note" (whisper) command', () => {
    expect(SLASH_COMMANDS.some((c) => c.id === 'internal-note')).toBe(true);
  });

  it('"internal-note" command string is "/whisper"', () => {
    const cmd = SLASH_COMMANDS.find((c) => c.id === 'internal-note');
    expect(cmd?.command).toBe('/whisper');
  });
});

// ── categoryColors ────────────────────────────────────────────────────────────

describe('categoryColors', () => {
  const EXPECTED_CATEGORIES = ['actions', 'templates', 'notes', 'tags', 'priority', 'internal'];

  it('has exactly 6 category keys', () => {
    expect(Object.keys(categoryColors)).toHaveLength(6);
  });

  it.each(EXPECTED_CATEGORIES)('has a non-empty color for "%s"', (cat) => {
    expect(typeof categoryColors[cat]).toBe('string');
    expect(categoryColors[cat].length).toBeGreaterThan(0);
  });
});

// ── categoryLabels ────────────────────────────────────────────────────────────

describe('categoryLabels', () => {
  const EXPECTED_LABELS: Record<string, string> = {
    actions: 'Ações',
    templates: 'Templates',
    notes: 'Notas',
    tags: 'Tags',
    priority: 'Prioridade',
    internal: 'Equipe',
  };

  it('has exactly 6 label keys', () => {
    expect(Object.keys(categoryLabels)).toHaveLength(6);
  });

  it.each(Object.entries(EXPECTED_LABELS))('"%s" label is "%s"', (cat, label) => {
    expect(categoryLabels[cat]).toBe(label);
  });
});
