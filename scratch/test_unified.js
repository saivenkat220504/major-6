function removeDuplicatePhrases(text) {
  if (!text) return '';

  // 1. Strip raw double asterisks or markdown bolding if present in text
  let cleaned = text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

  // 2. Remove immediate duplicate adjacent single words (case-insensitive)
  // e.g. "hi hi hi" -> "hi", "I I" -> "I", "this this" -> "this"
  const words = cleaned.split(' ');
  const dedupedWords = [];
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

    const newTokens = [];
    let i = 0;
    while (i < tokens.length) {
      if (i + phraseLen * 2 <= tokens.length) {
        const firstPattern = tokens.slice(i, i + phraseLen).join(' ').toLowerCase();
        const nextPattern = tokens.slice(i + phraseLen, i + phraseLen * 2).join(' ').toLowerCase();
        if (firstPattern === nextPattern) {
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

function cleanSpeechTranscript(results) {
  if (!results || results.length === 0) {
    return { finalTranscript: '', liveTranscript: '' };
  }

  const allChunks = [];

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    if (!item || !item[0]) continue;
    const transcript = (item[0].transcript || '').trim();
    if (transcript) {
      allChunks.push(transcript);
    }
  }

  if (allChunks.length === 0) {
    return { finalTranscript: '', liveTranscript: '' };
  }

  // Merge sequential chunks where each chunk is cumulative or extends the previous chunk
  const clean = [];
  for (const chunk of allChunks) {
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
      // Check for overlap between tail of last and head of chunk
      // e.g. last: "hi can you", chunk: "can you tell me" -> "hi can you tell me"
      let mergedOverlap = false;
      const lastWords = last.split(' ');
      const chunkWords = chunk.split(' ');
      for (let overlapLen = Math.min(lastWords.length, chunkWords.length); overlapLen >= 1; overlapLen--) {
        const lastTail = lastWords.slice(-overlapLen).join(' ').toLowerCase();
        const chunkHead = chunkWords.slice(0, overlapLen).join(' ').toLowerCase();
        if (lastTail === chunkHead) {
          const merged = [...lastWords, ...chunkWords.slice(overlapLen)].join(' ');
          clean[clean.length - 1] = merged;
          mergedOverlap = true;
          break;
        }
      }
      if (!mergedOverlap) {
        clean.push(chunk);
      }
    }
  }

  const fullClean = clean.join(' ');
  const deduplicated = removeDuplicatePhrases(fullClean);

  return {
    finalTranscript: deduplicated,
    liveTranscript: deduplicated,
  };
}

// Test cases
console.log('Test 1:', cleanSpeechTranscript([
  { 0: { transcript: 'hi' }, isFinal: true },
  { 0: { transcript: 'hi can' }, isFinal: true },
  { 0: { transcript: 'hi can you' }, isFinal: false },
  { 0: { transcript: 'hi can you tell me my gate number' }, isFinal: false }
]));

console.log('Test 2 (User screenshot 3):', cleanSpeechTranscript([
  { 0: { transcript: 'hihi' } },
  { 0: { transcript: 'canhi can' } },
  { 0: { transcript: 'youhi can you' } },
  { 0: { transcript: 'tellhi can you tell' } },
  { 0: { transcript: 'mehi can you tell me' } },
  { 0: { transcript: 'myhi can you tell me my' } },
  { 0: { transcript: 'gatehi can you tell me my gate' } },
  { 0: { transcript: 'numberhi can you tell me my gate number' } }
]));
