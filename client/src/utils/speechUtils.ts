/**
 * Speech Recognition Transcript Utility
 * Solves the Web Speech API "prolongation" / accumulation bug in Chrome and Android WebViews
 * where cumulative interim results are appended as separate entries in event.results.
 */

export function removeDuplicatePhrases(text: string): string {
  if (!text) return '';

  // 1. Normalize whitespace
  let cleaned = text.replace(/\s+/g, ' ').trim();

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

  const finalChunks: string[] = [];
  const interimChunks: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    if (!item || !item[0]) continue;
    const transcript = (item[0].transcript || '').trim();
    if (!transcript) continue;

    if (item.isFinal) {
      finalChunks.push(transcript);
    } else {
      interimChunks.push(transcript);
    }
  }

  // Merge sequential chunks where each chunk is cumulative or extends the previous chunk
  const mergeChunks = (chunks: string[]): string => {
    if (chunks.length === 0) return '';

    const clean: string[] = [];
    for (const chunk of chunks) {
      if (clean.length === 0) {
        clean.push(chunk);
        continue;
      }

      const last = clean[clean.length - 1];
      const normLast = last.toLowerCase().trim();
      const normChunk = chunk.toLowerCase().trim();

      // If current chunk starts with previous chunk, it's an interim extension of the previous phrase
      if (normChunk.startsWith(normLast)) {
        clean[clean.length - 1] = chunk; // Replace last with expanded chunk
      } else if (normLast.startsWith(normChunk)) {
        // Last already has more content, keep last
      } else {
        // Distinct chunk, append
        clean.push(chunk);
      }
    }
    return clean.join(' ');
  };

  const finalClean = mergeChunks(finalChunks);
  const interimClean = mergeChunks(interimChunks);

  let fullClean = '';
  if (finalClean && interimClean) {
    const normFinal = finalClean.toLowerCase().trim();
    const normInterim = interimClean.toLowerCase().trim();
    if (normInterim.startsWith(normFinal)) {
      fullClean = interimClean;
    } else {
      fullClean = `${finalClean} ${interimClean}`;
    }
  } else {
    fullClean = finalClean || interimClean;
  }

  // Apply deduplication filter
  const deduplicatedFull = removeDuplicatePhrases(fullClean);
  const deduplicatedFinal = removeDuplicatePhrases(finalClean);

  return {
    finalTranscript: deduplicatedFinal,
    liveTranscript: deduplicatedFull,
  };
}
