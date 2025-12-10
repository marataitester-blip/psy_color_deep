import React, { useState } from 'react';
import { Sparkles, Moon, Sun, AlertCircle } from 'lucide-react';

interface TarotResponse {
  card_name: string;
  interpretation: string;
  image_url: string;
}

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TarotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userInput: input }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-amber-50 selection:bg-amber-900/30">
      <div className="max-w-4xl mx-auto px-6 py-12">
        
        {/* Header */}
        <header className="text-center mb-16">
          <div className="inline-flex items-center justify-center p-3 mb-6 rounded-full border border-amber-500/20 bg-amber-900/10">
            <Moon className="w-6 h-6 text-amber-500 mr-2" />
            <span className="font-mystic text-amber-500 tracking-widest text-sm">MIRMAG GROQ</span>
            <Sun className="w-6 h-6 text-amber-500 ml-2" />
          </div>
          <h1 className="font-mystic text-5xl md:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-500 to-amber-200 gold-glow mb-4">
            Психологический Портрет
          </h1>
          <p className="text-neutral-400 max-w-lg mx-auto font-light">
            Опишите своё состояние, и ИИ через призму Юнгианской психологии откроет вашу карту Таро.
          </p>
        </header>

        {/* Input Section */}
        <div className="relative z-10 bg-neutral-900/50 backdrop-blur-md border border-amber-500/20 rounded-2xl p-8 shadow-2xl mb-12">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="user-state" className="block text-sm font-mystic text-amber-500/80 mb-2 tracking-wider">
                Ваше Состояние
              </label>
              <textarea
                id="user-state"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Что вас беспокоит? О чём вы думаете? Опишите свои чувства..."
                className="w-full h-32 bg-neutral-950/50 border border-neutral-800 rounded-lg p-4 text-neutral-200 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none transition-all placeholder:text-neutral-700 resize-none"
                disabled={loading}
              />
            </div>
            
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="w-full py-4 bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 text-amber-50 font-mystic tracking-widest rounded-lg transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 border border-amber-400/20"
            >
              {loading ? (
                <>
                  <div className="loader ease-linear rounded-full border-2 border-t-2 border-neutral-200 h-5 w-5"></div>
                  <span>ОБРАБОТКА...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>ПОЛУЧИТЬ ОТВЕТ</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-12 p-4 bg-red-950/30 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-200">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Result Section */}
        {result && !loading && (
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 animate-fade-in">
            {/* Image Card */}
            <div className="relative group perspective">
              <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-30 transition-opacity duration-700"></div>
              <div className="relative bg-neutral-900 border border-amber-500/30 p-2 rounded-xl transform transition-transform duration-500 hover:-translate-y-2">
                <div className="aspect-[2/3] w-full overflow-hidden rounded-lg bg-neutral-950 relative">
                  <img 
                    src={result.image_url} 
                    alt={result.card_name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 ring-1 ring-inset ring-amber-500/20 rounded-lg"></div>
                </div>
                <div className="mt-4 text-center">
                  <h3 className="font-mystic text-2xl text-amber-500">{result.card_name}</h3>
                </div>
              </div>
            </div>

            {/* Text Interpretation */}
            <div className="flex flex-col justify-center space-y-6">
              <div className="prose prose-invert prose-amber max-w-none">
                <h3 className="font-mystic text-xl text-neutral-400 uppercase tracking-widest border-b border-amber-500/20 pb-2 mb-4">
                  Толкование
                </h3>
                <div className="text-lg leading-relaxed text-neutral-300 font-light whitespace-pre-line">
                  {result.interpretation}
                </div>
              </div>
              
              <div className="pt-6 border-t border-amber-500/10">
                <p className="text-xs text-center text-neutral-600 font-mystic uppercase tracking-widest">
                  Сгенерировано AI на основе Юнгианских архетипов
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading Overlay State */}
        {loading && (
          <div className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-sm flex flex-col items-center justify-center">
            <div className="relative">
              <div className="w-24 h-24 border-4 border-amber-900/30 border-t-amber-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-amber-500 animate-pulse" />
              </div>
            </div>
            <p className="mt-8 font-mystic text-xl text-amber-500 animate-pulse tracking-widest">
              GROQ ВЫЧИСЛЯЕТ ВЕРОЯТНОСТИ...
            </p>
            <p className="mt-2 text-sm text-neutral-500">
              Подключение к ноосфере
            </p>
          </div>
        )}

      </div>
    </div>
  );
};

export default App;