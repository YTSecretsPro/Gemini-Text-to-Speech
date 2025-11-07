import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { pcmToWavBlob, decode } from './utils/audio';
import { SpeakerWaveIcon, SparklesIcon, DownloadIcon, PlayCircleIcon, ChevronDownIcon, CheckIcon } from './components/Icons';

// Updated and correct list of voices available in the Gemini TTS model, sorted alphabetically.
const VOICES = [
    { id: 'achernar', name: 'Achernar' },
    { id: 'achird', name: 'Achird' },
    { id: 'algenib', name: 'Algenib' },
    { id: 'algieba', name: 'Algieba' },
    { id: 'alnilam', name: 'Alnilam' },
    { id: 'aoede', name: 'Aoede' },
    { id: 'autonoe', name: 'Autonoe' },
    { id: 'callirrhoe', name: 'Callirrhoe' },
    { id: 'charon', name: 'Charon' },
    { id: 'despina', name: 'Despina' },
    { id: 'enceladus', name: 'Enceladus' },
    { id: 'erinome', name: 'Erinome' },
    { id: 'fenrir', name: 'Fenrir' },
    { id: 'gacrux', name: 'Gacrux' },
    { id: 'iapetus', name: 'Iapetus' },
    { id: 'kore', name: 'Kore' },
    { id: 'laomedeia', name: 'Laomedeia' },
    { id: 'leda', name: 'Leda' },
    { id: 'orus', name: 'Orus' },
    { id: 'puck', name: 'Puck' },
    { id: 'pulcherrima', name: 'Pulcherrima' },
    { id: 'rasalgethi', name: 'Rasalgethi' },
    { id: 'sadachbia', name: 'Sadachbia' },
    { id: 'sadaltager', name: 'Sadaltager' },
    { id: 'schedar', name: 'Schedar' },
    { id: 'sulafat', name: 'Sulafat' },
    { id: 'umbriel', name: 'Umbriel' },
    { id: 'vindemiatrix', name: 'Vindemiatrix' },
    { id: 'zephyr', name: 'Zephyr' },
    { id: 'zubenelgenubi', name: 'Zubenelgenubi' }
].sort((a, b) => a.name.localeCompare(b.name));


const PREVIEW_TEXT = "Hello, this is a preview of my voice.";

