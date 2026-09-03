function cleanSpeechTranscript(results) {
  if (!results || results.length === 0) {
    return { finalTranscript: '', liveTranscript: '' };
  }

  // 1. Gather all non-empty transcript items
  const items = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r || !r[0]) continue;
    const text = (r[0].transcript || '').trim();
    if (text) {
      items.push({ text, isFinal: Boolean(r.isFinal) });
    }
  }

  if (items.length === 0) {
    return { finalTranscript: '', liveTranscript: '' };
  }

  // 2. Build non-redundant transcript sequence
  // If item[i+1] starts with item[i] or contains item[i], item[i] was just an interim partial hypothesis of item[i+1]
  const cleanSequence = [];
  for (let i = 0; i < items.length; i++) {
    const current = items[i].text;
    const normCurrent = current.toLowerCase().trim();

    if (cleanSequence.length === 0) {
      cleanSequence.push(current);
      continue;
    }

    const prev = cleanSequence[cleanSequence.length - 1];
    const normPrev = prev.toLowerCase().trim();

    // If current cumulative string starts with or includes previous cumulative string
    if (normCurrent.startsWith(normPrev) || normCurrent.includes(normPrev)) {
      cleanSequence[cleanSequence.length - 1] = current; // Replace with fuller transcript
    } else if (normPrev.startsWith(normCurrent) || normPrev.includes(normCurrent)) {
      // Prev already has more complete information, skip current
    } else {
      // Distinct phrase/sentence, append
      cleanSequence.push(current);
    }
  }

  // 3. Join cleaned sequence
  let rawJoined = cleanSequence.join(' ').replace(/\s+/g, ' ').trim();

  // 4. Remove word/phrase level repetitions
  const deduplicated = removeDuplicatePhrases(rawJoined);

  return {
    finalTranscript: deduplicated,
    liveTranscript: deduplicated,
  };
}

function removeDuplicatePhrases(text) {
  if (!text) return '';

  // Strip literal markdown bold asterisks if present
  let cleaned = text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

  // Remove adjacent duplicate words (case-insensitive)
  const words = cleaned.split(' ');
  const dedupedWords = [];
  for (let i = 0; i < words.length; i++) {
    if (i === 0 || words[i].toLowerCase() !== words[i - 1].toLowerCase()) {
      dedupedWords.push(words[i]);
    }
  }
  cleaned = dedupedWords.join(' ');

  // Remove duplicate 2 to 6 word phrases
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

// Test against the exact cumulative Android stream from screenshot 3:
const androidStream = [
  [{ transcript: 'hi' }],
  [{ transcript: 'hi can' }],
  [{ transcript: 'hi can you' }],
  [{ transcript: 'hi can you tell' }],
  [{ transcript: 'hi can you tell me' }],
  [{ transcript: 'hi can you tell me my' }],
  [{ transcript: 'hi can you tell me my gate' }],
  [{ transcript: 'hi can you tell me my gate number' }],
];

console.log('Cleaned Android Stream:', cleanSpeechTranscript(androidStream));

// Test against multi-sentence stream:
const multiSentence = [
  [{ transcript: 'where is my flight' }],
  [{ transcript: 'can you tell me my gate number' }],
];
console.log('Cleaned Multi-Sentence:', cleanSpeechTranscript(multiSentence));
