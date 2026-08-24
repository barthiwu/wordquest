import { apiRequest } from './apiClient';

export type WordDifficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface WordSearchResult {
  id: string;
  word: string;
  definition: string;
  partOfSpeech: string;
  baseDifficulty: WordDifficulty;
}

export interface WordDetail {
  id: string;
  word: string;
  definition: string;
  partOfSpeech: string;
  exampleSentence: string;
  baseDifficulty: WordDifficulty;
  cefrLevel: string | null;
  synonyms: string[];
  antonyms: string[];
  relatedWords: string[];
  pronunciation: string | null;
  phoneticRepresentation: string | null;
  audioUrl: string | null;
}

export function searchWords(accessToken: string, query: string): Promise<WordSearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: '20' });
  return apiRequest<WordSearchResult[]>(`/words/search?${params.toString()}`, { accessToken });
}

/** A word looked up on its own, decoupled from any quest (e.g. from a Word in the Wild word picker). */
export function getWordById(accessToken: string, id: string): Promise<WordDetail> {
  return apiRequest<WordDetail>(`/words/${id}`, { accessToken });
}
