import { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';
import './App.css';

import grammarRules from './data/grammar_rules.json';
import synonymsVerbs from './data/synonyms_verbs.json';
import synonymsAdjectives from './data/synonyms_adjectives.json';
import chunksIntro from './data/chunks_intro.json';
import chunksBody from './data/chunks_body.json';
import chunksTransitions from './data/chunks_transitions.json';

const allChunks = { ...chunksIntro, ...chunksBody, ...chunksTransitions };
const allSynonyms = { ...synonymsVerbs, ...synonymsAdjectives };
const allErrors = grammarRules;

function App() {
  const [targetWordCount, setTargetWordCount] = useState(150);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  const [rawText, setRawText] = useState('');
  const [texts, setTexts] = useState({ intro: '', body1: '', body2: '', body3: '', conclusion: '' });
  
  // --- 新規追加：現在入力中の段落を記憶するステート ---
  const [activeSection, setActiveSection] = useState('intro');
  // --- 新規追加：日本語検索用のステート ---
  const [searchQuery, setSearchQuery] = useState('');

  const fileInputRef = useRef(null);

  const countWords = (text) => text.trim() ? text.trim().split(/\s+/).filter(w => w !== '').length : 0;

  const calculateGlobalScore = () => {
    let score = 0; let usedChunks = 0; let usedAdvanced = 0;
    const allText = Object.values(texts).join(' ').toLowerCase();

    Object.keys(allChunks).forEach(chunk => {
      if (allText.includes(chunk.toLowerCase())) { usedChunks++; score += 50; }
    });
    Object.values(allSynonyms).forEach(advancedArray => {
      advancedArray.forEach(advWord => {
        if (new RegExp(`\\b${advWord.toLowerCase()}\\b`, 'i').test(allText)) { usedAdvanced++; score += 30; }
      });
    });
    if (countWords(allText) >= targetWordCount && targetWordCount > 0) score += 100;
    return { score, usedChunks, usedAdvanced };
  };

  const getFeedback = (text) => {
    if (!text) return { chunks: [], synonyms: [], errors: [] };
    const lowerText = text.toLowerCase();
    
    const foundChunks = [];
    Object.keys(allChunks).forEach(chunk => {
      if (lowerText.includes(chunk.toLowerCase())) foundChunks.push({ eng: chunk, jpn: allChunks[chunk] });
    });

    const foundSynonyms = [];
    Object.keys(allSynonyms).forEach(basicWord => {
      if (new RegExp(`\\b${basicWord}\\b`, 'i').test(lowerText)) {
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

  // --- 新規追加：日本語から英語チャンクを検索する関数 ---
  const getSearchResults = () => {
    if (!searchQuery) return [];
    return Object.entries(allChunks)
      .filter(([eng, jpn]) => jpn.includes(searchQuery))
      .map(([eng, jpn]) => ({ eng, jpn }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsScanning(true); setScanProgress('読み込み準備中...');
    Tesseract.recognize(file, 'eng', { logger: (m) => { if (m.status === 'recognizing text') setScanProgress(`解析中... ${Math.round(m.progress * 100)}%`); }})
      .then(({ data: { text } }) => { setRawText(text); setIsScanning(false); setScanProgress(''); e.target.value = ''; })
      .catch(err => { console.error(err); setIsScanning(false); setScanProgress('エラーが発生しました。'); });
  };

  const handleDistribute = () => { /* 前回と同じため省略せずそのまま */
    let text = rawText;
    const markers = [
      { id: 'intro', regex: /\[?(intro|introduction)\]?/i }, { id: 'body1', regex: /\[?body\s*1\]?/i },
      { id: 'body2', regex: /\[?body\s*2\]?/i }, { id: 'body3', regex: /\[?body\s*3\]?/i },
      { id: 'conclusion', regex: /\[?(concl|conclusion)\]?/i }
    ];
    let foundIndices = []; let searchStartIndex = 0;
    markers.forEach(marker => {
      const match = text.substring(searchStartIndex).match(marker.regex);
      if (match) {
        foundIndices.push({ id: marker.id, start: searchStartIndex + match.index, contentStart: searchStartIndex + match.index + match[0].length });
        searchStartIndex = searchStartIndex + match.index + match[0].length;
      }
    });
    const newTexts = { ...texts }; 
    for (let i = 0; i < foundIndices.length; i++) {
      newTexts[foundIndices[i].id] = text.substring(foundIndices[i].contentStart, foundIndices[i + 1] ? foundIndices[i + 1].start : text.length).trim();
    }
    setTexts(newTexts); setRawText('');
  };

  const sections = [
    { id: 'intro', title: 'Introduction', percent: 0.15, color: '#ffe4e1', guide: 'Hook, Background, Thesis Statement' },
    { id: 'body1', title: 'Body 1', percent: 0.25, color: '#fffacd', guide: 'Topic Sentence, Detail/Reason, Specific Example' },
    { id: 'body2', title: 'Body 2', percent: 0.25, color: '#e0ffff', guide: 'Topic Sentence, Detail/Reason, Specific Example' },
    { id: 'body3', title: 'Body 3', percent: 0.20, color: '#f0fff0', guide: 'Topic Sentence, Detail/Reason, Specific Example' },
    { id: 'conclusion', title: 'Conclusion', percent: 0.15, color: '#e6e6fa', guide: 'Restate Thesis, Summary, Final Thought' },
  ];

  const globalStats = calculateGlobalScore();
  const searchResults = getSearchResults();
  
  // 現在フォーカスされている段落のフィードバックを取得
  const activeFeedback = getFeedback(texts[activeSection]);
  const activeSectionTitle = sections.find(s => s.id === activeSection)?.title;

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
            <div className="score-details">🌟 Chunks: {globalStats.usedChunks} | 💎 Advanced: {globalStats.usedAdvanced}</div>
          </div>
        </div>
      </header>

      {/* OCRセクションはそのまま上に配置 */}
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
            <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} />
            <button className="distribute-btn" onClick={handleDistribute}>✨ 各段落に自動振り分け</button>
          </div>
        )}
      </section>

      {/* --- 新規追加：エディタとサイドバーを左右に分けるレイアウト --- */}
      <div className="workspace-container">
        
        {/* 左側：エディタエリア */}
        <div className="editor-area">
          {sections.map((sec) => {
            const targetForThisSec = Math.round(targetWordCount * sec.percent);
            const currentWords = countWords(texts[sec.id]);

            return (
              <div 
                key={sec.id} 
                // 今入力している段落だけ少し影を濃くして目立たせる
                className={`paragraph-box ${activeSection === sec.id ? 'active-box' : ''}`} 
                style={{ backgroundColor: sec.color }}
              >
                <div className="box-header">
                  <h2>{sec.title}</h2>
                  <span className="word-counter">
                    {currentWords} / {targetForThisSec} words
                  </span>
                </div>
                <p className="guide-text">✍️ {sec.guide}</p>
                <textarea 
                  value={texts[sec.id]} 
                  onChange={(e) => setTexts({ ...texts, [sec.id]: e.target.value })} 
                  onFocus={() => setActiveSection(sec.id)} /* 👈 クリックされたらアクティブに設定 */
                  placeholder={`${sec.title} をここに入力...`} 
                  spellCheck="true" 
                />
              </div>
            );
          })}
        </div>

        {/* 右側：サイドバー（相棒エリア） */}
        <div className="sidebar-area">
          
          {/* 1. 日本語検索アシスト */}
          <div className="sidebar-module search-module">
            <h3>🔍 表現をさがす</h3>
            <p className="search-desc">言いたいことの一部を日本語で入れてみよう（例: 理由, 影響）</p>
            <input 
              type="text" 
              className="search-input"
              placeholder="日本語で検索..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((result, idx) => (
                  <div key={idx} className="search-item">
                    <span className="jpn-text">{result.jpn}</span>
                    {/* コピペさせない！大きく表示して手で打たせる */}
                    <span className="eng-text">➔ <b>{result.eng}</b></span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. リアルタイム・フィードバック */}
          <div className="sidebar-module feedback-module">
            <h3>🤖 {activeSectionTitle} のアドバイス</h3>
            {activeFeedback.chunks.length === 0 && activeFeedback.synonyms.length === 0 && activeFeedback.errors.length === 0 ? (
              <p className="empty-feedback">どんどん書いていこう！入力に合わせてここにアドバイスが出るよ。</p>
            ) : (
              <div className="feedback-list">
                {activeFeedback.chunks.map((chunkObj, idx) => (
                  <div key={idx} className="side-badge side-chunk">
                    🌟 <b>{chunkObj.eng}</b><br/>({chunkObj.jpn}) いい表現！
                  </div>
                ))}
                {activeFeedback.synonyms.map((syn, idx) => (
                  <div key={idx} className="side-badge side-synonym">
                    💡 <b>{syn.basic}</b> ➔ <b>{syn.advanced.join(" / ")}</b><br/>に書き換えてスコアUP！
                  </div>
                ))}
                {activeFeedback.errors.map((err, idx) => (
                  <div key={idx} className="side-badge side-error">
                    ⚠️ <b>{err.wrong}</b><br/>➔ 【修正】<b>{err.correct}</b>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;