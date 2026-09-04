import React from 'react';
import { NavigationStep } from '../utils/route_to_steps';
import { 
  ArrowUp, ArrowRight, ArrowLeft, ArrowUpRight, ArrowUpLeft, 
  CornerUpRight, CornerUpLeft, Undo2, MapPin, CheckCircle2,
  ListStart, Maximize2
} from 'lucide-react';

interface NavigationPanelProps {
  steps: NavigationStep[];
  activeStepIndex: number;
  totalDistance: number;
  etaSeconds: number;
  onClose: () => void;
  onNextStep: () => void;
  onPrevStep: () => void;
  isSimulating: boolean;
  onToggleSimulation: () => void;
}

const getActionIcon = (action: string, size = 20) => {
  switch (action) {
    case 'straight': return <ArrowUp size={size} />;
    case 'slight right': return <ArrowUpRight size={size} />;
    case 'right': return <CornerUpRight size={size} />;
    case 'sharp right': return <ArrowRight size={size} />;
    case 'slight left': return <ArrowUpLeft size={size} />;
    case 'left': return <CornerUpLeft size={size} />;
    case 'sharp left': return <ArrowLeft size={size} />;
    case 'u-turn': return <Undo2 size={size} />;
    case 'elevator': return <Maximize2 size={size} />; 
    case 'escalator': return <ListStart size={size} />; 
    case 'stairs': return <ListStart size={size} />; 
    case 'arrive': return <MapPin size={size} color="#00e676" />;
    default: return <ArrowUp size={size} />;
  }
};

export default function NavigationPanel({ 
  steps, 
  activeStepIndex, 
  totalDistance, 
  etaSeconds,
  onClose,
  onNextStep,
  onPrevStep,
  isSimulating,
  onToggleSimulation
}: NavigationPanelProps) {
  const mins = Math.ceil(etaSeconds / 60);

  return (
    <div 
      className="absolute bottom-4 left-4 right-4 md:right-auto md:w-[350px] z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden transition-transform"
      style={{
        background: 'rgba(10,16,32,0.95)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)'
      }}
    >
      {/* Header */}
      <div className="p-4 border-b shrink-0 flex justify-between items-center" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-600">
            <CheckCircle2 size={18} color="#fff" />
          </div>
          <div>
            <h2 className="text-white font-bold text-sm md:text-base leading-tight">Live Navigation</h2>
            <div className="flex gap-2 text-xs font-semibold mt-0.5">
              <span className="text-green-400">{mins} min</span>
              <span className="text-gray-400">({Math.round(totalDistance)} m)</span>
            </div>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-white bg-white/5 rounded-full p-1.5"
        >
          ✕
        </button>
      </div>

      {/* Active Step Display */}
      <div className="p-4 flex items-center gap-4">
        {steps[activeStepIndex] ? (
          <>
            <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
              {getActionIcon(steps[activeStepIndex].action, 24)}
            </div>
            <div className="flex-1">
              <div className="font-bold text-white text-base leading-snug">
                {steps[activeStepIndex].instruction}
              </div>
              {steps[activeStepIndex].distanceMeters > 0 && (
                <div className="text-sm font-semibold text-blue-300 mt-1">
                  In {steps[activeStepIndex].distanceMeters} meters
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-white">Arrived!</div>
        )}
      </div>
      
      {/* Step Progress indicator */}
      <div className="px-4 pb-2">
        <div className="w-full bg-white/10 rounded-full h-1.5">
          <div 
            className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${((activeStepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Controls Footer */}
      <div className="p-3 border-t shrink-0 flex flex-col gap-2 bg-[#0e1426]/50" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex gap-2">
          <button 
            onClick={onPrevStep} 
            disabled={activeStepIndex === 0}
            className="flex-1 bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:hover:bg-white/10 text-white rounded-lg py-2.5 text-xs font-semibold transition-colors"
          >
            ← Prev
          </button>
          <button 
            onClick={onNextStep} 
            disabled={activeStepIndex === steps.length - 1}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded-lg py-2.5 text-xs font-semibold transition-colors shadow-lg shadow-blue-500/20"
          >
            Next →
          </button>
        </div>
        <button 
          onClick={onToggleSimulation}
          className={`w-full py-2.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
            isSimulating 
              ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30' 
              : 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30'
          }`}
        >
          {isSimulating ? '⏸ Pause Auto-Walk' : '▶ Play Auto-Walk'}
        </button>
      </div>
    </div>
  );
}