const App: React.FC = () => {
  const [narratorScript, setNarratorScript] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [text, setText] = useState('Hello! I am a friendly AI assistant powered by Gemini. You can type any text here and I will read it aloud for you.');
  const [styleInstructions, setStyleInstructions] = useState('Read aloud in a warm, welcoming tone:');
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0].id);
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(0.0);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVoiceListOpen, setIsVoiceListOpen] = useState(false);
  const [previewLoadingVoiceId, setPreviewLoadingVoiceId] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const voiceSelectorRef = useRef<HTMLDivElement>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

  // Close voice list when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (voiceSelectorRef.current && !voiceSelectorRef.current.contains(event.target as Node)) {
        setIsVoiceListOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handlePreviewVoice = async (voiceId: string) => {
    if (previewLoadingVoiceId) return;
    setPreviewLoadingVoiceId(voiceId);
    setError(null);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: PREVIEW_TEXT }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId } },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) throw new Error('No audio data received for preview.');
      
      const pcmData = decode(base64Audio);
      const wavBlob = pcmToWavBlob(pcmData, { sampleRate: 24000, numChannels: 1, bitsPerSample: 16 });
      const url = URL.createObjectURL(wavBlob);
      const audio = new Audio(url);
      audio.play();
      audio.onended = () => URL.revokeObjectURL(url); // Clean up
    } catch (err: any) {
      console.error('Failed to generate preview:', err);
      setError(`Preview failed: ${err.message}`);
    } finally {
      setPreviewLoadingVoiceId(null);
    }
  };

  const handleAnalyzeScript = async () => {
    if (!narratorScript.trim()) {
        setError('Please paste a script to analyze.');
        return;
    }
    setError(null);
    setIsAnalyzing(true);
    try {
        const prompt = `Analyze the following narrator script and generate a concise 'Style Instruction' for a text-to-speech model. The instruction should capture the script's primary tone, emotion, and intended delivery style. The output should be a single imperative sentence, starting with a verb, similar to 'Read aloud in a warm, welcoming tone:' or 'Speak with a sense of urgency and excitement:'. Do not add any other explanatory text, quotes, or preamble.

Here is the script:
---
${narratorScript}
---
Style Instruction:`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });

        const newStyle = response.text.trim();
        setStyleInstructions(newStyle);

    } catch (err: any) {
        console.error('Failed to analyze script:', err);
        setError(`Analysis failed: ${err.message}`);
    } finally {
        setIsAnalyzing(false);
    }
  };


  const handleGenerateSpeech = async () => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      setError('Please enter some text to generate speech.');
      return;
    }
    
    setError(null);
    setAudioUrl(null);
    setIsLoading(true);

    const fullPrompt = styleInstructions.trim()
        ? `${styleInstructions.trim()}\n\n${trimmedText}`
        : trimmedText;

    try {
      // Dynamically build speechConfig to avoid sending default rate/pitch values
      const speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: string } };
        rate?: number;
        pitch?: number;
      } = {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: selectedVoice },
        },
      };

      if (speed !== 1.0) {
        speechConfig.rate = speed;
      }
      if (pitch !== 0.0) {
        speechConfig.pitch = pitch;
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: fullPrompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: speechConfig,
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        throw new Error('No audio data received from API.');
      }

      const pcmData = decode(base64Audio);
      const wavBlob = pcmToWavBlob(pcmData, {
        sampleRate: 24000,
        numChannels: 1,
        bitsPerSample: 16,
      });

      const url = URL.createObjectURL(wavBlob);
      setAudioUrl(url);

    } catch (err: any) {
      console.error('Failed to generate speech:', err);
      setError(`An error occurred: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedVoiceName = VOICES.find(v => v.id === selectedVoice)?.name || 'Select Voice';

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        <header className="p-4 border-b border-gray-700 flex items-center justify-center relative">
          <SparklesIcon className="w-6 h-6 text-purple-400 mr-3" />
          <h1 className="text-xl font-bold tracking-wider">Gemini Text-to-Speech</h1>
        </header>

        <main className="p-6">
          <section>
            <h2 className="text-lg font-semibold text-gray-300">1. Analyze Script for Style</h2>
            <p className="text-sm text-gray-400 mb-3">Paste your script, and the AI will suggest style instructions for the narration.</p>
            <div className="space-y-3">
              <textarea
                value={narratorScript}
                onChange={(e) => setNarratorScript(e.target.value)}
                placeholder="Paste your full narrator script here..."
                className="w-full h-40 p-4 bg-gray-700 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:outline-none transition-shadow duration-200"
                aria-label="Full narrator script input"
              />
              <button
                onClick={handleAnalyzeScript}
                disabled={isAnalyzing}
                className="w-full flex items-center justify-center px-6 py-3 bg-indigo-600 rounded-lg font-semibold text-white hover:bg-indigo-700 transition-all duration-300 transform hover:scale-105 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:scale-100 shadow-lg"
              >
                {isAnalyzing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-5 h-5 mr-2" />
                    Analyze Script & Get Style
                  </>
                )}
              </button>
            </div>
          </section>

          <div className="border-t border-gray-700/60 my-6"></div>

          <section>
            <h2 className="text-lg font-semibold text-gray-300">2. Generate Speech</h2>
            
            <div className="mt-4 space-y-4">
              <label htmlFor="style-instructions" className="text-sm font-medium text-gray-400 block">Style Instructions <span className="text-gray-400 font-normal">(Editable)</span></label>
              <textarea
                id="style-instructions"
                value={styleInstructions}
                onChange={(e) => setStyleInstructions(e.target.value)}
                placeholder="e.g., Read aloud in a warm, welcoming tone:"
                className="w-full h-20 p-4 bg-gray-700 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:outline-none transition-shadow duration-200"
                aria-label="Style instructions for the speech"
              />
            </div>
            
            <div className="mt-4 space-y-4">
              <label htmlFor="text-to-generate" className="text-sm font-medium text-gray-400 block">Text to Generate</label>
              <textarea
                id="text-to-generate"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type the text you want to hear..."
                className="w-full h-28 p-4 bg-gray-700 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:outline-none transition-shadow duration-200"
                aria-label="Text to speech input"
              />
            </div>

            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  <div ref={voiceSelectorRef} className="relative">
                      <label className="text-sm font-medium text-gray-400 block mb-2">Voice</label>
                      <button
                          onClick={() => setIsVoiceListOpen(!isVoiceListOpen)}
                          className="w-full flex justify-between items-center bg-gray-700 border border-gray-600 rounded-md py-2 px-3 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                          aria-haspopup="listbox"
                          aria-expanded={isVoiceListOpen}
                      >
                          <span>{selectedVoiceName}</span>
                          <ChevronDownIcon className={`w-5 h-5 transition-transform ${isVoiceListOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isVoiceListOpen && (
                          <ul className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto" role="listbox">
                              {VOICES.map((voice) => (
                                  <li key={voice.id}
                                      className="flex items-center justify-between p-2 hover:bg-purple-600/50 cursor-pointer"
                                      onClick={() => { setSelectedVoice(voice.id); setIsVoiceListOpen(false); }}
                                      role="option"
                                      aria-selected={selectedVoice === voice.id}
                                  >
                                      <div className="flex items-center">
                                          {selectedVoice === voice.id && <CheckIcon className="w-5 h-5 mr-2 text-purple-400" />}
                                          <span className={selectedVoice === voice.id ? 'font-semibold' : 'ml-7'}>{voice.name}</span>
                                      </div>
                                      <button
                                          onClick={(e) => { e.stopPropagation(); handlePreviewVoice(voice.id); }}
                                          disabled={previewLoadingVoiceId === voice.id}
                                          className="p-1 rounded-full hover:bg-gray-600 disabled:cursor-wait"
                                          aria-label={`Preview voice ${voice.name}`}
                                      >
                                          {previewLoadingVoiceId === voice.id ? (
                                             <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                              </svg>
                                          ) : (
                                              <PlayCircleIcon className="w-5 h-5" />
                                          )}
                                      </button>
                                  </li>
                              ))}
                          </ul>
                      )}
                  </div>
                   <div>
                      <label htmlFor="speed-control" className="text-sm font-medium text-gray-400 block mb-2">
                          Speed: <span className="font-mono bg-gray-900 py-1 px-2 rounded-md">{speed.toFixed(2)}x</span>
                      </label>
                      <input
                          id="speed-control"
                          type="range"
                          min="0.5"
                          max="2.0"
                          step="0.05"
                          value={speed}
                          onChange={(e) => setSpeed(parseFloat(e.target.value))}
                          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                  </div>
                   <div className="md:col-span-2">
                      <label htmlFor="pitch-control" className="text-sm font-medium text-gray-400 block mb-2">
                          Pitch: <span className="font-mono bg-gray-900 py-1 px-2 rounded-md">{pitch.toFixed(1)}</span>
                      </label>
                      <input
                          id="pitch-control"
                          type="range"
                          min="-20.0"
                          max="20.0"
                          step="0.5"
                          value={pitch}
                          onChange={(e) => setPitch(parseFloat(e.target.value))}
                          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                  </div>
              </div>
            </div>

             <div className="mt-6">
               <button
                  onClick={handleGenerateSpeech}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center px-6 py-3 bg-purple-600 rounded-lg font-semibold text-white hover:bg-purple-700 transition-all duration-300 transform hover:scale-105 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:scale-100 shadow-lg"
              >
                  {isLoading ? (
                  <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Generating...
                  </>
                  ) : (
                  <>
                      <SpeakerWaveIcon className="w-5 h-5 mr-2" />
                      Generate Speech
                  </>
                  )}
              </button>
             </div>
          </section>
        </main>
        
        {error && (
          <div className="px-6 pb-4">
            <p className="text-red-400 bg-red-900/50 p-3 rounded-lg text-center">{error}</p>
          </div>
        )}

        {audioUrl && (
          <footer className="p-6 border-t border-gray-700 bg-gray-800/50">
            <h3 className="text-lg font-semibold text-gray-300 mb-3">Result</h3>
            <div className="flex items-center gap-4">
                <audio ref={audioRef} src={audioUrl} controls className="w-full" aria-label="Generated speech audio player"/>
                <a 
                    href={audioUrl} 
                    download={`gemini-tts-${selectedVoice}.wav`}
                    className="flex-shrink-0 flex items-center justify-center p-3 bg-gray-600 rounded-lg hover:bg-gray-500 transition-colors"
                    aria-label="Download audio file"
                    title="Download audio file"
                >
                    <DownloadIcon className="w-6 h-6"/>
                </a>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};

export default App;
