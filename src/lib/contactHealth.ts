import type { Contact } from '../components/contacts/types';

export function calculateContactHealth(contact: Contact): number {
  let score = 0;
  let totalWeights = 0;

  const weights = {
    name: 15,
    phone: 25,
    email: 20,
    company: 10,
    job_title: 10,
    tags: 10,
    avatar: 10,
  };

  if (contact.name && contact.name.trim().length > 2) score += weights.name;
  totalWeights += weights.name;

  if (contact.phone && contact.phone.trim().length > 5) score += weights.phone;
  totalWeights += weights.phone;

  if (contact.email && contact.email.includes('@')) score += weights.email;
  totalWeights += weights.email;

  if (contact.company) score += weights.company;
  totalWeights += weights.company;

  if (contact.job_title) score += weights.job_title;
  totalWeights += weights.job_title;

  if (contact.tags && contact.tags.length > 0) score += weights.tags;
  totalWeights += weights.tags;

  if (contact.avatar_url) score += weights.avatar;
  totalWeights += weights.avatar;

  return Math.round((score / totalWeights) * 100);
}

export function getHealthColor(score: number): string {
  if (score >= 90) return 'text-primary bg-primary/10';
  if (score >= 70) return 'text-primary bg-primary/10';
  if (score >= 40) return 'text-warning-foreground bg-warning/10';
  return 'text-destructive bg-destructive/10';
}
