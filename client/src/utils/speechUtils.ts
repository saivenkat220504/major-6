/**
 * Speech Recognition Transcript Utility
 * Solves the Web Speech API "prolongation" / accumulation bug in Chrome and Android WebViews
 * where cumulative interim results are appended as separate entries in event.results.
 */

export function removeDuplicatePhrases(text: string): string {
  if (!text) return '';

  // 1. Strip raw markdown asterisks (**) if present
  let cleaned = text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

  // 2. Remove immediate duplicate adjacent single words (case-insensitive)
  // e.g. "hi hi hi" -> "hi", "I I" -> "I", "this this" -> "this"
  const words = cleaned.split(' ');
  const dedupedWords: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i === 0 || words[i].toLowerCase() !== words[i - 1].toLowerCase()) {
      dedupedWords.push(words[i]);
    }
  }
  cleaned = dedupedWords.join(' ');

  // 3. Remove duplicate 2-word, 3-word, 4-word, 5-word, 6-word adjacent phrase repetitions
  // e.g. "is this is this" -> "is this", "i want to see i want to see" -> "i want to see"
  for (let phraseLen = 6; phraseLen >= 2; phraseLen--) {
    const tokens = cleaned.split(' ');
    if (tokens.length < phraseLen * 2) continue;

    const newTokens: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      if (i + phraseLen * 2 <= tokens.length) {
        const firstPattern = tokens.slice(i, i + phraseLen).join(' ').toLowerCase();
        const nextPattern = tokens.slice(i + phraseLen, i + phraseLen * 2).join(' ').toLowerCase();
        if (firstPattern === nextPattern) {
          // Keep only one copy of the repeated phrase
          newTokens.push(...tokens.slice(i, i + phraseLen));
          i += phraseLen * 2;
          continue;
        }
      }
      newTokens.push(tokens[i]);
      i++;
    }
    cleaned = newTokens.join(' ');
  }

  return cleaned;
}

export interface CleanedSpeechResult {
  finalTranscript: string;
  liveTranscript: string;
}

export function cleanSpeechTranscript(results: any): CleanedSpeechResult {
  if (!results || results.length === 0) {
    return { finalTranscript: '', liveTranscript: '' };
  }

  // 1. Extract non-empty transcripts in chronological order
  const items: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r || !r[0]) continue;
    const text = (r[0].transcript || '').trim();
    if (text) {
      items.push(text);
    }
  }

  if (items.length === 0) {
    return { finalTranscript: '', liveTranscript: '' };
  }

  // 2. Build non-redundant transcript sequence
  // If item[i+1] starts with item[i] or contains item[i], item[i] was just an interim partial hypothesis of item[i+1]
  const cleanSequence: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const current = items[i];
    const normCurrent = current.toLowerCase().trim();

    if (cleanSequence.length === 0) {
      cleanSequence.push(current);
      continue;
    }

    const prev = cleanSequence[cleanSequence.length - 1];
    const normPrev = prev.toLowerCase().trim();

    if (normCurrent.startsWith(normPrev) || normCurrent.includes(normPrev)) {
      cleanSequence[cleanSequence.length - 1] = current; // Replace with fuller transcript
    } else if (normPrev.startsWith(normCurrent) || normPrev.includes(normCurrent)) {
      // Prev already has more complete information, skip current
    } else {
      // Check for partial tail/head word overlap (e.g. prev: "hi can you", current: "can you tell me")
      let mergedOverlap = false;
      const prevWords = prev.split(' ');
      const currentWords = current.split(' ');
      for (let overlapLen = Math.min(prevWords.length, currentWords.length); overlapLen >= 1; overlapLen--) {
        const prevTail = prevWords.slice(-overlapLen).join(' ').toLowerCase();
        const currentHead = currentWords.slice(0, overlapLen).join(' ').toLowerCase();
        if (prevTail === currentHead) {
          const merged = [...prevWords, ...currentWords.slice(overlapLen)].join(' ');
          cleanSequence[cleanSequence.length - 1] = merged;
          mergedOverlap = true;
          break;
        }
      }
      if (!mergedOverlap) {
        cleanSequence.push(current);
      }
    }
  }

  // 3. Join cleaned sequence
  const rawJoined = cleanSequence.join(' ').replace(/\s+/g, ' ').trim();

  // 4. Remove any word/phrase level repetitions
  const deduplicated = removeDuplicatePhrases(rawJoined);

  // Both finalTranscript and liveTranscript return the exact same cleaned, complete text
  return {
    finalTranscript: deduplicated,
    liveTranscript: deduplicated,
  };
}
