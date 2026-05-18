import { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';
import './App.css';

// --- アップデート：6つに分割したJSONデータを全てインポート ---
import grammarRules from './data/grammar_rules.json';
import synonymsVerbs from './data/synonyms_verbs.json';
import synonymsAdjectives from './data/synonyms_adjectives.json';
import chunksIntro from './data/chunks_intro.json';
import chunksBody from './data/chunks_body.json';
import chunksTransitions from './data/chunks_transitions.json';

// インポートしたデータをシステムで使いやすいように結合（マージ）する
const allChunks = [...chunksIntro, ...chunksBody, ...chunksTransitions];
const allSynonyms = { ...synonymsVerbs, ...synonymsAdjectives };
const allErrors = grammarRules;

function App() {
  const [targetWordCount, setTargetWordCount] = useState(150);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  const [rawText, setRawText] = useState('');
  
  const [texts, setTexts] = useState({
    intro: '', body1: '', body2: '', body3: '', conclusion: ''
  });

  const fileInputRef = useRef(null);

  const countWords = (text) => text.trim() ? text.trim().split(/\s+/).filter(w => w !== '').length : 0;

  const calculateGlobalScore = () => {
    let score = 0;
    let usedChunks = 0;
    let usedAdvanced = 0;
    
    const allText = Object.values(texts).join(' ').toLowerCase();

    // 結合したオールチャンクで判定
    allChunks.forEach(chunk => {
      if (allText.includes(chunk.toLowerCase())) {
        usedChunks++;
        score += 50;
      }
    });

    // 結合したオール類義語で判定
    Object.values(allSynonyms).forEach(advancedArray => {
      advancedArray.forEach(advWord => {
        const regex = new RegExp(`\\b${advWord.toLowerCase()}\\b`, 'i');
        if (regex.test(allText)) {
          usedAdvanced++;
          score += 30;
        }
      });
    });

    const totalWords = countWords(allText);
    if (totalWords >= targetWordCount && targetWordCount > 0) {
      score += 100;
    }

    return { score, usedChunks, usedAdvanced };
  };

  const getFeedback = (text) => {
    if (!text) return { chunks: [], synonyms: [], errors: [] };
    const lowerText = text.toLowerCase();
    
    const foundChunks = allChunks.filter(chunk => lowerText.includes(chunk.toLowerCase()));

    const foundSynonyms = [];
    Object.keys(allSynonyms).forEach(basicWord => {
      const regex = new RegExp(`\\b${basicWord}\\b`, 'i');
      if (regex.test(lowerText)) {
        foundSynonyms.push({ basic: basicWord, advanced: allSynonyms[basicWord] });
      }
    });

    const foundErrors = [];
    Object.keys(allErrors).forEach(wrongPhrase => {
      if (lowerText.includes(wrongPhrase.toLowerCase())) {
        foundErrors.push({ wrong: wrongPhrase, correct: allErrors[wrongPhrase] });
      }
    });

    return { chunks: foundChunks, synonyms: foundSynonyms, errors: foundErrors };
  };

  // --- OCR処理 ---
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsScanning(true);
    setScanProgress('読み込み準備中...');
    Tesseract.recognize(file, 'eng', {
      logger: (m) => { if (m.status === 'recognizing text') setScanProgress(`解析中... ${Math.round(m.progress * 100)}%`); }
    }).then(({ data: { text } }) => {
      setRawText(text); setIsScanning(false); setScanProgress(''); e.target.value = '';
    }).catch(err => {
      console.error(err); setIsScanning(false); setScanProgress('エラーが発生しました。');
    });
  };

  // --- 段落振り分け処理 ---
  const handleDistribute = () => {
    let text = rawText;
    const markers = [
      { id: 'intro', regex: /\[?(intro|introduction)\]?/i },
      { id: 'body1', regex: /\[?body\s*1\]?/i },
      { id: 'body2', regex: /\[?body\s*2\]?/i },
      { id: 'body3', regex: /\[?body\s*3\]?/i },
      { id: 'conclusion', regex: /\[?(concl|conclusion)\]?/i }
    ];
    let foundIndices = [];
    let searchStartIndex = 0;
    markers.forEach(marker => {
      const substring = text.substring(searchStartIndex);
      const match = substring.match(marker.regex);
      if (match) {
        const absoluteIndex = searchStartIndex + match.index;
        const absoluteEndIndex = absoluteIndex + match[0].length;
        foundIndices.push({ id: marker.id, start: absoluteIndex, contentStart: absoluteEndIndex });
        searchStartIndex = absoluteEndIndex;
      }
    });
    const newTexts = { ...texts }; 
    for (let i = 0; i < foundIndices.length; i++) {
      const current = foundIndices[i];
      const next = foundIndices[i + 1];
      const contentEnd = next ? next.start : text.length;
      newTexts[current.id] = text.substring(current.contentStart, contentEnd).trim();
    }
    setTexts(newTexts);
    setRawText('');
  };

  const sections = [
    { id: 'intro', title: 'Introduction', percent: 0.15, color: '#ffe4e1', guide: 'Hook, Background, Thesis Statement' },
    { id: 'body1', title: 'Body 1', percent: 0.25, color: '#fffacd', guide: 'Topic Sentence, Detail/Reason, Specific Example' },
    { id: 'body2', title: 'Body 2', percent: 0.25, color: '#e0ffff', guide: 'Topic Sentence, Detail/Reason, Specific Example' },
    { id: 'body3', title: 'Body 3', percent: 0.20, color: '#f0fff0', guide: 'Topic Sentence, Detail/Reason, Specific Example' },
    { id: 'conclusion', title: 'Conclusion', percent: 0.15, color: '#e6e6fa', guide: 'Restate Thesis, Summary, Final Thought' },
  ];

  const globalStats = calculateGlobalScore();

  return (
    <div className="app-container">
      <header>
        <h1>Interactive Writing Assistant</h1>
        <div className="header-controls">
          <div className="target-setting">
            <label>目標総語数: </label>
            <input type="number" value={targetWordCount} onChange={(e) => setTargetWordCount(Number(e.target.value))} min="50" max="500" step="10" />
            <span> words</span>
          </div>

          <div className="scoreboard">
            <div className="score-title">TOTAL SCORE</div>
            <div className="score-value">{globalStats.score} <span className="pt">pt</span></div>
            <div className="score-details">
              🌟 Chunks: {globalStats.usedChunks} | 💎 Advanced: {globalStats.usedAdvanced}
            </div>
          </div>
        </div>
      </header>

      <section className="ocr-section">
        <div className="ocr-controls">
          <input type="file" accept="image/*" capture="environment" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImageUpload} />
          <button className="camera-btn" onClick={() => fileInputRef.current.click()} disabled={isScanning}>
            {isScanning ? '⏳ スキャン中...' : '📸 ノートをカメラで読み込む'}
          </button>
          {scanProgress && <span className="progress-text">{scanProgress}</span>}
        </div>
        {rawText && (
          <div className="raw-text-area">
            <h3>📝 読み取り結果</h3>
            <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} />
            <button className="distribute-btn" onClick={handleDistribute}>✨ 各段落に自動振り分け</button>
          </div>
        )}
      </section>

      <main>
        {sections.map((sec) => {
          const targetForThisSec = Math.round(targetWordCount * sec.percent);
          const sentenceCount = Math.max(1, Math.round(targetForThisSec / 12));
          const currentWords = countWords(texts[sec.id]);
          const feedback = getFeedback(texts[sec.id]);

          return (
            <div key={sec.id} className="paragraph-box" style={{ backgroundColor: sec.color }}>
              <div className="box-header">
                <h2>{sec.title}</h2>
                <span className="word-counter">
                  現在: {currentWords} / 目安: {targetForThisSec} words (約 {sentenceCount} 文)
                </span>
              </div>
              <p className="guide-text">✍️ 書く要素: {sec.guide}</p>
              
              <textarea
                value={texts[sec.id]}
                onChange={(e) => setTexts({ ...texts, [sec.id]: e.target.value })}
                placeholder={`${sec.title} をここに入力...`}
                spellCheck="true" /* 👈 ブラウザ標準の赤い波線スペルチェックがここで効きます */
              />

              <div className="feedback-area">
                {feedback.chunks.map((chunk, idx) => (
                  <span key={idx} className="badge badge-chunk">🌟 Good Phrase: "{chunk}"</span>
                ))}
                {feedback.synonyms.map((syn, idx) => (
                  <span key={idx} className="badge badge-synonym">💡 Hint: "{syn.basic}" ➔ {syn.advanced.join(" / ")}</span>
                ))}
                {feedback.errors.map((err, idx) => (
                  <span key={idx} className="badge badge-error">⚠️ 注意: "{err.wrong}" ➔ 【修正案】{err.correct}</span>
                ))}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}

export default App;