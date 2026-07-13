import { describe, it, expect } from 'vitest';
import {
  GAMES,
  TYPING_PHRASES,
  QUIZ_QUESTIONS,
  EMOJI_CHALLENGES,
  type GameType,
  type Game,
} from '../miniGamesData';

// ── GAMES ─────────────────────────────────────────────────────────────────────

describe('GAMES — completeness', () => {
  it('is an array', () => {
    expect(Array.isArray(GAMES)).toBe(true);
  });

  it('has exactly 4 entries', () => {
    expect(GAMES).toHaveLength(4);
  });

  it('all ids are unique', () => {
    const ids = GAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every game has a non-empty id', () => {
    GAMES.forEach((g) => {
      expect(typeof g.id).toBe('string');
      expect(g.id.length).toBeGreaterThan(0);
    });
  });

  it('every game has a non-empty name', () => {
    GAMES.forEach((g) => {
      expect(typeof g.name).toBe('string');
      expect(g.name.length).toBeGreaterThan(0);
    });
  });

  it('every game has a non-empty description', () => {
    GAMES.forEach((g) => {
      expect(typeof g.description).toBe('string');
      expect(g.description.length).toBeGreaterThan(0);
    });
  });

  it('every game has a truthy icon', () => {
    GAMES.forEach((g) => {
      expect(g.icon).toBeTruthy();
    });
  });

  it('every game has a valid difficulty', () => {
    const VALID: Game['difficulty'][] = ['easy', 'medium', 'hard'];
    GAMES.forEach((g) => {
      expect(VALID).toContain(g.difficulty);
    });
  });

  it('every game has a positive xpReward', () => {
    GAMES.forEach((g) => {
      expect(typeof g.xpReward).toBe('number');
      expect(g.xpReward).toBeGreaterThan(0);
    });
  });
});

describe('GAMES — known entries', () => {
  it('contains "speed-typing" game', () => {
    expect(GAMES.some((g) => g.id === 'speed-typing')).toBe(true);
  });

  it('"speed-typing" has difficulty "medium" and xpReward 50', () => {
    const g = GAMES.find((g) => g.id === 'speed-typing')!;
    expect(g.difficulty).toBe('medium');
    expect(g.xpReward).toBe(50);
  });

  it('contains "quiz" game', () => {
    expect(GAMES.some((g) => g.id === 'quiz')).toBe(true);
  });

  it('"quiz" has difficulty "easy" and xpReward 30', () => {
    const g = GAMES.find((g) => g.id === 'quiz')!;
    expect(g.difficulty).toBe('easy');
    expect(g.xpReward).toBe(30);
  });

  it('contains "response-match" game', () => {
    expect(GAMES.some((g) => g.id === 'response-match')).toBe(true);
  });

  it('"response-match" has difficulty "medium" and xpReward 40', () => {
    const g = GAMES.find((g) => g.id === 'response-match')!;
    expect(g.difficulty).toBe('medium');
    expect(g.xpReward).toBe(40);
  });

  it('contains "emoji-decode" game', () => {
    expect(GAMES.some((g) => g.id === 'emoji-decode')).toBe(true);
  });

  it('"emoji-decode" has difficulty "easy" and xpReward 25', () => {
    const g = GAMES.find((g) => g.id === 'emoji-decode')!;
    expect(g.difficulty).toBe('easy');
    expect(g.xpReward).toBe(25);
  });

  it('all four canonical GameType ids are present', () => {
    const ids = GAMES.map((g) => g.id);
    const EXPECTED: GameType[] = ['speed-typing', 'quiz', 'response-match', 'emoji-decode'];
    EXPECTED.forEach((id) => expect(ids).toContain(id));
  });
});

// ── TYPING_PHRASES ────────────────────────────────────────────────────────────

describe('TYPING_PHRASES', () => {
  it('is an array', () => {
    expect(Array.isArray(TYPING_PHRASES)).toBe(true);
  });

  it('has at least 5 entries', () => {
    expect(TYPING_PHRASES.length).toBeGreaterThanOrEqual(5);
  });

  it('has exactly 8 entries', () => {
    expect(TYPING_PHRASES).toHaveLength(8);
  });

  it('every phrase is a non-empty string', () => {
    TYPING_PHRASES.forEach((phrase) => {
      expect(typeof phrase).toBe('string');
      expect(phrase.length).toBeGreaterThan(0);
    });
  });

  it('all phrases are unique', () => {
    expect(new Set(TYPING_PHRASES).size).toBe(TYPING_PHRASES.length);
  });

  it('contains "Olá! Como posso ajudar você hoje?"', () => {
    expect(TYPING_PHRASES).toContain('Olá! Como posso ajudar você hoje?');
  });

  it('contains "Seu problema foi solucionado!"', () => {
    expect(TYPING_PHRASES).toContain('Seu problema foi solucionado!');
  });
});

// ── QUIZ_QUESTIONS ─────────────────────────────────────────────────────────────

