import React from 'react';

interface WaterCircleProps {
  percentage: number;
  className?: string;
  totalMl: number;
  goalMl: number;
}

export default function WaterCircle({ percentage, className = '', totalMl, goalMl }: WaterCircleProps) {
  // Constrain percentage between 0 and 100
  const normalizedPercentage = Math.min(100, Math.max(0, percentage));

  // Determine liquid Y translation (from y=100 at 0% to y=0 at 100%)
  // SVG coordinates: y increases downwards, so 100 is bottom, 0 is top
  const liquidY = 100 - normalizedPercentage;

  return (
    <div className={`relative flex flex-col items-center select-none ${className}`} id="water-circle-container">
      {/* Background glow shadow following the user's sleek minimal look */}
      <div 
        className="absolute inset-0 bg-blue-500/10 rounded-full filter blur-xl transition-all duration-1000 scale-90 pointer-events-none"
        style={{ opacity: normalizedPercentage / 100 }}
      />
      
      {/* Circle Container */}
      <div className="relative w-48 h-48 rounded-full p-1 bg-slate-900 border-4 border-slate-800 shadow-[inset_0_4px_12px_rgba(0,0,0,0.5),0_8px_20px_rgba(37,99,235,0.15)] overflow-hidden">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full rounded-full"
          id="water-circle-svg"
        >
          <defs>
            {/* Front Water deep gradient - sleek sky/blue style matching reference image */}
            <linearGradient id="circle-water-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.95" /> {/* Cyan-400 */}
              <stop offset="40%" stopColor="#0ea5e9" stopOpacity="0.95" /> {/* Sky-500 */}
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.95" /> {/* Blue-600 */}
            </linearGradient>

            {/* Back Water gradient for second wave layer (darker blue) */}
            <linearGradient id="circle-water-back-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.7" /> {/* Sky-600 */}
              <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.85" /> {/* Blue-900 */}
            </linearGradient>

            {/* Inner shadows gradient */}
            <radialGradient id="ring-glow" cx="50%" cy="50%" r="50%">
              <stop offset="70%" stopColor="#000000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.6" />
            </radialGradient>

            {/* Clip path to force everything inside a perfect circle */}
            <clipPath id="circle-mask">
              <circle cx="50" cy="50" r="48" />
            </clipPath>
          </defs>

          {/* Local CSS styles for fluid SVG wave animation */}
          <style>{`
            @keyframes wave-move-front {
              0% { transform: translateX(0px); }
              100% { transform: translateX(-120px); }
            }
            @keyframes wave-move-back {
              0% { transform: translateX(-80px); }
              100% { transform: translateX(40px); }
            }
            @keyframes bubble-rise-circle {
              0% { transform: translateY(100px) translateX(0px); opacity: 0; }
              10% { opacity: 0.6; }
              90% { opacity: 0.3; }
              100% { transform: translateY(var(--rise-height, 10px)) translateX(var(--drift, 5px)); opacity: 0; }
            }
            .circle-wave-front {
              animation: wave-move-front 4s linear infinite;
            }
            .circle-wave-back {
              animation: wave-move-back 6s linear infinite;
            }
            .circle-bubble {
              animation: bubble-rise-circle var(--duration, 4s) ease-in infinite;
            }
          `}</style>

          {/* Dark inner backing circle */}
          <circle cx="50" cy="50" r="48" fill="#0b1329" />

          {/* MASKED LIQUID LAYERS */}
          <g clipPath="url(#circle-mask)">
            
            {/* BACK WAVE (Moves in opposite direction & slower for depth) */}
            <path
              d="M -60,0 
                 Q -30,-4 0,0 
                 T 30,0 
                 T 60,0 
                 T 90,0 
                 T 120,0 
                 T 150,0 
                 T 180,0 
                 T 210,0
                 T 240,0
                 L 240,110 
                 L -60,110 
                 Z"
              fill="url(#circle-water-back-grad)"
              className="circle-wave-back"
              style={{
                transform: `translateY(${liquidY}px)`,
                transition: 'transform 1s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />

            {/* Rising Bubbles */}
            {normalizedPercentage > 3 && (
              <g id="circle-bubbles-layer">
                <circle cx="30" cy="0" r="1.2" className="circle-bubble fill-cyan-200" style={{ '--rise-height': `${liquidY + 8}px`, '--drift': '-6px', '--duration': '3.2s', delay: '0s' } as React.CSSProperties} />
                <circle cx="45" cy="0" r="1.5" className="circle-bubble fill-white/60" style={{ '--rise-height': `${liquidY + 4}px`, '--drift': '5px', '--duration': '2.5s', delay: '0.4s' } as React.CSSProperties} />
                <circle cx="55" cy="0" r="1.0" className="circle-bubble fill-cyan-100" style={{ '--rise-height': `${liquidY + 12}px`, '--drift': '-3px', '--duration': '4s', delay: '1s' } as React.CSSProperties} />
                <circle cx="68" cy="0" r="1.3" className="circle-bubble fill-white/50" style={{ '--rise-height': `${liquidY + 6}px`, '--drift': '4px', '--duration': '3.5s', delay: '1.8s' } as React.CSSProperties} />
                <circle cx="38" cy="0" r="1.1" className="circle-bubble fill-cyan-200/80" style={{ '--rise-height': `${liquidY + 10}px`, '--drift': '-4px', '--duration': '2.9s', delay: '0.7s' } as React.CSSProperties} />
              </g>
            )}

            {/* FRONT WAVE (Main visible moving wave) */}
            <path
              d="M -60,0 
                 Q -30,-5 0,0 
                 T 30,0 
                 T 60,0 
                 T 90,0 
                 T 120,0 
                 T 150,0 
                 T 180,0 
                 T 210,0
                 T 240,0
                 L 240,110 
                 L -60,110 
                 Z"
              fill="url(#circle-water-grad)"
              className="circle-wave-front"
              style={{
                transform: `translateY(${liquidY}px)`,
                transition: 'transform 1s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
          </g>

          {/* Shadow Overlay for deep outer ring glow inside the circle */}
          <circle cx="50" cy="50" r="48" fill="url(#ring-glow)" pointerEvents="none" />
        </svg>

        {/* Big percentage display right in the center with modern tracking and shadows */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none z-20">
          <span className="text-4xl font-extrabold text-white tracking-tighter drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] font-display">
            {Math.max(0, percentage)}%
          </span>
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest font-mono mt-1 drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
            {totalMl} / {goalMl} ml
          </span>
        </div>
      </div>
    </div>
  );
}
