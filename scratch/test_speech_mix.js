const { cleanSpeechTranscript } = require('./test_speech_func.js');

// Test Case 1: Mixed isFinal (results[0] is final, results[1..] are interim)
const mix1 = [
  { 0: { transcript: 'hi' }, isFinal: true },
  { 0: { transcript: 'hi can' }, isFinal: false },
];
console.log('Mix 1:', cleanSpeechTranscript(mix1));

// Test Case 2: Multi-step mixed isFinal
const mix2 = [
  { 0: { transcript: 'hi' }, isFinal: true },
  { 0: { transcript: 'hi can' }, isFinal: true },
  { 0: { transcript: 'hi can you' }, isFinal: false },
];
console.log('Mix 2:', cleanSpeechTranscript(mix2));

// Test Case 3: Android sends cumulative chunks in BOTH final and interim
const mix3 = [
  { 0: { transcript: 'hi' }, isFinal: true },
  { 0: { transcript: 'can' }, isFinal: true },
  { 0: { transcript: 'you' }, isFinal: false },
];
console.log('Mix 3:', cleanSpeechTranscript(mix3));