describe('QUIZ_QUESTIONS — structure', () => {
  it('is an array', () => {
    expect(Array.isArray(QUIZ_QUESTIONS)).toBe(true);
  });

  it('has exactly 5 questions', () => {
    expect(QUIZ_QUESTIONS).toHaveLength(5);
  });

  it('every question has a non-empty string question', () => {
    QUIZ_QUESTIONS.forEach((q) => {
      expect(typeof q.question).toBe('string');
      expect(q.question.length).toBeGreaterThan(0);
    });
  });

  it('every question has exactly 4 options', () => {
    QUIZ_QUESTIONS.forEach((q) => {
      expect(Array.isArray(q.options)).toBe(true);
      expect(q.options).toHaveLength(4);
    });
  });

  it('every option is a non-empty string', () => {
    QUIZ_QUESTIONS.forEach((q) => {
      q.options.forEach((opt) => {
        expect(typeof opt).toBe('string');
        expect(opt.length).toBeGreaterThan(0);
      });
    });
  });

  it('every correct index is a valid options index', () => {
    QUIZ_QUESTIONS.forEach((q) => {
      expect(typeof q.correct).toBe('number');
      expect(q.correct).toBeGreaterThanOrEqual(0);
      expect(q.correct).toBeLessThan(q.options.length);
    });
  });
});

describe('QUIZ_QUESTIONS — known answers', () => {
  it('first question correct answer index is 1 (ouvir atentamente)', () => {
    expect(QUIZ_QUESTIONS[0].correct).toBe(1);
  });

  it('SLA question correct answer is index 0 (Service Level Agreement)', () => {
    const q = QUIZ_QUESTIONS.find((q) => q.question.includes('SLA'))!;
    expect(q.correct).toBe(0);
    expect(q.options[0]).toBe('Service Level Agreement');
  });

  it('CSAT question correct answer is index 0 (Customer Satisfaction Score)', () => {
    const q = QUIZ_QUESTIONS.find((q) => q.question.includes('CSAT'))!;
    expect(q.correct).toBe(0);
    expect(q.options[0]).toBe('Customer Satisfaction Score');
  });

  it('irritado question correct is index 2 (manter a calma)', () => {
    const q = QUIZ_QUESTIONS.find((q) => q.question.toLowerCase().includes('irritado'))!;
    expect(q.correct).toBe(2);
  });
});

// ── EMOJI_CHALLENGES ───────────────────────────────────────────────────────────

describe('EMOJI_CHALLENGES — structure', () => {
  it('is an array', () => {
    expect(Array.isArray(EMOJI_CHALLENGES)).toBe(true);
  });

  it('has exactly 6 challenges', () => {
    expect(EMOJI_CHALLENGES).toHaveLength(6);
  });

  it('every challenge has a non-empty emojis string', () => {
    EMOJI_CHALLENGES.forEach((c) => {
      expect(typeof c.emojis).toBe('string');
      expect(c.emojis.length).toBeGreaterThan(0);
    });
  });

  it('every challenge has a valid sentiment', () => {
    const VALID = ['positive', 'negative', 'neutral'];
    EMOJI_CHALLENGES.forEach((c) => {
      expect(VALID).toContain(c.sentiment);
    });
  });

  it('every challenge has a non-empty answer', () => {
    EMOJI_CHALLENGES.forEach((c) => {
      expect(typeof c.answer).toBe('string');
      expect(c.answer.length).toBeGreaterThan(0);
    });
  });

  it('has at least one "positive" sentiment', () => {
    expect(EMOJI_CHALLENGES.some((c) => c.sentiment === 'positive')).toBe(true);
  });

  it('has at least one "negative" sentiment', () => {
    expect(EMOJI_CHALLENGES.some((c) => c.sentiment === 'negative')).toBe(true);
  });

  it('has at least one "neutral" sentiment', () => {
    expect(EMOJI_CHALLENGES.some((c) => c.sentiment === 'neutral')).toBe(true);
  });
});

describe('EMOJI_CHALLENGES — known entries', () => {
  it('"😊👍✨" has sentiment "positive" and answer "Satisfeito"', () => {
    const c = EMOJI_CHALLENGES.find((c) => c.emojis === '😊👍✨')!;
    expect(c).toBeDefined();
    expect(c.sentiment).toBe('positive');
    expect(c.answer).toBe('Satisfeito');
  });

  it('"😤😠💢" has sentiment "negative" and answer "Irritado"', () => {
    const c = EMOJI_CHALLENGES.find((c) => c.emojis === '😤😠💢')!;
    expect(c).toBeDefined();
    expect(c.sentiment).toBe('negative');
    expect(c.answer).toBe('Irritado');
  });

  it('"😕🤔❓" has sentiment "neutral" and answer "Confuso"', () => {
    const c = EMOJI_CHALLENGES.find((c) => c.emojis === '😕🤔❓')!;
    expect(c).toBeDefined();
    expect(c.sentiment).toBe('neutral');
    expect(c.answer).toBe('Confuso');
  });

  it('"🎉🥳🎊" has sentiment "positive" and answer "Muito Feliz"', () => {
    const c = EMOJI_CHALLENGES.find((c) => c.emojis === '🎉🥳🎊')!;
    expect(c).toBeDefined();
    expect(c.sentiment).toBe('positive');
    expect(c.answer).toBe('Muito Feliz');
  });
});
