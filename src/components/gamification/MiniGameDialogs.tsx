import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Keyboard, Brain, Target, Timer, Zap, Star, Trophy, RotateCcw } from 'lucide-react';
import { TYPING_PHRASES, QUIZ_QUESTIONS, EMOJI_CHALLENGES } from './miniGamesData';

interface GameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (score: number, xp: number) => void;
}

export function SpeedTypingGame({ isOpen, onClose, onComplete }: GameDialogProps) {
  const [currentPhrase, setCurrentPhrase] = useState('');
  const [userInput, setUserInput] = useState('');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentPhrase(TYPING_PHRASES[Math.floor(Math.random() * TYPING_PHRASES.length)]);
      setUserInput('');
      setScore(0);
      setTimeLeft(60);
      setIsActive(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0) {
      onComplete(score, Math.floor(score / 2));
    }
    return undefined;
  }, [isActive, timeLeft, score, onComplete]);

  const handleInputChange = (value: string) => {
    setUserInput(value);
    if (value === currentPhrase) {
      setScore((s) => s + currentPhrase.length);
      setUserInput('');
      setCurrentPhrase(TYPING_PHRASES[Math.floor(Math.random() * TYPING_PHRASES.length)]);
    }
  };

  const accuracy =
    userInput.length > 0
      ? (currentPhrase
          .slice(0, userInput.length)
          .split('')
          .filter((c, i) => c === userInput[i]).length /
          userInput.length) *
        100
      : 100;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Speed Typing
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="px-3 py-1 text-lg">
              <Timer className="mr-1 h-4 w-4" />
              {timeLeft}s
            </Badge>
            <Badge className="px-3 py-1 text-lg">
              <Zap className="mr-1 h-4 w-4" />
              {score} pts
            </Badge>
          </div>
          <Card className="bg-muted/50 p-4">
            <p className="text-lg leading-relaxed">
              {currentPhrase.split('').map((char, i) => (
                <span
                  key={i}
                  className={
                    i < userInput.length
                      ? userInput[i] === char
                        ? 'text-success'
                        : 'bg-destructive/20 text-destructive'
                      : ''
                  }
                >
                  {char}
                </span>
              ))}
            </p>
          </Card>
          <Input
            aria-label="Resposta do desafio"
            value={userInput}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Digite aqui..."
            className="text-lg"
            autoFocus
          />
          <Progress value={accuracy} className="h-2" />
          <p className="text-center text-sm text-muted-foreground">
            Precisão: {accuracy.toFixed(0)}%
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function QuizGame({ isOpen, onClose, onComplete }: GameDialogProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const answerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (isOpen) {
      setCurrentQuestion(0);
      setScore(0);
      setAnswered(null);
      setShowResult(false);
    }
  }, [isOpen]);

  const question = QUIZ_QUESTIONS[currentQuestion];

  const handleAnswer = (index: number) => {
    if (answered !== null) return;
    setAnswered(index);
    if (index === question.correct) setScore((s) => s + 20);
    if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
    answerTimerRef.current = setTimeout(() => {
      if (currentQuestion < QUIZ_QUESTIONS.length - 1) {
        setCurrentQuestion((c) => c + 1);
        setAnswered(null);
      } else {
        setShowResult(true);
        onComplete(
          score + (index === question.correct ? 20 : 0),
          Math.floor((score + (index === question.correct ? 20 : 0)) / 3)
        );
      }
    }, 1000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Quiz do Atendimento
          </DialogTitle>
        </DialogHeader>
        {!showResult ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Badge variant="outline">
                Pergunta {currentQuestion + 1}/{QUIZ_QUESTIONS.length}
              </Badge>
              <Badge>
                <Star className="mr-1 h-4 w-4" />
                {score} pts
              </Badge>
            </div>
            <Progress
              value={((currentQuestion + 1) / QUIZ_QUESTIONS.length) * 100}
              className="h-2"
            />
            <Card className="p-4">
              <p className="text-lg font-medium">{question.question}</p>
            </Card>
            <div className="grid gap-2">
              {question.options.map((option, index) => (
                <Button
                  key={option}
                  variant={
                    answered === null
                      ? 'outline'
                      : index === question.correct
                        ? 'default'
                        : answered === index
                          ? 'destructive'
                          : 'outline'
                  }
                  className="h-auto justify-start px-4 py-3"
                  onClick={() => handleAnswer(index)}
                  disabled={answered !== null}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-8 text-center">
            <Trophy className="mx-auto h-16 w-16 text-warning" />
            <h3 className="text-2xl font-bold">{score} pontos!</h3>
            <p className="text-muted-foreground">
              Você acertou {score / 20} de {QUIZ_QUESTIONS.length} perguntas
            </p>
            <Button onClick={onClose}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Jogar Novamente
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function EmojiDecodeGame({ isOpen, onClose, onComplete }: GameDialogProps) {
  const [currentChallenge, setCurrentChallenge] = useState(0);
  const [score, setScore] = useState(0);
  const [userGuess, setUserGuess] = useState('');
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentChallenge(0);
      setScore(0);
      setUserGuess('');
      setShowHint(false);
    }
  }, [isOpen]);

  const challenge = EMOJI_CHALLENGES[currentChallenge];

  const handleSubmit = () => {
    const isCorrect =
      userGuess.toLowerCase().includes(challenge.answer.toLowerCase()) ||
      challenge.answer.toLowerCase().includes(userGuess.toLowerCase());
    if (isCorrect) setScore((s) => s + (showHint ? 10 : 20));
    if (currentChallenge < EMOJI_CHALLENGES.length - 1) {
      setCurrentChallenge((c) => c + 1);
      setUserGuess('');
      setShowHint(false);
    } else {
      onComplete(
        score + (isCorrect ? (showHint ? 10 : 20) : 0),
        Math.floor((score + (isCorrect ? (showHint ? 10 : 20) : 0)) / 2)
      );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Emoji Decode
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <Badge variant="outline">
              {currentChallenge + 1}/{EMOJI_CHALLENGES.length}
            </Badge>
            <Badge>
              <Star className="mr-1 h-4 w-4" />
              {score} pts
            </Badge>
          </div>
          <Card className="p-8 text-center">
            <p className="text-6xl">{challenge.emojis}</p>
            <p className="mt-4 text-muted-foreground">Como o cliente está se sentindo?</p>
          </Card>
          {showHint && (
            <p className="text-center text-sm text-muted-foreground">
              Dica: O sentimento é{' '}
              {challenge.sentiment === 'positive'
                ? 'positivo 😊'
                : challenge.sentiment === 'negative'
                  ? 'negativo 😔'
                  : 'neutro 😐'}
            </p>
          )}
          <div className="flex gap-2">
            <Input
              aria-label="Sentimento do cliente"
              value={userGuess}
              onChange={(e) => setUserGuess(e.target.value)}
              placeholder="Digite o sentimento..."
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
            <Button onClick={handleSubmit}>Confirmar</Button>
          </div>
          {!showHint && (
            <Button variant="ghost" size="sm" onClick={() => setShowHint(true)}>
              Mostrar Dica (-10 pts)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
