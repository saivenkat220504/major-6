function removeDuplicatePhrases(text) {
  if (!text) return '';

  let cleaned = text.replace(/\s+/g, ' ').trim();

  const words = cleaned.split(' ');
  const dedupedWords = [];
  for (let i = 0; i < words.length; i++) {
    if (i === 0 || words[i].toLowerCase() !== words[i - 1].toLowerCase()) {
      dedupedWords.push(words[i]);
    }
  }
  cleaned = dedupedWords.join(' ');

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

  const finalChunks = [];
  const interimChunks = [];

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

  const mergeChunks = (chunks) => {
    if (chunks.length === 0) return '';

    const clean = [];
    for (const chunk of chunks) {
      if (clean.length === 0) {
        clean.push(chunk);
        continue;
      }

      const last = clean[clean.length - 1];
      const normLast = last.toLowerCase().trim();
      const normChunk = chunk.toLowerCase().trim();

      if (normChunk.startsWith(normLast)) {
        clean[clean.length - 1] = chunk;
      } else if (normLast.startsWith(normChunk)) {
        // keep last
      } else {
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

  const deduplicatedFull = removeDuplicatePhrases(fullClean);
  const deduplicatedFinal = removeDuplicatePhrases(finalClean);

  return {
    finalTranscript: deduplicatedFinal,
    liveTranscript: deduplicatedFull,
  };
}

module.exports = { cleanSpeechTranscript, removeDuplicatePhrases };
