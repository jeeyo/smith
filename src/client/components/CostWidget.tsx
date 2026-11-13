import React, { useState } from 'react';
import { DollarSign, ChevronDown, BarChart3 } from 'lucide-react';
import { SessionCostSummary } from '../../shared/types.ts';

interface CostWidgetProps {
  costSummary?: SessionCostSummary;
}

export const CostWidget: React.FC<CostWidgetProps> = ({ costSummary }) => {
  const [isOpen, setIsOpen] = useState(false);

  const total = costSummary?.formattedTotal || '$0.00';
  const totalTokens = costSummary?.totalTokens?.toLocaleString() || '0';

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full bg-ink-50 hover:bg-ink-100 text-ink-700 transition-colors"
        title="Session Resource Cost in USD"
      >
        <span className="font-mono text-mint-600">{total} <span className="hidden xs:inline sm:inline">USD</span></span>
        <span className="text-[11px] text-ink-500 font-mono hidden xl:inline">({totalTokens} tokens)</span>
        <ChevronDown className="w-3 h-3 text-ink-500" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 sm:w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-ink-0 shadow-float z-50 p-4">
            <div className="flex items-center justify-between pb-3 border-b border-ink-100">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-ink-600" />
                <span className="text-xs font-semibold text-ink-800 uppercase tracking-wider">USD Cost Breakdown</span>
              </div>
              <span className="text-xs font-mono font-semibold text-mint-600">{total}</span>
            </div>

            <div className="py-3 border-b border-ink-100 space-y-2">
              <div className="flex justify-between text-xs text-ink-600">
                <span>Total Accumulated Tokens:</span>
                <span className="font-mono text-ink-800">{totalTokens}</span>
              </div>
              <div className="flex justify-between text-xs text-ink-600">
                <span>API Billing:</span>
                <span className="text-mint-600 font-medium">$0.00 (Local Subscription)</span>
              </div>
            </div>

            {/* By Agent breakdown */}
            <div className="pt-3">
              <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider mb-2">Cost by Agent</div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {costSummary && Object.values(costSummary.byAgent).length > 0 ? (
                  Object.values(costSummary.byAgent).map(a => (
                    <div key={a.agentId} className="flex items-center justify-between p-2.5 rounded-xl bg-ink-50 text-xs">
                      <div>
                        <div className="font-medium text-ink-800 capitalize">{a.agentId}</div>
                        <div className="text-[10px] text-ink-600 font-mono">{a.model} • {a.usage.totalTokens.toLocaleString()} tokens</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-medium text-mint-600">{a.formattedCost}</div>
                        <div className="text-[10px] text-ink-500">{a.turnCount} turns</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-ink-500 py-1">No agent turns recorded yet.</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
